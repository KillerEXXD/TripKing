#!/usr/bin/env node
/**
 * PostToolUse hook — when a PR is created OR merged via the github MCP, append a
 * row to `.claude/qa-impact-queue.jsonl` so the user can process it later with the
 * `/qa-impact` slash command. NON-BLOCKING: writes the file + returns immediately.
 *
 * Matches:
 *   - mcp__github__create_pull_request
 *   - mcp__github__merge_pull_request
 *
 * Dedupes by (pr_number, action). A second enqueue for the same PR + action
 * replaces the earlier entry's timestamp instead of stacking a duplicate row.
 * `merge` and `create` for the same PR ARE kept separate (each needs an audit).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const QUEUE_FILE = path.resolve(__dirname, '..', '..', 'qa-impact-queue.jsonl');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const evt = JSON.parse(raw || '{}');
    const tool = String(evt.tool_name || '');
    if (!/^mcp__github__(create|merge)_pull_request$/.test(tool)) return;
    const action = tool.includes('create') ? 'create' : 'merge';

    // Pull PR number + url from tool_response. The MCP wraps the JSON in a
    // content[0].text string on some responses — handle both shapes.
    const r = evt.tool_response || {};
    let pr = null;
    let url = '';
    if (typeof r.number === 'number') pr = r.number;
    if (typeof r.url === 'string') url = r.url;
    if (!pr && Array.isArray(r.content) && r.content[0] && typeof r.content[0].text === 'string') {
      try {
        const inner = JSON.parse(r.content[0].text);
        if (typeof inner.number === 'number') pr = inner.number;
        if (typeof inner.url === 'string' && !url) url = inner.url;
      } catch { /* not JSON, ignore */ }
    }
    // Fallback: scan raw text for a PR url pattern.
    if (!pr) {
      const blob = [r.stdout, r.stderr, r.output, r.message, typeof r === 'string' ? r : ''].filter(Boolean).join('\n');
      const m = blob.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/);
      if (m) {
        pr = Number(m[1]);
        if (!url) url = m[0];
      }
    }
    if (!pr) return; // nothing actionable — return silently, don't surface noise

    // Read existing queue, dedupe by (pr, action).
    let lines = [];
    try { lines = fs.readFileSync(QUEUE_FILE, 'utf8').split(/\r?\n/).filter(Boolean); } catch { /* file doesn't exist yet */ }
    const kept = lines.filter((ln) => {
      try {
        const e = JSON.parse(ln);
        if (e.processed) return true; // never drop completed history
        return !(e.pr === pr && e.action === action);
      } catch { return false; }
    });
    kept.push(JSON.stringify({
      pr,
      action,
      url: url || `https://github.com/KillerEXXD/TripKing/pull/${pr}`,
      queuedAt: new Date().toISOString(),
      processed: false,
    }));
    fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
    fs.writeFileSync(QUEUE_FILE, kept.join('\n') + '\n');

    // Quiet acknowledgement — surfaces as a system message in the chat so the user
    // knows the hook fired without being noisy.
    process.stdout.write(JSON.stringify({
      systemMessage: `\u{1F4CB} PR #${pr} (${action}) queued for QA-impact review. Run /qa-impact when ready.`,
    }));
  } catch {
    /* never crash the host turn — swallow + return */
  }
});
