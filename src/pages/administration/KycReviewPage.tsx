import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useInfiniteAgents, useInfiniteDrivers } from '@/hooks/useDrivers';
import { Badge, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { KYC_LABEL, KYC_VARIANT, NEEDS_REVIEW } from './kycConstants';
import type { KycStatus } from '@/types';

type Filter = 'all' | 'needs_review' | KycStatus;
const FILTERS: { value: Filter; label: string; description?: string }[] = [
  { value: 'all', label: 'All', description: 'Every applicant, regardless of KYC status' },
  { value: 'needs_review', label: 'Needs review', description: 'Not yet approved or rejected' },
  { value: 'pending', label: KYC_LABEL.pending },
  { value: 'docs_submitted', label: KYC_LABEL.docs_submitted },
  { value: 'video_pending', label: KYC_LABEL.video_pending },
  { value: 'ready_for_approval', label: KYC_LABEL.ready_for_approval },
  { value: 'resubmit_required', label: KYC_LABEL.resubmit_required },
  { value: 'approved', label: KYC_LABEL.approved },
  { value: 'rejected', label: KYC_LABEL.rejected },
];

function filterToKycStatus(f: Filter): KycStatus | KycStatus[] | undefined {
  if (f === 'all') return undefined;
  if (f === 'needs_review') return NEEDS_REVIEW;
  return f;
}

interface KycEntry {
  id: string;
  name: string;
  subtitle?: string;
  kycStatus: KycStatus;
}

function EntryCard({ entry, kind }: { entry: KycEntry; kind: 'driver' | 'agent' }) {
  const detailHref = `/administration/kyc/${kind}/${entry.id}`;
  return (
    <Link to={detailHref} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-2xl">
      <Card className="flex items-center justify-between gap-3 transition-colors hover:bg-muted/40">
        <div className="min-w-0">
          <div className="truncate font-bold">{entry.name || '—'}</div>
          {entry.subtitle ? <div className="truncate text-xs text-secondary">{entry.subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={KYC_VARIANT[entry.kycStatus]}>{KYC_LABEL[entry.kycStatus]}</Badge>
          <ChevronRight className="size-4 text-secondary" aria-hidden />
        </div>
      </Card>
    </Link>
  );
}

const PAGE_SIZE = 50;

function InfiniteSentinel({ onIntersect, enabled }: { onIntersect: () => void; enabled: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) onIntersect(); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, onIntersect]);
  return <div ref={ref} aria-hidden className="h-1" />;
}

function DriversQueue({ filter, search }: { filter: Filter; search: string }) {
  const query = useInfiniteDrivers({ kycStatus: filterToKycStatus(filter), ...(search ? { search } : {}) }, PAGE_SIZE);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  if (query.isPending) return <LoadingSkeleton rows={4} />;
  if (query.isError) return <ErrorState title="Couldn't load drivers" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  if (rows.length === 0) return <EmptyState title="Nothing here" message={search.trim() ? 'No drivers match that search.' : 'No drivers match this filter.'} />;
  return (
    <div className="space-y-3">
      {rows.map((d) => (
        <EntryCard
          key={d.id}
          kind="driver"
          entry={{ id: d.id, name: d.fullName, subtitle: d.currentCity?.name ?? d.homeCity?.name, kycStatus: d.kycStatus }}
        />
      ))}
      <InfiniteSentinel enabled={!!query.hasNextPage && !query.isFetchingNextPage} onIntersect={() => void query.fetchNextPage()} />
      {query.isFetchingNextPage ? <LoadingSkeleton rows={2} /> : null}
    </div>
  );
}

function AgentsQueue({ filter, search }: { filter: Filter; search: string }) {
  const query = useInfiniteAgents({ kycStatus: filterToKycStatus(filter), ...(search ? { search } : {}) }, PAGE_SIZE);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  if (query.isPending) return <LoadingSkeleton rows={4} />;
  if (query.isError) return <ErrorState title="Couldn't load agents" message="Check your connection and try again." onRetry={() => void query.refetch()} />;
  if (rows.length === 0) return <EmptyState title="Nothing here" message={search.trim() ? 'No agents match that search.' : 'No agents match this filter.'} />;
  return (
    <div className="space-y-3">
      {rows.map((a) => (
        <EntryCard
          key={a.id}
          kind="agent"
          entry={{ id: a.id, name: a.fullName, subtitle: a.businessName ?? a.businessCity?.name, kycStatus: a.kycStatus }}
        />
      ))}
      <InfiniteSentinel enabled={!!query.hasNextPage && !query.isFetchingNextPage} onIntersect={() => void query.fetchNextPage()} />
      {query.isFetchingNextPage ? <LoadingSkeleton rows={2} /> : null}
    </div>
  );
}

/**
 * `/administration/kyc` — the KYC review queue (admin-only). Two-row header:
 * row 1 chooses Drivers/Agents, row 2 filters by KYC status. Each card links to
 * the per-applicant detail page where the admin can drill into each checklist
 * step's evidence and finalize the decision.
 */
export function KycReviewPage() {
  const [subject, setSubject] = useState<'drivers' | 'agents'>('drivers');
  const [filter, setFilter] = useState<Filter>('approved');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">KYC review</h1>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Applicant type">
          {(['drivers', 'agents'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={subject === s ? 'true' : 'false'}
              onClick={() => setSubject(s)}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${subject === s ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'}`}
            >
              {s === 'drivers' ? 'Drivers' : 'Agents'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="KYC status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="tab"
              aria-selected={filter === f.value ? 'true' : 'false'}
              title={f.description}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === f.value ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background hover:bg-muted'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone or email" aria-label="Search KYC queue" />

      {subject === 'drivers' ? <DriversQueue filter={filter} search={debouncedQ} /> : <AgentsQueue filter={filter} search={debouncedQ} />}
    </main>
  );
}

export default KycReviewPage;
