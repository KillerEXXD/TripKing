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
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, ShieldCheck, Sparkles, TriangleAlert, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useAgent, useAgentKycDocs, useDriver, useDriverKycDocs, useUpdateAgentKyc, useUpdateDriverKyc } from '@/hooks/useDrivers';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { useSetVideoCallStatus } from '@/hooks/useVideoVerification';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatPickupTime } from '@/lib/utils';
import { KYC_LABEL, KYC_VARIANT } from './kycConstants';
import type { Agent, Driver, KycDocs, KycStatus, VerificationStepStatus, Vehicle, VideoOutcome, VideoVerificationStatus } from '@/types';

type Kind = 'driver' | 'agent';

function StepIcon({ status }: { status: VerificationStepStatus }) {
  if (status === 'done') return <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />;
  if (status === 'action_needed') return <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />;
  if (status === 'scheduled') return <Clock3 className="size-5 shrink-0 text-blue-600" aria-hidden />;
  return <Circle className="size-5 shrink-0 text-gray-300" aria-hidden />;
}

function StepSection({ title, why, status, children }: { title: string; why: string; status: VerificationStepStatus; children: React.ReactNode }) {
  const [open, setOpen] = useState(status !== 'done');
  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open ? 'true' : 'false'}
        className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-muted/30"
      >
        <StepIcon status={status} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {title}
            {status === 'scheduled' && <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700">scheduled</span>}
            {status === 'action_needed' && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">action needed</span>}
            {status === 'done' && <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">done</span>}
            {status === 'todo' && <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600">not yet</span>}
          </span>
          <span className="block text-xs text-secondary">{why}</span>
        </span>
        {open ? <ChevronDown className="size-4 shrink-0 self-center text-gray-400" aria-hidden /> : <ChevronRight className="size-4 shrink-0 self-center text-gray-400" aria-hidden />}
      </button>
      {open ? <div className="pb-3 pl-8 pr-1">{children}</div> : null}
    </li>
  );
}

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

function DocumentsPanel({ kind, subjectId }: { kind: Kind; subjectId: string }) {
  const driverQ = useDriverKycDocs(subjectId, kind === 'driver');
  const agentQ = useAgentKycDocs(subjectId, kind === 'agent');
  const q = kind === 'driver' ? driverQ : agentQ;
  if (q.isPending) return <LoadingSkeleton rows={2} />;
  if (q.isError) return <ErrorState title="Couldn't load documents" onRetry={() => void q.refetch()} />;
  const docs = (q.data ?? {}) as KycDocs;
  return (
    <div className="space-y-2">
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
      <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>Re-fetch signed URLs</Button>
    </div>
  );
}

function VehicleField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-secondary">{label}</div>
      <div className="text-sm">{value === undefined || value === null || value === '' ? '—' : value}</div>
    </div>
  );
}

