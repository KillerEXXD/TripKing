import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bug, Copy, ExternalLink, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import {
  useBugComments,
  useBugReport,
  useBugReports,
  usePatchBugReport,
  usePostBugComment,
} from '@/hooks/useBugReports';
import { buildClaudeMarkdown } from '@/pages/administration/buildBugMarkdown';
import {
  BUG_CATEGORIES,
  BUG_PRIORITIES,
  BUG_STATUSES,
  type BugCategory,
  type BugPriority,
  type BugReport,
  type BugStatus,
} from '@/types';

const STATUS_TONE: Record<BugStatus, 'muted' | 'info' | 'warning' | 'success' | 'destructive'> = {
  open: 'destructive',
  in_progress: 'warning',
  needs_info: 'info',
  resolved: 'success',
  verified: 'success',
  reopened: 'warning',
  closed: 'muted',
};

const PRIORITY_TONE: Record<BugPriority, 'muted' | 'info' | 'warning' | 'destructive'> = {
  low: 'muted',
  medium: 'info',
  high: 'warning',
  critical: 'destructive',
};

/**
 * `/app/administration/bugs` — admin bug tracker. List + filter on the left,
 * detail side-sheet on the right. URL param `?bugId=` highlights/opens that
 * bug for deep-linking from notifications and the `/bug` slash command.
 */
