#!/usr/bin/env node
// One-shot Sentry triage for TripKing. Lists unresolved issues in the last 14d
// and emits enough detail for the /sentry skill report. Reads creds from
// .env.development (never hardcode).
//
//   node scripts/sentry-check.cjs               # list issues
//   node scripts/sentry-check.cjs events <ID>   # pull 3 sample events for an issue
//   node scripts/sentry-check.cjs resolve <ID>  # mark issue resolved
require('dotenv').config({ path: '.env.development' });
const ORG = process.env.SENTRY_ORG;
const PRJ = process.env.SENTRY_PROJECT;
const TOK = process.env.SENTRY_AUTH_TOKEN;
if (!ORG || !PRJ || !TOK) {
  console.error('Missing SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN in .env.development');
  process.exit(1);
}
const H = { Authorization: `Bearer ${TOK}`, Accept: 'application/json' };

async function listIssues() {
  const url = `https://sentry.io/api/0/projects/${ORG}/${PRJ}/issues/?query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&limit=50`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(2); }
  const issues = await res.json();
  console.log(JSON.stringify(issues.map((i) => ({
    id: i.id,
    level: i.level,
    title: i.title,
    type: i.metadata?.type,
    value: i.metadata?.value,
    culprit: i.culprit,
    events: i.count,
    users: i.userCount,
    firstSeen: i.firstSeen,
    lastSeen: i.lastSeen,
    permalink: i.permalink,
  })), null, 2));
}

async function issueEvents(id) {
  const res = await fetch(`https://sentry.io/api/0/issues/${id}/events/?limit=3`, { headers: H });
  if (!res.ok) { console.error('HTTP', res.status, await res.text()); process.exit(2); }
  const events = await res.json();
  console.log(JSON.stringify(events.map((e) => ({
    eventID: e.eventID,
    dateCreated: e.dateCreated,
    tags: Object.fromEntries((e.tags ?? []).map((t) => [t.key, t.value])),
    message: e.message,
    request: e.entries?.find((x) => x.type === 'request')?.data,
    breadcrumbs: e.entries?.find((x) => x.type === 'breadcrumbs')?.data?.values?.slice(-5),
    exception: e.entries?.find((x) => x.type === 'exception')?.data?.values?.map((v) => ({
      type: v.type,
      value: v.value,
      frames: (v.stacktrace?.frames ?? []).slice(-5).map((f) => `${f.filename}:${f.lineNo} in ${f.function}`),
    })),
  })), null, 2));
}

async function resolve(id) {
  const res = await fetch(`https://sentry.io/api/0/issues/${id}/`, {
    method: 'PUT',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'resolved' }),
  });
  console.log(res.status, await res.text());
}

const [, , cmd, arg] = process.argv;
if (cmd === 'events' && arg) issueEvents(arg);
else if (cmd === 'resolve' && arg) resolve(arg);
else listIssues();
