/**
 * /webhook-qase — receives Qase webhook events (defect.created, defect.updated, defect.resolved)
 * and mirrors them into the internal `bug_reports` table so the dev team works in their own
 * tracker instead of having to log into Qase. See docs/QASE_BUG_PIPELINE.md.
 *
 * Auth: HMAC-SHA256 of the raw request body with `QASE_WEBHOOK_SECRET`. Qase sends the digest
 * in the `X-Qase-Signature` header. No Bearer — Qase is a server-to-server caller.
 *
 * Idempotency: `qase_defect_id` is partial-unique on `bug_reports` (migration 052). The handler
 * upserts on that key so Qase retries on transient 5xx never create duplicates, and a later
 * `defect.resolved` payload updates the existing row's status instead of inserting again.
 *
 * Notifications: mirrors the fan-out behaviour of `POST /bug-reports` (admin role gets a
 * `bug_reported` notification) ONLY on the initial insert — repeat updates of the same defect
 * don't re-bell the admins.
 *
 * Routes (at the function root, i.e. /functions/v1/webhook-qase):
 *   POST /webhook-qase          (HMAC) — `event` ∈ {'defect.created','defect.updated','defect.resolved'}
 *   GET  /webhook-qase/health   (public; no signature) — `{ ok: true }`; used for Qase's "test webhook" UI
 */
// @ts-expect-error — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { pgFail } from '../_shared/http.ts';

// @ts-expect-error — Deno-only global at runtime
const DENO_ENV: { get: (k: string) => string | undefined } = (globalThis as Record<string, unknown>).Deno?.env as { get: (k: string) => string | undefined };

const QASE_SEVERITY_TO_PRIORITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  blocker: 'critical',
  critical: 'critical',
  major: 'high',
  normal: 'medium',
  minor: 'low',
  trivial: 'low',
};

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time hex comparison — guards against timing side-channels in signature verify. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface QaseDefectData {
  id?: number | string;
  title?: string;
  description?: string;
  actual_result?: string;
  severity?: string;
  status?: string;
  url?: string;
  case_id?: number | string;
  run_id?: number | string;
  automation_id?: string;
  attachments?: Array<{ url?: string; filename?: string; mime?: string; size?: number }>;
}

