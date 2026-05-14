import type { BugReport } from '@/types';

interface CommentMd { userName: string; userRole: string; content: string; createdAt: string }

/** Build the "Copy for Claude" markdown dump — used both in the UI and the test. */
export function buildClaudeMarkdown(b: BugReport, comments: CommentMd[]): string {
  const lines: string[] = [];
  lines.push(`# ${b.bugNumber}: ${b.title}`);
  lines.push('');
  lines.push(`Status: **${b.status}** · Priority: **${b.priority}** · Category: **${b.category}**`);
  lines.push(`Reporter: ${b.reporterName} (${b.reporterRole}) · Phone: ${b.reporterPhone}`);
  lines.push(`Page: \`${b.pageUrl}\` · Route: \`${b.route}\` · App version: ${b.appVersion || 'n/a'}`);
  lines.push(`Created: ${b.createdAt}`);
  if (b.sentryReplayUrl) lines.push(`Sentry replay: ${b.sentryReplayUrl}`);
  if (b.posthogSessionUrl) lines.push(`PostHog replay: ${b.posthogSessionUrl}`);
  lines.push('');
  if (b.description) { lines.push('## Description'); lines.push(b.description); lines.push(''); }
  if (b.stepsToReproduce) { lines.push('## Steps to reproduce'); lines.push('```'); lines.push(b.stepsToReproduce); lines.push('```'); lines.push(''); }
  if (b.expected) { lines.push('## Expected'); lines.push(b.expected); lines.push(''); }
  if (b.actual) { lines.push('## Actual'); lines.push(b.actual); lines.push(''); }
  if (b.consoleLogs) { lines.push('## Console logs'); lines.push('```'); lines.push(b.consoleLogs); lines.push('```'); lines.push(''); }
  if (b.breadcrumbs.length > 0) { lines.push('## Breadcrumbs'); lines.push('```json'); lines.push(JSON.stringify(b.breadcrumbs, null, 2)); lines.push('```'); lines.push(''); }
  if (Object.keys(b.context).length > 0) { lines.push('## Context'); lines.push('```json'); lines.push(JSON.stringify(b.context, null, 2)); lines.push('```'); lines.push(''); }
  if (b.queryCacheSnapshot.length > 0) { lines.push('## Query cache snapshot'); lines.push('```json'); lines.push(JSON.stringify(b.queryCacheSnapshot, null, 2)); lines.push('```'); lines.push(''); }
  if (comments.length > 0) {
    lines.push('## Comments');
    for (const c of comments) lines.push(`- **${c.userName}** (${c.userRole}, ${c.createdAt}): ${c.content}`);
    lines.push('');
  }
  return lines.join('\n');
}
