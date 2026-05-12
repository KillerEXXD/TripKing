/**
 * Dependency-free Sentry reporter for edge functions.
 *
 * POSTs a Sentry "envelope" to the project's ingest endpoint, parsed from the
 * `SENTRY_DSN` function secret. No-op when `SENTRY_DSN` is unset (so it's safe
 * to ship before the secret is configured). Fire-and-forget — never blocks or
 * fails the response. The browser app uses the same Sentry project; events from
 * here are tagged `source=edge-fn` so an alert rule can target them.
 *
 * Set the secret with:  npx supabase secrets set SENTRY_DSN=<dsn>
 */

interface ParsedDsn {
  ingestUrl: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | null {
  // https://<publicKey>@<host>/<projectId>
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\/+/, '');
    if (!publicKey || !projectId) return null;
    return { ingestUrl: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, publicKey };
  } catch {
    return null;
  }
}

let _dsn: ParsedDsn | null | undefined;
function dsn(): ParsedDsn | null {
  if (_dsn === undefined) {
    const raw = Deno.env.get('SENTRY_DSN') ?? '';
    _dsn = raw ? parseDsn(raw) : null;
  }
  return _dsn ?? null;
}

const ENVIRONMENT = Deno.env.get('SENTRY_ENVIRONMENT') ?? Deno.env.get('SUPABASE_ENV') ?? 'production';

function eventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ServerErrorContext {
  /** The edge function name (e.g. "trips"). */
  fn: string;
  method?: string;
  path?: string;
  status?: number;
  userId?: string;
  requestId?: string;
}

/** Send an exception to Sentry tagged `source=edge-fn`. Best-effort; returns immediately. */
export function captureServerException(err: unknown, ctx: ServerErrorContext): void {
  const d = dsn();
  if (!d) return;
  const error = err instanceof Error ? err : new Error(typeof err === 'string' ? err : safeStringify(err));
  const id = eventId();
  const header = JSON.stringify({ event_id: id, sent_at: new Date().toISOString() });
  const itemHeader = JSON.stringify({ type: 'event' });
  const event = JSON.stringify({
    event_id: id,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: 'error',
    environment: ENVIRONMENT,
    logger: `edge-fn:${ctx.fn}`,
    server_name: ctx.fn,
    transaction: ctx.path ? `${ctx.method ?? ''} ${ctx.path}`.trim() : ctx.fn,
    tags: { source: 'edge-fn', fn: ctx.fn, http_method: ctx.method, http_status: ctx.status },
    user: ctx.userId ? { id: ctx.userId } : undefined,
    extra: { method: ctx.method, path: ctx.path, status: ctx.status, request_id: ctx.requestId, stack: error.stack },
    exception: { values: [{ type: error.name || 'Error', value: error.message || String(error) }] },
  });
  const body = `${header}\n${itemHeader}\n${event}`;
  try {
    void fetch(d.ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=tripking-edge/1.0, sentry_key=${d.publicKey}`,
      },
      body,
    }).then(
      () => {},
      () => {},
    );
  } catch {
    /* never let reporting throw */
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
