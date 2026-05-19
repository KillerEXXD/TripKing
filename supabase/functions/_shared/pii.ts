/**
 * Anti-disintermediation helpers — gate driver/agent PII (name, phone, email,
 * profile photo) behind a platform action that proves both sides have committed:
 *
 *   • a `trip_acceptances` row from the driver against one of the agent's trips
 *     (any status — applying is the consent gesture);
 *   • an assigned trip between the two parties (status assigned|in_progress|completed);
 *   • the viewer is the target themselves;
 *   • the viewer is an admin.
 *
 * Pre-reveal, every redacted shape carries a stable opaque `display_handle`
 * (column on public.users; migration 022 — format 'A' + 6 hex chars, e.g.
 * "A3E5A6E") so the UI still has a per-user identifier without leaking identity.
 *
 * All redaction is enforced server-side here — never trust the client to hide
 * fields. A client-side hide is trivially defeated by inspecting the network
 * response.
 *
 * The phone-number regex matches Indian mobile numbers (10 digits starting 6-9);
 * the strip/assert helpers run against free-text fields (vacancy notes, trip
 * notes, review body) so users can't smuggle a phone number through.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── phone-number scrubbers ──────────────────────────────────────────────────

const INDIAN_MOBILE_RE = /\b[6-9]\d{9}\b/g;

/** Replace any Indian mobile sequence with a redaction marker. Idempotent. */
export function stripPhones(text: string | null | undefined): string | null {
  if (text == null) return text ?? null;
  return text.replace(INDIAN_MOBILE_RE, '[contact hidden]');
}

/**
 * Throw a `VALIDATION` shaped error when free text contains a phone number.
 * Endpoints catch this and turn it into a `fail('VALIDATION', …, 400)` envelope.
 */
export class PhoneInTextError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`${field} cannot contain phone numbers`);
    this.name = 'PhoneInTextError';
    this.field = field;
  }
}

export function assertNoPhones(text: string | null | undefined, field: string): void {
  if (text == null) return;
  INDIAN_MOBILE_RE.lastIndex = 0;
  if (INDIAN_MOBILE_RE.test(text)) throw new PhoneInTextError(field);
}

// ── reveal predicates (via SQL functions in migration 022) ──────────────────

/**
 * Cache predicate results within one request so we don't re-query the DB once per
 * row. Construct via `revealCache(db)` at the top of an endpoint handler.
 */
export interface RevealCache {
  canRevealDriverUser: (viewerUserId: string, driverUserId: string) => Promise<boolean>;
  canRevealAgentUser: (viewerUserId: string, agentUserId: string) => Promise<boolean>;
}

export function revealCache(db: SupabaseClient): RevealCache {
  const driverCache = new Map<string, boolean>();
  const agentCache = new Map<string, boolean>();
  const adminCache = new Map<string, boolean>();

  async function isAdmin(userId: string): Promise<boolean> {
    if (adminCache.has(userId)) return adminCache.get(userId)!;
    const { data } = await db.from('users').select('role').eq('id', userId).maybeSingle();
    const v = data?.role === 'admin';
    adminCache.set(userId, v);
    return v;
  }

  return {
    async canRevealDriverUser(viewerUserId: string, driverUserId: string): Promise<boolean> {
      if (!viewerUserId || !driverUserId) return false;
      if (viewerUserId === driverUserId) return true;
      const key = `${viewerUserId}->${driverUserId}`;
      if (driverCache.has(key)) return driverCache.get(key)!;
      if (await isAdmin(viewerUserId)) {
        driverCache.set(key, true);
        return true;
      }
      const { data } = await db.rpc('can_reveal_driver', {
        p_viewer: viewerUserId,
        p_driver_user: driverUserId,
      });
      const reveal = data === true;
      driverCache.set(key, reveal);
      return reveal;
    },

    async canRevealAgentUser(viewerUserId: string, agentUserId: string): Promise<boolean> {
      if (!viewerUserId || !agentUserId) return false;
      if (viewerUserId === agentUserId) return true;
      const key = `${viewerUserId}->${agentUserId}`;
      if (agentCache.has(key)) return agentCache.get(key)!;
      if (await isAdmin(viewerUserId)) {
        agentCache.set(key, true);
        return true;
      }
      const { data } = await db.rpc('can_reveal_agent', {
        p_viewer: viewerUserId,
        p_agent_user: agentUserId,
      });
      const reveal = data === true;
      agentCache.set(key, reveal);
      return reveal;
    },
  };
}

// ── row redactors ───────────────────────────────────────────────────────────

/** Subset of `public.drivers` columns + the user's `display_handle`. */
export interface DriverRow {
  id: string;
  user_id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  profile_photo_url?: string | null;
  display_handle?: string | null;
  [k: string]: unknown;
}

/** Subset of `public.trip_managers` columns + the user's `display_handle`. */
export interface AgentRow {
  id: string;
  user_id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  profile_photo_url?: string | null;
  display_handle?: string | null;
  [k: string]: unknown;
}

// `full_name` and `profile_photo_url` are commercial branding in a driver-marketplace —
// drivers WANT prospective trip-posters to recognise them by name + face. Only the actual
// contact channels (`phone`, `email`) stay gated behind reveal, so spam/scrape attempts on
// the public driver list can't pull contactable identifiers.
// (2026-05-19: previously stripped name + photo too; that left the "Invited drivers" panel
// and the invite-picker rendering "Driver A1B2C3D" with no way for the agent to tell who
// they were inviting — the exact UX the marketplace doesn't want.)
const PII_KEYS = ['phone', 'email'] as const;

/**
 * Strip private contact PII (phone + email) from a row when `reveal === false`. Does not
 * mutate the input. Always carries `display_handle`, `full_name`, and `profile_photo_url`
 * through — those are public commercial-branding fields.
 */
export function redactDriver(row: DriverRow, reveal: boolean): DriverRow {
  if (reveal) return row;
  const out: DriverRow = { ...row };
  for (const k of PII_KEYS) delete out[k];
  return out;
}

export function redactAgent(row: AgentRow, reveal: boolean): AgentRow {
  if (reveal) return row;
  const out: AgentRow = { ...row };
  for (const k of PII_KEYS) delete out[k];
  return out;
}

// ── audit ───────────────────────────────────────────────────────────────────

export interface PiiRevealEvent {
  viewer_user_id: string;
  target_user_id: string;
  surface: string;
  trip_id?: string | null;
}

/**
 * Best-effort INSERT into `pii_access_log`. Failures are swallowed — losing an
 * audit row should never break a user-facing GET. Skips self-views and any
 * call with a missing id.
 */
export async function logPiiReveal(
  db: SupabaseClient,
  ev: PiiRevealEvent,
): Promise<void> {
  if (!ev.viewer_user_id || !ev.target_user_id) return;
  if (ev.viewer_user_id === ev.target_user_id) return;
  try {
    await db.from('pii_access_log').insert({
      viewer_user_id: ev.viewer_user_id,
      target_user_id: ev.target_user_id,
      surface: ev.surface,
      trip_id: ev.trip_id ?? null,
    });
  } catch {
    // intentional: audit-row failure must not block the response
  }
}
