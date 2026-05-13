import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { useAgents } from '@/hooks/useDrivers';
import { Badge, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { initials } from '@/lib/utils';
import type { Agent, KycStatus } from '@/types';

const KYC_BADGE: Record<KycStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  pending: { label: 'Pending', variant: 'muted' },
  docs_submitted: { label: 'Docs in', variant: 'info' },
  video_pending: { label: 'Video pending', variant: 'info' },
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
    <Card className="gap-2">
      <div className="flex items-start gap-3">
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
        <Link to={`/administration/kyc?agentId=${a.id}`} className="shrink-0 self-center text-xs font-medium text-primary underline">
          KYC →
        </Link>
      </div>
    </Card>
  );
}

/**
 * `/administration/agents` — read-only admin agents directory. Filter chips drive
 * `useAgents({ kycStatus })` server-side; the search box narrows by name/phone/business
 * client-side. Each row links to the KYC queue filtered to that agent.
 */
export function AdminAgentsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const agentsQuery = useAgents({ ...(filter === 'all' ? {} : { kycStatus: filter }), limit: 200 });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = agentsQuery.data ?? [];
    if (!term) return list;
    return list.filter(
      (a) =>
        a.fullName.toLowerCase().includes(term) ||
        (a.phone ?? '').toLowerCase().includes(term) ||
        (a.email ?? '').toLowerCase().includes(term) ||
        (a.businessName ?? '').toLowerCase().includes(term),
    );
  }, [agentsQuery.data, q]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">Agents</h1>
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
        </div>
      )}
    </main>
  );
}

export default AdminAgentsPage;