export function BugsPage() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('bugId') ?? undefined;

  const [status, setStatus] = useState<BugStatus | ''>('');
  const [priority, setPriority] = useState<BugPriority | ''>('');
  const [category, setCategory] = useState<BugCategory | ''>('');
  const [q, setQ] = useState('');

  const filters = useMemo(
    () => ({
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(category ? { category } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
    }),
    [status, priority, category, q],
  );
  const list = useBugReports(filters);

  function selectBug(id: string | undefined) {
    if (id) {
      params.set('bugId', id);
    } else {
      params.delete('bugId');
    }
    setParams(params, { replace: true });
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <Link to="/app/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">Bug tracker</h1>

      <div className="flex flex-wrap gap-2">
        <select aria-label="Status filter" className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={status} onChange={(e) => setStatus(e.target.value as BugStatus | '')}>
          <option value="">All statuses</option>
          {BUG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Priority filter" className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={priority} onChange={(e) => setPriority(e.target.value as BugPriority | '')}>
          <option value="">All priorities</option>
          {BUG_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select aria-label="Category filter" className="rounded-md border border-input bg-background px-2 py-1 text-sm" value={category} onChange={(e) => setCategory(e.target.value as BugCategory | '')}>
          <option value="">All categories</option>
          {BUG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title" className="min-w-[200px] flex-1" aria-label="Search title" />
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <section aria-label="Bug list">
          {list.isPending ? (
            <LoadingSkeleton rows={5} />
          ) : list.isError ? (
            <ErrorState title="Couldn't load bugs" onRetry={() => void list.refetch()} />
          ) : (list.data ?? []).length === 0 ? (
            <EmptyState icon={<Bug className="size-7" />} title="No bugs match" message="Try clearing filters." />
          ) : (
            <ul className="space-y-2">
              {(list.data ?? []).map((b) => <BugRow key={b.id} bug={b} selected={b.id === selectedId} onSelect={() => selectBug(b.id)} />)}
            </ul>
          )}
        </section>
        <aside aria-label="Bug detail" className="min-w-0">
          {selectedId ? <BugDetail id={selectedId} onClose={() => selectBug(undefined)} /> : (
            <Card className="text-sm text-secondary">Pick a bug on the left to see the full report.</Card>
          )}
        </aside>
      </div>
    </main>
  );
}

function BugRow({ bug, selected, onSelect }: { bug: BugReport; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={`w-full rounded-lg border p-3 text-left ${selected ? 'border-primary bg-primary/5' : 'border-input bg-card hover:border-primary/40'}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-secondary">{bug.bugNumber}</span>
          <Badge variant={STATUS_TONE[bug.status]}>{bug.status}</Badge>
          <Badge variant={PRIORITY_TONE[bug.priority]}>{bug.priority}</Badge>
        </div>
        <div className="mt-1 truncate text-sm font-semibold">{bug.title}</div>
        <div className="mt-0.5 text-xs text-secondary">
          {bug.reporterName || bug.reporterPhone || 'Unknown'} · {bug.category} · {new Date(bug.createdAt).toLocaleString('en-IN')}
        </div>
      </button>
    </li>
  );
}

function BugDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useBugReport(id);
  const comments = useBugComments(id);
  const patch = usePatchBugReport();
  const postComment = usePostBugComment(id);
  const [commentDraft, setCommentDraft] = useState('');
  const [resolutionDraft, setResolutionDraft] = useState<string | undefined>(undefined);

  if (detail.isPending) return <LoadingSkeleton rows={6} />;
  if (detail.isError || !detail.data) return <ErrorState title="Couldn't load bug" onRetry={() => void detail.refetch()} />;
  const b = detail.data;
  const resolutionValue = resolutionDraft ?? b.resolutionNotes;

  function copyForClaude() {
    const md = buildClaudeMarkdown(b, comments.data ?? []);
    void navigator.clipboard.writeText(md).then(
      () => toast.success('Copied for Claude'),
      () => toast.error("Couldn't copy"),
    );
  }

  return (
    <Card className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-secondary">{b.bugNumber}</span>
        <Badge variant={STATUS_TONE[b.status]}>{b.status}</Badge>
        <Badge variant={PRIORITY_TONE[b.priority]}>{b.priority}</Badge>
        <h2 className="flex-1 truncate text-base font-bold">{b.title}</h2>
        <button type="button" aria-label="Close detail" onClick={onClose} className="text-secondary hover:text-foreground">
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-secondary">Reporter</dt><dd className="font-mono">{b.reporterName} · {b.reporterPhone}</dd>
        <dt className="text-secondary">Route</dt><dd className="truncate font-mono">{b.route}</dd>
        <dt className="text-secondary">Page</dt><dd className="truncate font-mono">{b.pageUrl}</dd>
        <dt className="text-secondary">App version</dt><dd className="font-mono">{b.appVersion || '—'}</dd>
        <dt className="text-secondary">Created</dt><dd>{new Date(b.createdAt).toLocaleString('en-IN')}</dd>
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-secondary" htmlFor="bug-status-select">Status</label>
        <select
          id="bug-status-select"
          value={b.status}
          disabled={patch.isPending}
          onChange={(e) => void patch.mutateAsync({ id: b.id, status: e.target.value as BugStatus }).catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Update failed'))}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          {BUG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={copyForClaude}>
          <Copy className="size-4" aria-hidden /> Copy for Claude
        </Button>
        {b.sentryReplayUrl ? (
          <a href={b.sentryReplayUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
            <ExternalLink className="size-3" aria-hidden /> Sentry replay
          </a>
        ) : null}
        {b.posthogSessionUrl ? (
          <a href={b.posthogSessionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline">
            <ExternalLink className="size-3" aria-hidden /> PostHog replay
          </a>
        ) : null}
      </div>

      {b.description ? <Section title="Description"><pre className="whitespace-pre-wrap text-xs">{b.description}</pre></Section> : null}
      {b.stepsToReproduce ? <Section title="Steps to reproduce"><pre className="whitespace-pre-wrap font-mono text-xs">{b.stepsToReproduce}</pre></Section> : null}
      {b.expected || b.actual ? (
        <div className="grid grid-cols-2 gap-2">
          {b.expected ? <Section title="Expected"><pre className="whitespace-pre-wrap text-xs">{b.expected}</pre></Section> : null}
          {b.actual ? <Section title="Actual"><pre className="whitespace-pre-wrap text-xs">{b.actual}</pre></Section> : null}
        </div>
      ) : null}

      {b.consoleLogs ? (
        <Section title="Console logs">
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">{b.consoleLogs}</pre>
        </Section>
      ) : null}
      {b.breadcrumbs.length > 0 ? <JsonSection title="Breadcrumbs" data={b.breadcrumbs} /> : null}
      {Object.keys(b.context).length > 0 ? <JsonSection title="Context" data={b.context} /> : null}
      {b.queryCacheSnapshot.length > 0 ? <JsonSection title="Query cache snapshot" data={b.queryCacheSnapshot} /> : null}

      {(b.attachments ?? []).length > 0 ? (
        <Section title="Screenshots">
          <div className="grid grid-cols-3 gap-2">
            {(b.attachments ?? []).map((a) => (
              <a key={a.id} href={a.signedUrl ?? '#'} target="_blank" rel="noreferrer" className="block">
                {a.signedUrl ? (
                  <img src={a.signedUrl} alt={a.fileName} className="h-20 w-full rounded-md object-cover" />
                ) : (
                  <span className="block rounded-md border border-input p-2 text-xs">{a.fileName}</span>
                )}
              </a>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Resolution notes">
        <textarea
          className="h-20 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={resolutionValue}
          onChange={(e) => setResolutionDraft(e.target.value)}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button
            size="sm"
            disabled={patch.isPending || resolutionDraft === undefined || resolutionDraft === b.resolutionNotes}
            onClick={() => void patch.mutateAsync({ id: b.id, resolutionNotes: resolutionDraft ?? '' }).then(
              () => { setResolutionDraft(undefined); toast.success('Saved'); },
              (err: unknown) => toast.error(err instanceof Error ? err.message : 'Save failed'),
            )}
          >
            Save
          </Button>
        </div>
      </Section>

      <Section title={`Comments (${comments.data?.length ?? 0})`}>
        {comments.isPending ? <LoadingSkeleton rows={2} /> : (
          <ul className="space-y-1">
            {(comments.data ?? []).map((c) => (
              <li key={c.id} className="rounded-md border border-input p-2 text-sm">
                <div className="text-xs text-secondary">{c.userName} ({c.userRole}) · {new Date(c.createdAt).toLocaleString('en-IN')}</div>
                <div className="whitespace-pre-wrap">{c.content}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <Input value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Add a comment" aria-label="Add a comment" />
          <Button
            size="sm"
            disabled={!commentDraft.trim() || postComment.isPending}
            onClick={() => {
              const content = commentDraft.trim();
              if (!content) return;
              void postComment.mutateAsync({ content }).then(
                () => { setCommentDraft(''); },
                (err: unknown) => toast.error(err instanceof Error ? err.message : 'Comment failed'),
              );
            }}
          >
            <Send className="size-4" aria-hidden /> Send
          </Button>
        </div>
      </Section>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-secondary">{title}</h3>
      {children}
    </section>
  );
}
function JsonSection({ title, data }: { title: string; data: unknown }) {
  return (
    <Section title={title}>
      <pre className="max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-xs">{JSON.stringify(data, null, 2)}</pre>
    </Section>
  );
}

export default BugsPage;
