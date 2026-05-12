import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAgentKycDocs, useAgents, useDriverKycDocs, useDrivers, useUpdateAgentKyc, useUpdateDriverKyc } from '@/hooks/useDrivers';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { KycDocs, KycStatus } from '@/types';

/** A doc thumbnail (opens the 5-min signed URL in a new tab) or a "not uploaded" placeholder. */
function DocTile({ label, url }: { label: string; url?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold text-secondary">{label}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg border hover:ring-2 hover:ring-primary/40">
          <img src={url} alt={label} className="size-full object-cover" />
        </a>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed text-xs text-secondary">not uploaded</div>
      )}
    </div>
  );
}

function KycDocsViewer({ kind, subjectId }: { kind: 'driver' | 'agent'; subjectId: string }) {
  const driverDocs = useDriverKycDocs(subjectId, kind === 'driver');
  const agentDocs = useAgentKycDocs(subjectId, kind === 'agent');
  const q = kind === 'driver' ? driverDocs : agentDocs;
  if (q.isPending) return <LoadingSkeleton rows={2} />;
  if (q.isError) return <ErrorState title="Couldn't load documents" onRetry={() => void q.refetch()} />;
  const docs = (q.data ?? {}) as KycDocs;
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="text-xs text-secondary">
        Aadhaar: {docs.aadhaarNumberMasked ?? '—'}
        {kind === 'driver' ? ` · Licence: ${docs.driverLicenseNumber ?? '—'}${docs.driverLicenseExpiry ? ` (exp ${docs.driverLicenseExpiry})` : ''}` : ''}
        {docs.kycDocsSubmittedAt ? ` · submitted ${new Date(docs.kycDocsSubmittedAt).toLocaleDateString('en-IN')}` : ''}
      </div>
      <div className={`grid gap-2 ${kind === 'driver' ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <DocTile label="Aadhaar — front" url={docs.aadhaarFrontUrl} />
        <DocTile label="Aadhaar — back" url={docs.aadhaarBackUrl} />
        {kind === 'driver' ? <DocTile label="Driving licence" url={docs.driverLicenseUrl} /> : null}
        <DocTile label="Selfie" url={docs.selfieUrl} />
      </div>
    </div>
  );
}

const KYC_LABEL: Record<KycStatus, string> = {
  pending: 'Pending',
  docs_submitted: 'Docs submitted',
  video_pending: 'Video pending',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmit_required: 'Resubmit required',
};
const KYC_VARIANT: Record<KycStatus, 'success' | 'warning' | 'info' | 'muted' | 'destructive'> = {
  pending: 'muted',
  docs_submitted: 'info',
  video_pending: 'info',
  approved: 'success',
  rejected: 'destructive',
  resubmit_required: 'warning',
};
const NEEDS_REVIEW: KycStatus[] = ['pending', 'docs_submitted', 'video_pending', 'resubmit_required'];
// Transitions an admin can apply (the row of action buttons), shortest-path first.
const ACTIONS: { status: KycStatus; label: string }[] = [
  { status: 'docs_submitted', label: 'Docs in' },
  { status: 'video_pending', label: 'Video call' },
  { status: 'approved', label: 'Approve' },
  { status: 'resubmit_required', label: 'Resubmit' },
  { status: 'rejected', label: 'Reject' },
];
type Filter = 'needs_review' | KycStatus;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'pending', label: KYC_LABEL.pending },
  { value: 'docs_submitted', label: KYC_LABEL.docs_submitted },
  { value: 'video_pending', label: KYC_LABEL.video_pending },
  { value: 'resubmit_required', label: KYC_LABEL.resubmit_required },
  { value: 'approved', label: KYC_LABEL.approved },
  { value: 'rejected', label: KYC_LABEL.rejected },
];

interface KycEntry {
  id: string;
  name: string;
  subtitle?: string;
  kycStatus: KycStatus;
}

function matchesFilter(status: KycStatus, f: Filter): boolean {
  return f === 'needs_review' ? NEEDS_REVIEW.includes(status) : status === f;
}

function EntryCard({ entry, kind, onTransition, pending }: { entry: KycEntry; kind: 'driver' | 'agent'; onTransition: (status: KycStatus) => void; pending: boolean }) {
  const [showDocs, setShowDocs] = useState(false);
  return (
    <Card className="gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{entry.name || '—'}</div>
          {entry.subtitle ? <div className="text-xs text-secondary">{entry.subtitle}</div> : null}
        </div>
        <Badge variant={KYC_VARIANT[entry.kycStatus]}>{KYC_LABEL[entry.kycStatus]}</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setShowDocs((v) => !v)}>{showDocs ? 'Hide documents' : 'View documents'}</Button>
        {ACTIONS.map((a) => (
          <Button key={a.status} size="sm" variant={a.status === 'approved' ? 'full' : a.status === 'rejected' ? 'destructive' : 'outline'} disabled={pending || entry.kycStatus === a.status} onClick={() => onTransition(a.status)}>
            {a.label}
          </Button>
        ))}
      </div>
      {showDocs ? <KycDocsViewer kind={kind} subjectId={entry.id} /> : null}
    </Card>
  );
}

function DriversQueue({ filter }: { filter: Filter }) {
  const driversQuery = useDrivers();
  const updateKyc = useUpdateDriverKyc();
  if (driversQuery.isPending) return <LoadingSkeleton rows={4} />;
  if (driversQuery.isError) return <ErrorState title="Couldn't load drivers" message="Check your connection and try again." onRetry={() => void driversQuery.refetch()} />;
  const rows = (driversQuery.data ?? []).filter((d) => matchesFilter(d.kycStatus, filter));
  if (rows.length === 0) return <EmptyState title="Nothing here" message="No drivers match this filter." />;
  return (
    <div className="space-y-3">
      {rows.map((d) => (
        <EntryCard
          key={d.id}
          kind="driver"
          entry={{ id: d.id, name: d.fullName, subtitle: d.currentCity?.name ?? d.homeCity?.name, kycStatus: d.kycStatus }}
          pending={updateKyc.isPending}
          onTransition={(kycStatus) => updateKyc.mutate({ id: d.id, kycStatus })}
        />
      ))}
    </div>
  );
}

function AgentsQueue({ filter }: { filter: Filter }) {
  const agentsQuery = useAgents();
  const updateKyc = useUpdateAgentKyc();
  if (agentsQuery.isPending) return <LoadingSkeleton rows={4} />;
  if (agentsQuery.isError) return <ErrorState title="Couldn't load agents" message="Check your connection and try again." onRetry={() => void agentsQuery.refetch()} />;
  const rows = (agentsQuery.data ?? []).filter((a) => matchesFilter(a.kycStatus, filter));
  if (rows.length === 0) return <EmptyState title="Nothing here" message="No agents match this filter." />;
  return (
    <div className="space-y-3">
      {rows.map((a) => (
        <EntryCard
          key={a.id}
          kind="agent"
          entry={{ id: a.id, name: a.fullName, subtitle: a.businessName ?? a.businessCity?.name, kycStatus: a.kycStatus }}
          pending={updateKyc.isPending}
          onTransition={(kycStatus) => updateKyc.mutate({ id: a.id, kycStatus })}
        />
      ))}
    </div>
  );
}

/**
 * `/administration/kyc` — the KYC review queue (admin-only). Move drivers and
 * agents through `pending → docs_submitted → video_pending → approved | rejected
 * | resubmit_required` (each transition fires a `kyc_status_change` notification).
 * Video verification calls happen out-of-band — mark "Video call" to flag one.
 */
export function KycReviewPage() {
  const [subject, setSubject] = useState<'drivers' | 'agents'>('drivers');
  const [filter, setFilter] = useState<Filter>('needs_review');

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">KYC review</h1>

      <div className="flex flex-wrap items-center gap-2">
        {(['drivers', 'agents'] as const).map((s) => (
          <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${subject === s ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}>
            {s === 'drivers' ? 'Drivers' : 'Agents'}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-black/10" aria-hidden />
        {FILTERS.map((f) => (
          <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)} className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.value ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {subject === 'drivers' ? <DriversQueue filter={filter} /> : <AgentsQueue filter={filter} />}
    </main>
  );
}

export default KycReviewPage;
