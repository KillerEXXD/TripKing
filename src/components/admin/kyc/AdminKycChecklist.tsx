/**
 * The admin "verification checklist" card — used both on the dedicated KYC review
 * page (`/app/administration/kyc/:kind/:id`) and embedded on the public profile pages
 * (`/app/drivers/:id` and `/app/agents/:id`) when the viewer is an admin. Five steps for
 * drivers / three for agents, each expandable to show its evidence inline (docs
 * thumbnails via 5-min signed URLs, vehicle info, vehicle photos grid, video
 * verification with an admin status override).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Clock3, TriangleAlert, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useAgentKycDocs, useDriverKycDocs } from '@/hooks/useDrivers';
import { useDriverVehicles, useVehiclePhotoUrls } from '@/hooks/useVehicles';
import { useSetVideoCallStatus } from '@/hooks/useVideoVerification';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatPickupDateTime } from '@/lib/utils';
import type { KycDocs, VerificationStepStatus, Vehicle, VerificationSummary, VideoOutcome, VideoVerificationStatus } from '@/types';

export type AdminKycKind = 'driver' | 'agent';

export interface AdminKycSubject {
  id: string;
  fullName?: string;
  phone?: string;
  email?: string;
  cityName?: string;
  profilePhotoUrl?: string;
  verification?: VerificationSummary;
}

/** True when a `YYYY-MM-DD` date string is strictly before today (browser TZ). Used to flag
 *  DL / insurance / permit expiries that snuck through with a typo'd year (e.g. 1930). */
function isPastDate(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return iso < new Date().toISOString().slice(0, 10);
}

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

function Field({ label, value, tone }: { label: string; value?: string | number | null; tone?: 'danger' }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-secondary">{label}</div>
      <div className={`text-sm${tone === 'danger' ? ' font-semibold text-red-700' : ''}`}>{value === undefined || value === null || value === '' ? '—' : value}</div>
    </div>
  );
}

function DocumentsPanel({ kind, subjectId }: { kind: AdminKycKind; subjectId: string }) {
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
        {kind === 'driver' ? (
          <>
            {' · '}Licence: {docs.driverLicenseNumber ?? '—'}
            {docs.driverLicenseExpiry ? (
              // Red highlight on a past expiry so the admin reviewer can't miss a typo'd
              // year (e.g. 1930) and accidentally approve a row that will then block
              // every apply attempt with "Licence expired".
              <span className={isPastDate(docs.driverLicenseExpiry) ? 'font-semibold text-red-700' : ''}>
                {' '}(exp {docs.driverLicenseExpiry}{isPastDate(docs.driverLicenseExpiry) ? ' — EXPIRED' : ''})
              </span>
            ) : null}
          </>
        ) : null}
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
          <Field label="Plate" value={v.registrationNumber} />
          <Field label="Seats" value={v.seats} />
          <Field label="Type" value={v.carTypeLabel} />
          <Field label="Fuel" value={v.fuelTypeLabel} />
          <Field label="AC" value={v.ac ? 'Yes' : 'No'} />
          <Field
            label="Insurance exp"
            value={v.insuranceExpiry ? `${v.insuranceExpiry}${isPastDate(v.insuranceExpiry) ? ' — EXPIRED' : ''}` : null}
            tone={isPastDate(v.insuranceExpiry) ? 'danger' : undefined}
          />
          {v.permitExpiry ? (
            <Field
              label="Permit exp"
              value={`${v.permitExpiry}${isPastDate(v.permitExpiry) ? ' — EXPIRED' : ''}`}
              tone={isPastDate(v.permitExpiry) ? 'danger' : undefined}
            />
          ) : null}
        </div>
      </div>
    );
  }
  return <VehiclePhotosGrid vehicleId={v.id} />;
}

function VehiclePhotosGrid({ vehicleId }: { vehicleId: string }) {
  const q = useVehiclePhotoUrls(vehicleId);
  if (q.isPending) return <LoadingSkeleton rows={2} />;
  if (q.isError) return <ErrorState title="Couldn't load photos" onRetry={() => void q.refetch()} />;
  const urls = q.data ?? {};
  const slots: { label: string; url?: string | null }[] = [
    { label: 'Front', url: urls.front },
    { label: 'Back', url: urls.back },
    { label: 'Left', url: urls.left },
    { label: 'Right', url: urls.right },
    { label: 'Plate close-up', url: urls.plate },
    { label: 'RC book', url: urls.rc },
    { label: 'Insurance', url: urls.insurance },
  ];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {slots.map((s) => <DocTile key={s.label} label={s.label} url={s.url ?? undefined} />)}
      </div>
      <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>Re-fetch signed URLs</Button>
    </div>
  );
}

type AdminVideoStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
const VIDEO_STATUSES: AdminVideoStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show'];
const VIDEO_OUTCOMES: VideoOutcome[] = ['approved', 'rejected', 'resubmit_required'];

function VideoPanel({ vv }: { vv?: { id: string; status: VideoVerificationStatus; scheduledAt: string; meetingUrl: string; outcome?: VideoOutcome } | null }) {
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
        <span className="text-xs text-secondary">{formatPickupDateTime(vv.scheduledAt)}</span>
      </div>
      {vv.meetingUrl ? (
        <a href={vv.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-input bg-background px-3 text-xs font-medium hover:bg-muted">
          Open meeting link
        </a>
      ) : null}
      <div>
        <Link to="/app/administration/video-calls" className="text-xs font-medium text-primary hover:underline">Open Video Call Console →</Link>
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

export function AdminKycChecklist({ subject, kind }: { subject: AdminKycSubject; kind: AdminKycKind }) {
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
            <Field label="Full name" value={subject.fullName} />
            <Field label="Phone" value={subject.phone} />
            <Field label="Email" value={subject.email ?? '—'} />
            <Field label="City" value={subject.cityName ?? '—'} />
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
          <VideoPanel vv={v.videoVerification} />
        </StepSection>
      </ul>
    </Card>
  );
}

export default AdminKycChecklist;
