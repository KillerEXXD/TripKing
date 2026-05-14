#!/usr/bin/env node
/**
 * Bug investigation — pulls the bug_report + comments + attachments by
 * bug_number, plus the reporter's api_metrics in a ±2h window around
 * created_at. Models after scripts/db.cjs for the Management-API SQL pattern.
 *
 *   node scripts/investigate-bug.cjs 12
 *   node scripts/investigate-bug.cjs BUG-012
 */
const { execFileSync } = require('node:child_process');

const PROJECT_REF = 'saxcbebqxgatiktsebxw';

function getAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const ps = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public class Cr { [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CredReadW(string t,int ty,int f,out IntPtr c); [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr c); [StructLayout(LayoutKind.Sequential)] public struct CRED{ public int Flags;public int Type;public string TargetName;public string Comment;public long LastWritten;public int BlobSize;public IntPtr Blob;public int Persist;public int AttrCount;public IntPtr Attrs;public string TargetAlias;public string UserName;} public static string G(string t){ IntPtr p; if(CredReadW(t,1,0,out p)){ CRED c=(CRED)Marshal.PtrToStructure(p,typeof(CRED)); byte[] b=new byte[c.BlobSize]; Marshal.Copy(c.Blob,b,0,c.BlobSize); CredFree(p); return Encoding.UTF8.GetString(b);} return null;} }
"@; [Cr]::G("Supabase CLI:supabase")`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function sql(query) {
  const token = getAccessToken();
  if (!token || !token.startsWith('sbp_')) {
    console.error('No Supabase access token. Run `npx supabase login`, or set SUPABASE_ACCESS_TOKEN.');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (res.status >= 300) throw new Error(`SQL failed [${res.status}]: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

function esc(s) { return String(s).replace(/'/g, "''"); }

function normaliseBugNumber(arg) {
  if (!arg) return null;
  const a = String(arg).trim();
  if (/^BUG-\d+$/i.test(a)) return a.toUpperCase();
  if (/^\d+$/.test(a)) return `BUG-${a.padStart(3, '0')}`;
  return null;
}

async function main() {
  const bugNumber = normaliseBugNumber(process.argv[2]);
  if (!bugNumber) {
    console.error('usage: node scripts/investigate-bug.cjs <BUG-NNN | N>');
    process.exit(2);
  }

  const bugRows = await sql(`select * from public.bug_reports where bug_number = '${esc(bugNumber)}' limit 1;`);
  const bug = Array.isArray(bugRows) ? bugRows[0] : null;
  if (!bug) {
    console.error(`Bug ${bugNumber} not found`);
    process.exit(1);
  }

  const [comments, attachments, metrics] = await Promise.all([
    sql(`select id, user_id, user_name, user_role, content, created_at from public.bug_comments where bug_id = '${esc(bug.id)}' order by created_at asc;`),
    sql(`select id, storage_path, file_name, file_size, content_type, uploaded_by, created_at from public.bug_attachments where bug_id = '${esc(bug.id)}' order by created_at asc;`),
    bug.reporter_id ? sql(
      `select endpoint, method, status, duration_ms, created_at from public.api_metrics
         where user_id = '${esc(bug.reporter_id)}'
           and created_at between (timestamptz '${esc(bug.created_at)}' - interval '2 hours')
                              and (timestamptz '${esc(bug.created_at)}' + interval '2 hours')
         order by created_at desc limit 200;`,
    ) : Promise.resolve([]),
  ]);

  const md = [];
  md.push(`# ${bug.bug_number}: ${bug.title}`);
  md.push('');
  md.push(`Status: **${bug.status}** · Priority: **${bug.priority}** · Category: **${bug.category}**`);
  md.push(`Reporter: ${bug.reporter_name || '?'} (${bug.reporter_role}) · Phone: ${bug.reporter_phone}`);
  md.push(`Page: \`${bug.page_url}\` · Route: \`${bug.route}\` · App version: ${bug.app_version || 'n/a'}`);
  md.push(`Created: ${bug.created_at}`);
  if (bug.sentry_replay_url) md.push(`Sentry replay: ${bug.sentry_replay_url}`);
  if (bug.posthog_session_url) md.push(`PostHog replay: ${bug.posthog_session_url}`);
  md.push('');

  if (bug.description)        { md.push('## Description'); md.push(bug.description); md.push(''); }
  if (bug.steps_to_reproduce) { md.push('## Steps to reproduce'); md.push('```'); md.push(bug.steps_to_reproduce); md.push('```'); md.push(''); }
  if (bug.expected)           { md.push('## Expected'); md.push(bug.expected); md.push(''); }
  if (bug.actual)             { md.push('## Actual'); md.push(bug.actual); md.push(''); }
  if (bug.console_logs)       { md.push('## Console logs'); md.push('```'); md.push(bug.console_logs); md.push('```'); md.push(''); }
  if (bug.breadcrumbs && bug.breadcrumbs.length) {
    md.push('## Breadcrumbs'); md.push('```json'); md.push(JSON.stringify(bug.breadcrumbs, null, 2)); md.push('```'); md.push('');
  }
  if (bug.context && Object.keys(bug.context).length) {
    md.push('## Context'); md.push('```json'); md.push(JSON.stringify(bug.context, null, 2)); md.push('```'); md.push('');
  }
  if (bug.query_cache_snapshot && bug.query_cache_snapshot.length) {
    md.push('## Query cache snapshot'); md.push('```json'); md.push(JSON.stringify(bug.query_cache_snapshot, null, 2)); md.push('```'); md.push('');
  }

  if (Array.isArray(attachments) && attachments.length) {
    md.push(`## Attachments (${attachments.length})`);
    for (const a of attachments) md.push(`- \`${a.storage_path}\` (${a.file_name}, ${a.file_size} bytes, ${a.content_type})`);
    md.push('');
  }

  if (Array.isArray(comments) && comments.length) {
    md.push(`## Comments (${comments.length})`);
    for (const c of comments) md.push(`- **${c.user_name || '?'}** (${c.user_role}, ${c.created_at}): ${c.content}`);
    md.push('');
  }

  if (Array.isArray(metrics) && metrics.length) {
    md.push(`## API metrics — reporter, ±2h around created_at (${metrics.length} rows)`);
    md.push('| time | method | endpoint | status | ms |');
    md.push('|---|---|---|---:|---:|');
    for (const m of metrics) md.push(`| ${m.created_at} | ${m.method} | ${m.endpoint} | ${m.status} | ${m.duration_ms} |`);
    md.push('');
  } else {
    md.push('## API metrics — none in window');
  }

  process.stdout.write(md.join('\n') + '\n');
}

main().catch((e) => {
  console.error('investigate-bug failed:', e.message ?? e);
  process.exit(1);
});
