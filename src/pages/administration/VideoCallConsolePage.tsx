/**
 * `/administration/video-calls` — the admin Video Call Console (admin-only). Lists scheduled KYC
 * video calls; for each, the admin joins the call, ticks the three gates (face match / documents /
 * liveness) and finalizes it. Approving requires all three gates; the subject's `kyc_status` then
 * flips to `approved` (or `rejected` / `resubmit_required`) and a `kyc_status_change` notification fires.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useFinalizeVideoCall, useMarkVideoCallNoShow, useScheduledVideoCalls } from '@/hooks/useVideoVerification';
import { Badge, Button, Card } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { VideoOutcome, VideoVerification, VideoVerificationStatus } from '@/types';

const STATUS_TABS: { value: VideoVerificationStatus[]; label: string }[] = [
  { value: ['scheduled'], label: 'Scheduled' },
  { value: ['completed'], label: 'Completed' },
  { value: ['cancelled', 'no_show', 'failed'], label: 'Cancelled / no-show' },
];

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function subjectOf(vv: VideoVerification) {
  const s = vv.driver ?? vv.manager;
  return { kind: vv.driver ? 'Driver' : 'Trip manager', name: s?.fullName ?? '—', phone: s?.phone, city: s?.cityName, kyc: s?.kycStatus };
}

function CallCard({ vv }: { vv: VideoVerification }) {
  const finalize = useFinalizeVideoCall();
  const noShow = useMarkVideoCallNoShow();
  const [open, setOpen] = useState(false);
  const [face, setFace] = useState(false);
  const [docs, setDocs] = useState(false);
  const [live, setLive] = useState(false);
  const [notes, setNotes] = useState('');
  const s = subjectOf(vv);
  const isScheduled = vv.status === 'scheduled';
  const allGates = face && docs && live;
  const busy = finalize.isPending || noShow.isPending;

  async function run(outcome: VideoOutcome) {
    if (outcome === 'approved' && !allGates) return;
    if (outcome !== 'approved' && !notes.trim()) {
      toast.error('Add a note explaining the decision');
      return;
    }
    try {
      await finalize.mutateAsync({ id: vv.id, input: { outcome, faceMatchConfirmed: face, documentsConfirmed: docs, livenessCheckPassed: live, notes: notes.trim() || undefined } });
      toast.success(outcome === 'approved' ? `${s.name} is now verified.` : `${s.name}: ${outcome.replace('_', ' ')}.`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not finalize the call');
    }
  }

  return (
    <Card className="gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{s.name}</div>
          <div className="text-xs text-secondary">{s.kind}{s.city ? ` · ${s.city}` : ''}{s.phone ? ` · ${s.phone}` : ''}</div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-secondary"><CalendarClock className="size-3.5" aria-hidden /> {fmt(vv.scheduledAt)}</div>
        </div>
        <div className="shrink-0 text-right">
          <Badge variant={vv.status === 'scheduled' ? 'info' : vv.outcome === 'approved' ? 'success' : vv.status === 'completed' ? 'warning' : 'muted'}>
            {vv.status === 'completed' && vv.outcome ? vv.outcome.replace('_', ' ') : vv.status}
          </Badge>
        </div>
      </div>

      {!isScheduled && vv.notes ? <p className="text-xs text-secondary">Note: {vv.notes}</p> : null}

      {isScheduled && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {vv.meetingUrl ? (
              <Button size="sm" variant="full" asChild><a href={vv.meetingUrl} target="_blank" rel="noreferrer"><Video className="size-4" aria-hidden /> Join call</a></Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Run call'}</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void noShow.mutateAsync(vv.id).then(() => toast.message('Marked as no-show.')).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed'))}>No-show</Button>
          </div>
          {open && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={face} onChange={(e) => setFace(e.target.checked)} /> Face matches the Aadhaar photo / selfie</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} /> Original documents shown to the camera</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Liveness check passed (turn head / blink)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (required if rejecting or asking for re-submission)" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="full" disabled={!allGates || busy} onClick={() => run('approved')}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run('resubmit_required')}>Ask to re-submit</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => run('rejected')}>Reject</Button>
              </div>
              {!allGates && <p className="text-xs text-secondary">Approve unlocks once all three gates are ticked.</p>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function VideoCallConsolePage() {
  const [tab, setTab] = useState(0);
  const callsQuery = useScheduledVideoCalls({ status: STATUS_TABS[tab].value });
  const calls = (callsQuery.data ?? []) as VideoVerification[];

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Video call console</h1>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t, i) => (
          <button key={t.label} type="button" aria-pressed={tab === i} onClick={() => setTab(i)} className={`rounded-full border px-3 py-1 text-sm font-semibold ${tab === i ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {callsQuery.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : callsQuery.isError ? (
        <ErrorState title="Couldn't load video calls" onRetry={() => void callsQuery.refetch()} />
      ) : calls.length === 0 ? (
        <EmptyState title="Nothing here" message="No video calls match this filter." />
      ) : (
        <div className="space-y-3">{calls.map((vv) => <CallCard key={vv.id} vv={vv} />)}</div>
      )}
    </main>
  );
}

export default VideoCallConsolePage;
