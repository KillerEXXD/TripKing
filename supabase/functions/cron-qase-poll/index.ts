/**
 * /cron-qase-poll — polling fallback for Qase plans that don't include webhooks.
 *
 * GET /cron-qase-poll (gated by X-Cron-Key header matching CRON_QASE_KEY env)
 *   1. Calls Qase API GET /v1/defect/<QASE_PROJECT_CODE>?limit=100&include=attachments&order=created_at,desc
 *   2. Filters to defects with id > cron_state.last_seen_id (the watermark).
 *      Falls back to "anything from the last 24h" on first run.
 *   3. For each new defect, calls the shared upsertDefect helper — same code path the
 *      webhook would take, so rows look identical.
 *   4. Bumps the watermark + records a one-line summary in cron_state.last_run_summary.
 *
 * Schedule: call this every ~5 minutes from cron-job.org (or any HTTP-cron service):
 *   URL    = https://saxcbebqxgatiktsebxw.supabase.co/functions/v1/cron-qase-poll
 *   Header = X-Cron-Key: <same value as CRON_QASE_KEY function secret>
 *   Method = GET
 *   Cron   = every 5 minutes (free plan limit on cron-job.org)
 *
 * See docs/QASE_BUG_PIPELINE.md for the full pipeline diagram.
 */
// @ts-expect-error — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { upsertDefect, resolveDefect, type IngestDefect } from '../_shared/qaseDefectIngest.ts';

// @ts-expect-error — Deno-only global at runtime
const DENO_ENV: { get: (k: string) => string | undefined } = (globalThis as Record<string, unknown>).Deno?.env as { get: (k: string) => string | undefined };

const JOB_NAME = 'qase-defect-poll';

interface QaseDefect {
  id: number;
  title?: string;
  actual_result?: string;
  severity?: number | string;
  status?: number | string;
  case_id?: number;
  run_id?: number;
  attachments?: Array<{ url?: string; full_path?: string; file_name?: string; mime_type?: string; size?: number }>;
  custom_field?: Record<string, string>;
  created?: string;
  updated?: string;
}
interface QaseDefectListResponse { status?: boolean; result?: { total?: number; filtered?: number; count?: number; entities?: QaseDefect[] } }

const QASE_SEVERITY_BY_NUM: Record<string, string> = { '0': 'undefined', '1': 'trivial', '2': 'minor', '3': 'normal', '4': 'major', '5': 'critical', '6': 'blocker' };
const QASE_STATUS_BY_NUM: Record<string, string> = { '0': 'undefined', '1': 'open', '2': 'in_progress', '3': 'resolved', '4': 'invalid' };

function severityToString(s: QaseDefect['severity']): string {
  if (typeof s === 'string') return s.toLowerCase();
  return QASE_SEVERITY_BY_NUM[String(s)] ?? 'normal';
}
function statusToString(s: QaseDefect['status']): string {
  if (typeof s === 'string') return s.toLowerCase();
  return QASE_STATUS_BY_NUM[String(s)] ?? 'open';
}
function defectUrl(projectCode: string, id: number): string {
  return `https://app.qase.io/project/${projectCode}/defects/${id}`;
}

const handler = withTiming('cron-qase-poll', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'GET' && req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);

  const sentKey = req.headers.get('x-cron-key') ?? req.headers.get('X-Cron-Key') ?? '';
  const expectedKey = DENO_ENV?.get?.('CRON_QASE_KEY') ?? '';
  if (!expectedKey) return fail('CONFIG_ERROR', 'CRON_QASE_KEY not configured', 500);
  if (sentKey !== expectedKey) return fail('UNAUTHORIZED', 'Bad or missing X-Cron-Key', 401);

  const token = DENO_ENV?.get?.('QASE_API_TOKEN') ?? '';
  const projectCode = DENO_ENV?.get?.('QASE_PROJECT_CODE') ?? '';
  if (!token || !projectCode) return fail('CONFIG_ERROR', 'QASE_API_TOKEN / QASE_PROJECT_CODE not configured', 500);

  const db = serviceClient();

  // Load watermark.
  const { data: state } = await db.from('cron_state').select('last_seen_id').eq('job_name', JOB_NAME).maybeSingle();
  const watermark = typeof state?.last_seen_id === 'number' ? state.last_seen_id : 0;

  // Fetch the latest 100 defects from Qase. Sort descending by id so the page contains
  // anything new since the watermark; we filter client-side.
  const qaseUrl = `https://api.qase.io/v1/defect/${encodeURIComponent(projectCode)}?limit=100&include=attachments`;
  const res = await fetch(qaseUrl, { headers: { 'Token': token, 'Accept': 'application/json' } });
  if (!res.ok) return fail('UPSTREAM_ERROR', `Qase ${res.status}: ${(await res.text()).slice(0, 300)}`, 502);
  const body = (await res.json()) as QaseDefectListResponse;
  const defects = body?.result?.entities ?? [];
  // New (above watermark) only. First run (watermark=0) ingests everything currently on page 1
  // — fine because upsert is idempotent.
  const fresh = defects.filter((d) => typeof d.id === 'number' && d.id > watermark);

  let created = 0, updated = 0, resolved = 0, failed = 0;
  const errors: Array<{ defect_id: number; message: string }> = [];

  for (const d of fresh) {
    const severity = severityToString(d.severity);
    const statusLabel = statusToString(d.status);
    const ingest: IngestDefect = {
      id: d.id,
      title: d.title,
      actual_result: d.actual_result,
      severity,
      status: statusLabel,
      url: defectUrl(projectCode, d.id),
      case_id: d.case_id,
      run_id: d.run_id,
      automation_id: d.custom_field?.automation_id ?? d.custom_field?.['1'] ?? '',
      attachments: (d.attachments ?? []).map((a) => ({
        url: typeof a.full_path === 'string' ? a.full_path : a.url,
        filename: a.file_name,
        mime: a.mime_type,
        size: a.size,
      })),
    };
    try {
      const result = statusLabel === 'resolved'
        ? await resolveDefect(db, String(d.id))
        : await upsertDefect(db, 'cron', ingest);
      if (result.created) created++;
      else if (result.updated) updated++;
      else if (result.resolved) resolved++;
    } catch (e) {
      failed++;
      errors.push({ defect_id: d.id, message: (e as Error).message?.slice(0, 200) ?? 'unknown' });
    }
  }

  // Bump watermark to the max id we saw on this page. (Sorted desc, so defects[0].id.)
  const newWatermark = defects.length > 0 ? Math.max(watermark, ...defects.map((d) => d.id)) : watermark;
  const summary = {
    fetched: defects.length,
    fresh: fresh.length,
    created, updated, resolved, failed,
    errors: errors.slice(0, 10),
    watermark_from: watermark,
    watermark_to: newWatermark,
    polled_at: new Date().toISOString(),
  };

  // Upsert watermark row (works whether or not it existed).
  await db.from('cron_state').upsert({
    job_name: JOB_NAME,
    last_seen_id: newWatermark,
    last_seen_at: new Date().toISOString(),
    last_run_at: new Date().toISOString(),
    last_run_summary: summary,
  }, { onConflict: 'job_name' });

  return ok(summary);
});

serve(handler);