function VehiclePanel({ driverId, mode }: { driverId: string; mode: 'vehicle' | 'photos' }) {
  const q = useDriverVehicles(driverId);
  if (q.isPending) return <LoadingSkeleton rows={2} />;
  if (q.isError) return <ErrorState title="Couldn't load vehicles" onRetry={() => void q.refetch()} />;
  const vehicles = q.data ?? [];
  if (vehicles.length === 0) return <EmptyState title="No vehicle yet" message="The driver hasn't added a vehicle." />;
  const v = (vehicles.find((x) => x.isPrimary) ?? vehicles[0]) as Vehicle;
  if (mode === 'vehicle') {
    return (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{v.makeLabel} {v.modelName} {v.year}</div>
          {v.eligibilityStatus ? (
            <Badge variant={v.eligibilityStatus === 'eligible' ? 'success' : v.eligibilityStatus === 'expiring_soon' ? 'warning' : 'destructive'}>
              {v.eligibilityStatus.replace('_', ' ')}
            </Badge>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <VehicleField label="Plate" value={v.registrationNumber} />
          <VehicleField label="Seats" value={v.seats} />
          <VehicleField label="Type" value={v.carTypeLabel} />
          <VehicleField label="Fuel" value={v.fuelTypeLabel} />
          <VehicleField label="AC" value={v.ac ? 'Yes' : 'No'} />
          <VehicleField label="Insurance exp" value={v.insuranceExpiry} />
        </div>
      </div>
    );
  }
  // photos
  const slots: { label: string; url?: string }[] = [
    { label: 'Front', url: v.photoFrontUrl },
    { label: 'Back', url: v.photoBackUrl },
    { label: 'Left', url: v.photoLeftUrl },
    { label: 'Right', url: v.photoRightUrl },
    { label: 'Plate close-up', url: v.photoPlateUrl },
    { label: 'RC book', url: v.rcBookUrl },
    { label: 'Insurance', url: v.insuranceUrl },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {slots.map((s) => <DocTile key={s.label} label={s.label} url={s.url} />)}
    </div>
  );
}

type AdminVideoStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
const VIDEO_STATUSES: AdminVideoStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show'];
const VIDEO_OUTCOMES: VideoOutcome[] = ['approved', 'rejected', 'resubmit_required'];

function VideoPanel({ verification }: { verification: { videoVerification?: { id: string; status: VideoVerificationStatus; scheduledAt: string; meetingUrl: string; outcome?: VideoOutcome } | null } }) {
  const vv = verification.videoVerification;
  const setStatus = useSetVideoCallStatus();
  const [showAdmin, setShowAdmin] = useState(false);
  const [status, setStatusVal] = useState<AdminVideoStatus | ''>('');
  const [outcome, setOutcomeVal] = useState<VideoOutcome | ''>('');
  const [notes, setNotes] = useState('');

  if (!vv) return <EmptyState title="No video call yet" message="The applicant hasn't booked their video verification slot." />;

  async function save() {
    if (!vv) return;
    if (!status && !outcome && !notes.trim()) {
      toast.error('Pick a status / outcome or add a note');
      return;
    }
    try {
      await setStatus.mutateAsync({
        id: vv.id,
        input: {
          ...(status ? { status } : {}),
          ...(outcome ? { outcome } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      toast.success('Video verification updated');
      setShowAdmin(false);
      setStatusVal('');
      setOutcomeVal('');
      setNotes('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the call");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Video className="size-4 text-blue-600" aria-hidden />
        <span className="font-semibold capitalize">{vv.status.replace('_', ' ')}</span>
        {vv.outcome ? <Badge variant={vv.outcome === 'approved' ? 'success' : vv.outcome === 'rejected' ? 'destructive' : 'warning'}>{vv.outcome.replace('_', ' ')}</Badge> : null}
        <span className="text-xs text-secondary">{formatPickupTime(vv.scheduledAt)}</span>
      </div>
      {vv.meetingUrl ? (
        <a href={vv.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-input bg-background px-3 text-xs font-medium hover:bg-muted">
          Open meeting link
        </a>
      ) : null}
      <div>
        <Link to="/administration/video-calls" className="text-xs font-medium text-primary hover:underline">Open Video Call Console →</Link>
      </div>

      <div className="border-t pt-2">
        <Button size="sm" variant="ghost" onClick={() => setShowAdmin((v) => !v)} aria-expanded={showAdmin ? 'true' : 'false'}>
          {showAdmin ? 'Hide admin override' : 'Override status (admin)'}
        </Button>
        {showAdmin ? (
          <div className="mt-2 space-y-2 rounded-lg border bg-background p-2">
            <p className="text-[11px] text-secondary">Use this for off-platform calls or to correct a mistake. Changing to <strong>completed + approved</strong> auto-promotes the KYC to <em>ready for approval</em>.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs">
                <span className="font-semibold">Status</span>
                <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={status} onChange={(e) => setStatusVal(e.target.value as AdminVideoStatus | '')}>
                  <option value="">— no change —</option>
                  {VIDEO_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-semibold">Outcome</span>
                <select className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={outcome} onChange={(e) => setOutcomeVal(e.target.value as VideoOutcome | '')}>
                  <option value="">— no change —</option>
                  {VIDEO_OUTCOMES.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
                </select>
              </label>
            </div>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (shown to applicant for negative outcomes)" />
            <Button size="sm" onClick={save} disabled={setStatus.isPending}>{setStatus.isPending ? 'Saving…' : 'Save'}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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

function ChecklistCard({ subject, kind }: { subject: SubjectCommon; kind: Kind }) {
  const v = subject.verification;
  if (!v) return <ErrorState title="No verification block" message="The server didn't return a verification summary for this applicant." />;
  const steps = v.steps as Record<string, VerificationStepStatus | undefined>;

  return (
    <Card className="gap-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Verification checklist</h2>
        <span className="text-xs font-semibold text-secondary">{v.stepsDone}/{v.stepsTotal} done</span>
      </header>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={v.stepsDone} aria-valuemin={0} aria-valuemax={v.stepsTotal}>
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${v.stepsTotal ? Math.round((v.stepsDone / v.stepsTotal) * 100) : 0}%` }} />
      </div>
      <ul>
        <StepSection title="Your details" why="Name, phone, home city — collected at sign-up." status={steps.details ?? 'todo'}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <VehicleField label="Full name" value={subject.fullName} />
            <VehicleField label="Phone" value={subject.phone} />
            <VehicleField label="Email" value={subject.email ?? '—'} />
            <VehicleField label="City" value={subject.cityName ?? '—'} />
          </div>
        </StepSection>
        <StepSection title="Identity documents" why={kind === 'driver' ? 'Aadhaar (front & back), driving licence and a selfie.' : 'Aadhaar (front & back) and a selfie.'} status={steps.documents ?? 'todo'}>
          <DocumentsPanel kind={kind} subjectId={subject.id} />
        </StepSection>
        {kind === 'driver' ? (
          <>
            <StepSection title="Vehicle" why="Make, model, year, fuel — and whether it's eligible to drive." status={steps.vehicle ?? 'todo'}>
              <VehiclePanel driverId={subject.id} mode="vehicle" />
            </StepSection>
            <StepSection title="Vehicle photos & papers" why="Front / back / sides / plate, RC book, insurance certificate." status={steps.vehicle_photos ?? 'todo'}>
              <VehiclePanel driverId={subject.id} mode="photos" />
            </StepSection>
          </>
        ) : null}
        <StepSection title="Video verification" why="A live call to match the face to the documents." status={steps.video_call ?? 'todo'}>
          <VideoPanel verification={{ videoVerification: v.videoVerification }} />
        </StepSection>
      </ul>
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
      <ChecklistCard subject={subject} kind={kind} />

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
