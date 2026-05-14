import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { useInfiniteAgents } from '@/hooks/useDrivers';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { initials } from '@/lib/utils';
import { BugReporterToggle } from '@/components/bug/BugReporterToggle';
import type { Agent, KycStatus } from '@/types';

const KYC_BADGE: Record<KycStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  pending: { label: 'Pending', variant: 'muted' },
  docs_submitted: { label: 'Docs in', variant: 'info' },
  video_pending: { label: 'Video pending', variant: 'info' },
  ready_for_approval: { label: 'Ready for approval', variant: 'success' },
  approved: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  resubmit_required: { label: 'Resubmit', variant: 'warning' },
};

type Filter = 'all' | KycStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'docs_submitted', label: 'Docs in' },
  { value: 'video_pending', label: 'Video pending' },
  { value: 'approved', label: 'Verified' },
  { value: 'resubmit_required', label: 'Resubmit' },
  { value: 'rejected', label: 'Rejected' },
];

function AgentCard({ a }: { a: Agent }) {
  const kyc = KYC_BADGE[a.kycStatus] ?? KYC_BADGE.pending;
  const city = a.businessCity?.name;
  return (
    <Card className="gap-2 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <Link to={`/agents/${a.id}`} className="flex flex-1 items-start gap-3 min-w-0">
          {a.profilePhotoUrl ? (
            <img src={a.profilePhotoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary" aria-hidden>
              {a.fullName ? initials(a.fullName) : '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold">{a.fullName || 'Unnamed agent'}</span>
              <Badge variant={kyc.variant}>{kyc.label}</Badge>
            </div>
            <div className="mt-0.5 text-xs text-secondary">
              {a.totalTripsPosted} trip{a.totalTripsPosted === 1 ? '' : 's'} posted
              {city ? ` · ${city}` : ''}
              {a.businessName ? ` · ${a.businessName}` : ''}
            </div>
            <div className="mt-0.5 text-xs text-secondary">
              {a.phone || '—'}
              {a.email ? ` · ${a.email}` : ''}
            </div>
          </div>
        </Link>
        <Link to={`/administration/kyc?agentId=${a.id}`} className="shrink-0 self-center text-xs font-medium text-primary underline">
          KYC →
        </Link>
      </div>
      {a.userId ? (
        <div className="flex justify-end">
          <BugReporterToggle userId={a.userId} initial={a.canReportBugs} />
        </div>
      ) : null}
    </Card>
  );
}

const PAGE_SIZE = 50;

/**
 * `/administration/agents` — read-only admin agents directory. Defaults to "All".
 * Server-paginated via `useInfiniteAgents` (50/page); IntersectionObserver auto-fetches
 * the next page. Header shows the server total.
 */
export function AdminAgentsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const agentsQuery = useInfiniteAgents(filter === 'all' ? undefined : { kycStatus: filter }, PAGE_SIZE);

  const rows = useMemo(() => (agentsQuery.data?.pages.flatMap((p) => p.data) ?? []), [agentsQuery.data]);
  const total = agentsQuery.data?.pages[0]?.meta.total;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (a) =>
        a.fullName.toLowerCase().includes(term) ||
        (a.phone ?? '').toLowerCase().includes(term) ||
        (a.email ?? '').toLowerCase().includes(term) ||
        (a.businessName ?? '').toLowerCase().includes(term),
    );
  }, [rows, q]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !agentsQuery.hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !agentsQuery.isFetchingNextPage) void agentsQuery.fetchNextPage();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [agentsQuery]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Agents</h1>
        {typeof total === 'number' ? <span className="text-sm text-secondary">{total.toLocaleString('en-IN')} total</span> : null}
      </div>
      <p className="text-sm text-secondary">
        Read-only directory. Move an agent through verification in the{' '}
        <Link to="/administration/kyc" className="text-primary underline">
          KYC review queue
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.value ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, email or business" aria-label="Search agents" />

      {agentsQuery.isPending ? (
        <LoadingSkeleton rows={5} />
      ) : agentsQuery.isError ? (
        <ErrorState title="Couldn't load agents" message="Check your connection and try again." onRetry={() => void agentsQuery.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Briefcase className="size-7" />} title="No agents" message={q.trim() ? 'No agents match that search.' : filter === 'all' ? 'No agents yet.' : 'No agents with this KYC status.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <AgentCard key={a.id} a={a} />
          ))}
          <div ref={sentinelRef} aria-hidden className="h-1" />
          {agentsQuery.isFetchingNextPage ? <LoadingSkeleton rows={2} /> : null}
          {!agentsQuery.hasNextPage && rows.length > PAGE_SIZE ? (
            <p className="py-2 text-center text-xs text-secondary">— end of list ({rows.length.toLocaleString('en-IN')} loaded) —</p>
          ) : null}
          {agentsQuery.hasNextPage && !agentsQuery.isFetchingNextPage ? (
            <div className="flex justify-center pt-1">
              <Button size="sm" variant="outline" onClick={() => void agentsQuery.fetchNextPage()}>Load more</Button>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}

export default AdminAgentsPage;