const handler = withTiming('webhook-qase', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/webhook-qase/, '') || '/';

  // ── GET /webhook-qase/health (public, no signature; for Qase "test webhook" button) ─────
  if (path === '/health' && req.method === 'GET') return ok({ ok: true });

  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);

  // 1. HMAC verify against the raw body. Pull the body as text BEFORE parsing JSON so the
  //    signature input matches exactly what Qase signed.
  const raw = await req.text();
  const sig = req.headers.get('x-qase-signature') ?? req.headers.get('X-Qase-Signature') ?? '';
  const secret = DENO_ENV?.get?.('QASE_WEBHOOK_SECRET') ?? '';
  if (!secret) return fail('CONFIG_ERROR', 'QASE_WEBHOOK_SECRET not configured on the function', 500);
  if (!sig) return fail('UNAUTHORIZED', 'Missing X-Qase-Signature header', 401);
  const expected = await hmacSha256Hex(secret, raw);
  if (!timingSafeEqualHex(sig.trim(), expected)) return fail('UNAUTHORIZED', 'Signature mismatch', 401);

  // 2. Parse payload.
  let payload: { event?: string; data?: QaseDefectData };
  try { payload = JSON.parse(raw); } catch { return fail('VALIDATION', 'Body is not valid JSON', 400); }
  const event = typeof payload.event === 'string' ? payload.event : '';
  const data = (payload.data ?? {}) as QaseDefectData;
  if (!event.startsWith('defect.')) return ok({ ignored: true, reason: `event=${event} not handled` });
  if (!data.id) return fail('VALIDATION', 'data.id is required', 422);

  const qaseDefectId = String(data.id);
  const db = serviceClient();

  // 3. defect.resolved → close the matching bug if present.
  if (event === 'defect.resolved') {
    const { data: existing } = await db.from('bug_reports').select('id, bug_number, status').eq('qase_defect_id', qaseDefectId).maybeSingle();
    if (!existing) return ok({ ignored: true, reason: 'no matching bug_report' });
    if (existing.status === 'resolved' || existing.status === 'closed') return ok({ already: existing.status, bug_id: existing.id });
    const { error } = await db.from('bug_reports').update({ status: 'resolved', resolution_notes: `Resolved in Qase defect ${qaseDefectId}` }).eq('id', existing.id);
    if (error) return pgFail(error);
    return ok({ resolved: true, bug_id: existing.id, bug_number: existing.bug_number });
  }

  // 4. defect.created / defect.updated → upsert. We assemble the same shape `POST /bug-reports`
  //    would (title, description, priority, context) so admin pages render it identically.
  const severity = typeof data.severity === 'string' ? data.severity.toLowerCase() : 'normal';
  const priority = QASE_SEVERITY_TO_PRIORITY[severity] ?? 'medium';
  const automationId = typeof data.automation_id === 'string' ? data.automation_id : '';
  const stepsParts: string[] = [];
  if (data.description) stepsParts.push(data.description);
  if (data.actual_result) stepsParts.push(`\n**Actual:** ${data.actual_result}`);
  const steps = stepsParts.join('\n');
  const attachmentsList = Array.isArray(data.attachments) ? data.attachments.filter((a) => typeof a?.url === 'string') : [];
  const attachLines = attachmentsList.map((a) => `- [${a.filename ?? a.url}](${a.url})`).join('\n');
  const description = [
    automationId ? `Auto-filed from Qase Defect (case **${automationId}**, defect [${qaseDefectId}](${data.url ?? ''})).` : `Auto-filed from Qase Defect [${qaseDefectId}](${data.url ?? ''}).`,
    attachLines ? `\n**Attachments:**\n${attachLines}` : '',
  ].filter(Boolean).join('\n');

  const insert = {
    title: (typeof data.title === 'string' ? data.title : `Qase defect ${qaseDefectId}`).slice(0, 280),
    description,
    steps_to_reproduce: steps,
    expected: '',
    actual: typeof data.actual_result === 'string' ? data.actual_result : '',
    priority,
    category: 'other',
    status: 'open',
    reporter_id: null,
    reporter_role: 'qa_bot',
    reporter_phone: '',
    reporter_name: 'Qase QA Bot',
    page_url: typeof data.url === 'string' ? data.url : '',
    route: automationId,
    browser_info: {},
    app_version: '',
    console_logs: '',
    breadcrumbs: [],
    context: {
      source: 'qase',
      qase_event: event,
      qase_defect_id: qaseDefectId,
      qase_defect_url: data.url ?? null,
      qase_case_id: data.case_id ?? null,
      qase_run_id: data.run_id ?? null,
      qase_severity: severity,
      qase_status: data.status ?? null,
      qase_automation_id: automationId || null,
      attachments: attachmentsList,
    },
    query_cache_snapshot: [],
    sentry_replay_url: null,
    posthog_session_url: null,
    posthog_session_id: null,
    qase_defect_id: qaseDefectId,
  };

  // Idempotent upsert on qase_defect_id.
  const { data: existing } = await db.from('bug_reports').select('id, bug_number').eq('qase_defect_id', qaseDefectId).maybeSingle();
  if (existing) {
    const { error } = await db.from('bug_reports').update({ title: insert.title, description: insert.description, steps_to_reproduce: insert.steps_to_reproduce, actual: insert.actual, priority: insert.priority, context: insert.context }).eq('id', existing.id);
    if (error) return pgFail(error);
    return ok({ updated: true, bug_id: existing.id, bug_number: existing.bug_number });
  }
  const { data: created, error } = await db.from('bug_reports').insert(insert).select('id, bug_number').single();
  if (error) return pgFail(error);

  // Fan out admin notifications — only on first insert, so defect.updated re-deliveries don't re-bell.
  const { data: admins } = await db.from('users').select('id').eq('role', 'admin').eq('is_active', true);
  const adminRows = (admins ?? []) as { id: string }[];
  if (adminRows.length > 0) {
    const note = adminRows.map((a) => ({
      user_id: a.id,
      type: 'bug_reported',
      title: `New bug from Qase: ${created.bug_number}`,
      body: `Qase defect — ${insert.title}${automationId ? ` (case ${automationId})` : ''}`,
      payload_json: { bug_id: created.id, bug_number: created.bug_number, priority, category: 'other', source: 'qase', qase_defect_id: qaseDefectId, qase_automation_id: automationId || null },
    }));
    // Best-effort — notification failures must not break the webhook ack.
    await db.from('notifications').insert(note);
  }
  return ok({ created: true, bug_id: created.id, bug_number: created.bug_number });
});

serve(handler);
