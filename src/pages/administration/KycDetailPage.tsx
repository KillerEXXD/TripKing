/**
 * `/administration/kyc/:kind/:id` — admin KYC detail. One expandable section per
 * checklist step (5 for drivers, 3 for agents), each with the evidence inline:
 * docs (signed URL thumbnails), vehicle + photos (driver only), and the video
 * verification (with an admin status-override control). A sticky decision bar
 * lets the admin Approve / Resubmit / Reject — Approve only enabled once the
 * server has moved the row to `ready_for_approval` (all steps green).
 *
 * Status transitions:
 *   pending → docs_submitted → video_pending → ready_for_approval → approved
 *                                                                ↘ rejected
 *                                                                ↘ resubmit_required (→ docs re-upload → docs_submitted)
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAgent, useDriver, useUpdateAgentKyc, useUpdateDriverKyc } from '@/hooks/useDrivers';
import { Badge, Button, Card, Input } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { AdminKycChecklist, type AdminKycKind } from '@/components/admin/kyc/AdminKycChecklist';
import { KYC_LABEL, KYC_VARIANT } from './kycConstants';
import type { Agent, Driver, KycStatus } from '@/types';

type Kind = AdminKycKind;


interface SubjectCommon {
  id: string;
  fullName?: string;
  phone?: string;
  email?: string;
  cityName?: string;
  profilePhotoUrl?: string;
  kycStatus: KycStatus;
  verification?: Driver['verification'];
  kycRejectionReason?: string | null;
}

function DecisionBar({ subject, onSubmit, pending }: { subject: SubjectCommon; onSubmit: (kycStatus: KycStatus, note?: string) => Promise<void>; pending: boolean }) {
  const [reasonFor, setReasonFor] = useState<'rejected' | 'resubmit_required' | null>(null);
  const [note, setNote] = useState('');
  const isReady = subject.kycStatus === 'ready_for_approval';
  const isTerminal = subject.kycStatus === 'approved' || subject.kycStatus === 'rejected';

  async function go(kycStatus: KycStatus) {
    if (kycStatus === 'rejected' || kycStatus === 'resubmit_required') {
      setReasonFor(kycStatus);
      return;
    }
    await onSubmit(kycStatus);
  }
  async function confirm() {
    if (!reasonFor) return;
    if (!note.trim()) { toast.error('Add a short note explaining the decision'); return; }
    await onSubmit(reasonFor, note.trim());
    setReasonFor(null);
    setNote('');
  }

  return (
    <Card className="sticky top-2 z-10 gap-2 border-primary/20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {isReady ? (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2">
          <Sparkles className="size-4 text-emerald-600" aria-hidden />
          <span className="text-sm font-semibold text-emerald-800">Ready for your approval — every checklist step is complete.</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-secondary">
          Current status: <Badge variant={KYC_VARIANT[subject.kycStatus]}>{KYC_LABEL[subject.kycStatus]}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="full" disabled={pending || !isReady} onClick={() => go('approved')}>Approve</Button>
          <Button size="sm" variant="outline" disabled={pending || isTerminal} onClick={() => go('resubmit_required')}>Resubmit</Button>
          <Button size="sm" variant="destructive" disabled={pending || isTerminal} onClick={() => go('rejected')}>Reject</Button>
        </div>
      </div>
      {!isReady && subject.kycStatus !== 'approved' && subject.kycStatus !== 'rejected' ? (
        <p className="text-[11px] text-secondary">Approve unlocks when every step turns green — the server moves the row to <em>ready for approval</em> automatically.</p>
      ) : null}
      {reasonFor ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
          <p className="text-xs font-semibold">{reasonFor === 'rejected' ? 'Reject — note shown to applicant' : 'Resubmit — note shown to applicant'}</p>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why?" autoFocus />
          <div className="flex gap-2">
            <Button size="sm" variant="full" disabled={pending} onClick={confirm}>Confirm {reasonFor === 'rejected' ? 'reject' : 'resubmit'}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setReasonFor(null); setNote(''); }}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function HeaderCard({ subject }: { subject: SubjectCommon }) {
  return (
    <Card className="gap-2">
      <div className="flex items-start gap-3">
        {subject.profilePhotoUrl ? (
          <img src={subject.profilePhotoUrl} alt="" className="size-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-secondary">
            {(subject.fullName ?? '?').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-bold">{subject.fullName ?? '—'}</h1>
            <Badge variant={KYC_VARIANT[subject.kycStatus]}>{KYC_LABEL[subject.kycStatus]}</Badge>
          </div>
          <div className="text-xs text-secondary">
            {[subject.phone, subject.email, subject.cityName].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      </div>
      {subject.kycRejectionReason ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Last reviewer note: “{subject.kycRejectionReason}”</p>
      ) : null}
    </Card>
  );
}

export function KycDetailPage() {
  const { kind: rawKind, id } = useParams<{ kind: string; id: string }>();
  const kind: Kind = rawKind === 'agent' ? 'agent' : 'driver';
  const navigate = useNavigate();

  const driverQ = useDriver(kind === 'driver' ? id : undefined);
  const agentQ = useAgent(kind === 'agent' ? id : undefined);
  const updateDriver = useUpdateDriverKyc();
  const updateAgent = useUpdateAgentKyc();
  const q = kind === 'driver' ? driverQ : agentQ;
  const pending = updateDriver.isPending || updateAgent.isPending;

  if (!id) return <main className="p-6"><ErrorState title="Bad route" message="No applicant id." /></main>;
  if (q.isPending) return <main className="mx-auto max-w-2xl space-y-3 p-6"><LoadingSkeleton rows={6} /></main>;
  if (q.isError) return <main className="mx-auto max-w-2xl p-6"><ErrorState title="Couldn't load applicant" onRetry={() => void q.refetch()} /></main>;
  if (!q.data) return <main className="mx-auto max-w-2xl p-6"><ErrorState title="Not found" /></main>;

  const subject: SubjectCommon = kind === 'driver'
    ? toSubject(q.data as Driver)
    : toSubjectAgent(q.data as Agent);

  async function transition(kycStatus: KycStatus, note?: string) {
    try {
      if (kind === 'driver') await updateDriver.mutateAsync({ id: id as string, kycStatus, note });
      else await updateAgent.mutateAsync({ id: id as string, kycStatus, note });
      toast.success(`Status updated to "${KYC_LABEL[kycStatus]}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update status");
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-3 p-6">
      <button type="button" onClick={() => navigate(-1)} className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to KYC queue
      </button>

      <HeaderCard subject={subject} />
      <DecisionBar subject={subject} onSubmit={transition} pending={pending} />
      <AdminKycChecklist subject={subject} kind={kind} />

      {subject.kycStatus === 'approved' ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <ShieldCheck className="size-5 text-emerald-600" aria-hidden />
          <span className="text-sm font-semibold text-emerald-800">Approved — the applicant can apply to and post trips.</span>
        </div>
      ) : null}

      <Link to={kind === 'driver' ? `/drivers/${subject.id}` : `/agents/${subject.id}`} className="block text-xs font-medium text-primary hover:underline">
        Open public profile →
      </Link>
    </main>
  );
}

function toSubject(d: Driver): SubjectCommon {
  return {
    id: d.id,
    fullName: d.fullName,
    phone: d.phone,
    email: d.email,
    cityName: d.currentCity?.name ?? d.homeCity?.name,
    profilePhotoUrl: d.profilePhotoUrl,
    kycStatus: d.kycStatus,
    verification: d.verification,
    kycRejectionReason: d.verification?.kycRejectionReason ?? null,
  };
}
function toSubjectAgent(a: Agent): SubjectCommon {
  return {
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    email: a.email,
    cityName: a.businessCity?.name,
    profilePhotoUrl: a.profilePhotoUrl,
    kycStatus: a.kycStatus,
    verification: a.verification,
    kycRejectionReason: a.verification?.kycRejectionReason ?? null,
  };
}

export default KycDetailPage;
