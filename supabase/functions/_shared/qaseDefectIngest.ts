/**
 * Shared Qase → bug_reports ingest. Used by both:
 *   • `webhook-qase` (POST from Qase, signed) — receives `defect.created` / `defect.updated`
 *     / `defect.resolved` payloads.
 *   • `cron-qase-poll` (polling fallback when the Qase plan doesn't expose webhooks) —
 *     re-shapes Qase /v1/defect rows into the same `IngestDefect` and calls the same path.
 *
 * Why a shared helper: keeps the mapping (severity → priority, attachments → context, title
 * truncation, idempotent upsert on qase_defect_id, admin notification fan-out on first
 * insert only) in one place so both intake paths can't drift.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const QASE_SEVERITY_TO_PRIORITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  blocker: 'critical',
  critical: 'critical',
  major: 'high',
  normal: 'medium',
  minor: 'low',
  trivial: 'low',
};

export interface IngestDefect {
  id: number | string;
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

export interface IngestResult { created?: boolean; updated?: boolean; resolved?: boolean; already?: string; ignored?: true; reason?: string; bug_id?: string; bug_number?: string }

/** Insert-or-update a bug_reports row for the given Qase defect. Idempotent on qase_defect_id. */
export async function upsertDefect(db: SupabaseClient, source: 'webhook' | 'cron', d: IngestDefect): Promise<IngestResult> {
  const qaseDefectId = String(d.id);
  const severity = typeof d.severity === 'string' ? d.severity.toLowerCase() : 'normal';
  const priority = QASE_SEVERITY_TO_PRIORITY[severity] ?? 'medium';
  const automationId = typeof d.automation_id === 'string' ? d.automation_id : '';
  const attachmentsList = Array.isArray(d.attachments) ? d.attachments.filter((a) => typeof a?.url === 'string') : [];
  const attachLines = attachmentsList.map((a) => `- [${a.filename ?? a.url}](${a.url})`).join('\n');
  const stepsParts: string[] = [];
  if (d.description) stepsParts.push(d.description);
  if (d.actual_result) stepsParts.push(`\n**Actual:** ${d.actual_result}`);
  const steps = stepsParts.join('\n');
  const description = [
    automationId ? `Auto-filed from Qase Defect (case **${automationId}**, defect [${qaseDefectId}](${d.url ?? ''})).` : `Auto-filed from Qase Defect [${qaseDefectId}](${d.url ?? ''}).`,
    attachLines ? `\n**Attachments:**\n${attachLines}` : '',
  ].filter(Boolean).join('\n');

  const baseFields = {
    title: (typeof d.title === 'string' ? d.title : `Qase defect ${qaseDefectId}`).slice(0, 280),
    description,
    steps_to_reproduce: steps,
    actual: typeof d.actual_result === 'string' ? d.actual_result : '',
    priority,
    context: {
      source: 'qase',
      qase_source: source,
      qase_defect_id: qaseDefectId,
      qase_defect_url: d.url ?? null,
      qase_case_id: d.case_id ?? null,
      qase_run_id: d.run_id ?? null,
      qase_severity: severity,
      qase_status: d.status ?? null,
      qase_automation_id: automationId || null,
      attachments: attachmentsList,
    },
  };

  const { data: existing } = await db.from('bug_reports').select('id, bug_number').eq('qase_defect_id', qaseDefectId).maybeSingle();
  if (existing) {
    const { error } = await db.from('bug_reports').update(baseFields).eq('id', existing.id);
    if (error) throw error;
    return { updated: true, bug_id: existing.id as string, bug_number: existing.bug_number as string };
  }

  const insert = {
    ...baseFields,
    expected: '',
    category: 'other',
    status: 'open',
    reporter_id: null,
    reporter_role: 'qa_bot',
    reporter_phone: '',
    reporter_name: 'Qase QA Bot',
    page_url: typeof d.url === 'string' ? d.url : '',
    route: automationId,
    browser_info: {},
    app_version: '',
    console_logs: '',
    breadcrumbs: [],
    query_cache_snapshot: [],
    sentry_replay_url: null,
    posthog_session_url: null,
    posthog_session_id: null,
    qase_defect_id: qaseDefectId,
  };
  const { data: created, error } = await db.from('bug_reports').insert(insert).select('id, bug_number').single();
  if (error) throw error;

  await fanOutBugCreatedNotification(db, { bugId: created.id as string, bugNumber: created.bug_number as string, title: baseFields.title, priority, automationId, qaseDefectId });
  return { created: true, bug_id: created.id as string, bug_number: created.bug_number as string };
}

/** Mark a bug as resolved from a Qase defect.resolved event. No-op if already closed. */
export async function resolveDefect(db: SupabaseClient, qaseDefectId: string): Promise<IngestResult> {
  const { data: existing } = await db.from('bug_reports').select('id, bug_number, status').eq('qase_defect_id', qaseDefectId).maybeSingle();
  if (!existing) return { ignored: true, reason: 'no matching bug_report' };
  if (existing.status === 'resolved' || existing.status === 'closed') return { already: existing.status as string, bug_id: existing.id as string };
  const { error } = await db.from('bug_reports').update({ status: 'resolved', resolution_notes: `Resolved in Qase defect ${qaseDefectId}` }).eq('id', existing.id);
  if (error) throw error;
  return { resolved: true, bug_id: existing.id as string, bug_number: existing.bug_number as string };
}

async function fanOutBugCreatedNotification(db: SupabaseClient, args: { bugId: string; bugNumber: string; title: string; priority: string; automationId: string; qaseDefectId: string }): Promise<void> {
  const { data: admins } = await db.from('users').select('id').eq('role', 'admin').eq('is_active', true);
  const adminRows = (admins ?? []) as { id: string }[];
  if (adminRows.length === 0) return;
  const note = adminRows.map((a) => ({
    user_id: a.id,
    type: 'bug_reported',
    title: `New bug from Qase: ${args.bugNumber}`,
    body: `Qase defect — ${args.title}${args.automationId ? ` (case ${args.automationId})` : ''}`,
    payload_json: { bug_id: args.bugId, bug_number: args.bugNumber, priority: args.priority, category: 'other', source: 'qase', qase_defect_id: args.qaseDefectId, qase_automation_id: args.automationId || null },
  }));
  // Best-effort — notification failures must not break the ingest.
  await db.from('notifications').insert(note);
}
