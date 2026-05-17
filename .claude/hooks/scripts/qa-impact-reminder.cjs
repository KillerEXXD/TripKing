#!/usr/bin/env node
/**
 * Stop hook — fires when Claude finishes a turn. If `.claude/qa-impact-queue.jsonl`
 * has unprocessed entries, surfaces a one-line reminder so the user remembers to run
 * `/qa-impact`. Quiet when the queue is empty.
 *
 * Limit: shows AT MOST 4 PR numbers in the reminder body (and a "+ N more" tail) so
 * a runaway backlog doesn't dominate the chat.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.resolve(__dirname, '..', '..', 'qa-impact-queue.jsonl');

try {
  if (!fs.existsSync(QUEUE_FILE)) return; // no queue, nothing to remind
  const lines = fs.readFileSync(QUEUE_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  const pending = [];
  for (const ln of lines) {
    try {
      const e = JSON.parse(ln);
      if (!e.processed && Number.isFinite(e.pr)) pending.push(e);
    } catch { /* skip malformed */ }
  }
  if (pending.length === 0) return;

  // Group by PR number — surface the most-significant action per PR (merge > create).
  const byPr = new Map();
  for (const e of pending) {
    const cur = byPr.get(e.pr);
    if (!cur || (e.action === 'merge' && cur.action !== 'merge')) byPr.set(e.pr, e);
  }
  const uniquePrs = [...byPr.values()].sort((a, b) => b.pr - a.pr);
  const head = uniquePrs.slice(0, 4).map((e) => `#${e.pr} (${e.action})`).join(', ');
  const tail = uniquePrs.length > 4 ? ` + ${uniquePrs.length - 4} more` : '';
  const msg = `\u{1F4CB} ${uniquePrs.length} PR${uniquePrs.length === 1 ? '' : 's'} queued for QA-impact review: ${head}${tail}. Run /qa-impact to process.`;

  // Surface via systemMessage so it appears as a chat-visible reminder, not a hard block.
  process.stdout.write(JSON.stringify({ systemMessage: msg }));
} catch {
  /* never crash — silent fail */
}
