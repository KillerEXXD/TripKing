/**
 * `/verify/video-call` — step 5 of the driver "Get verified" checklist. If a call is scheduled,
 * show the time + a Join link + cancel/reschedule; otherwise (once documents are submitted) pick a
 * free 15-min slot to book one. Booking moves `kyc_status` → video_pending; an admin runs the call.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ShieldCheck, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useMyDriver } from '@/hooks/useDrivers';
import { useAvailableVideoSlots, useBookVideoCall, useCancelVideoCall, useRescheduleVideoCall, useVideoVerification } from '@/hooks/useVideoVerification';
import { Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
      <button type="button" aria-label="Back" onClick={onBack} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <h1 className="text-base font-semibold">Video verification</h1>
    </header>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function SlotPicker({ onPick, disabled }: { onPick: (iso: string) => void; disabled: boolean }) {
  const slotsQuery = useAvailableVideoSlots();
  if (slotsQuery.isPending) return <LoadingSkeleton rows={3} />;
  if (slotsQuery.isError) return <ErrorState title="Couldn't load slots" onRetry={() => slotsQuery.refetch()} />;
  const slots = slotsQuery.data ?? [];
  if (slots.length === 0) return <p className="text-sm text-secondary">No slots available right now — please check back soon.</p>;
  // group by IST calendar day
  const byDay = new Map<string, typeof slots>();
  for (const s of slots) {
    const day = new Date(s.slotAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  return (
    <div className="space-y-3">
      {[...byDay.entries()].map(([day, ds]) => (
        <div key={day}>
          <div className="mb-1.5 text-xs font-semibold text-secondary">{day}</div>
          <div className="flex flex-wrap gap-2">
            {ds.map((s) => (
              <button
                key={s.slotAt}
                type="button"
                disabled={disabled}
                onClick={() => onPick(s.slotAt)}
                className="rounded-full border px-3 py-1.5 text-sm hover:border-primary/60 hover:bg-muted disabled:opacity-50"
              >
                {new Date(s.slotAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BookVideoCallPage() {
  const navigate = useNavigate();
  const driverQuery = useMyDriver();
  const book = useBookVideoCall();
  const cancel = useCancelVideoCall();
  const reschedule = useRescheduleVideoCall();
  const [rescheduling, setRescheduling] = useState(false);

  const vvId = driverQuery.data?.verification?.videoVerification?.id;
  const vvQuery = useVideoVerification(vvId);

  if (driverQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (driverQuery.isError || !driverQuery.data) return <div className="p-6"><ErrorState title="Couldn't load your profile" onRetry={() => driverQuery.refetch()} /></div>;

  const kyc = driverQuery.data.verification?.kycStatus ?? 'pending';
  const vv = vvQuery.data ?? driverQuery.data.verification?.videoVerification ?? null;
  const busy = book.isPending || cancel.isPending || reschedule.isPending;

  async function onBook(iso: string) {
    try { await book.mutateAsync(iso); toast.success('Video call booked.'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not book that slot'); }
  }
  async function onReschedule(iso: string) {
    if (!vvId) return;
    try { await reschedule.mutateAsync({ id: vvId, slotAt: iso }); toast.success('Rescheduled.'); setRescheduling(false); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not reschedule'); }
  }
  async function onCancel() {
    if (!vvId) return;
    try { await cancel.mutateAsync(vvId); toast.success('Cancelled — you can book another slot.'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not cancel'); }
  }

  return (
    <div>
      <Header onBack={() => navigate(-1)} />
      <div className="space-y-4 px-4 py-4">
        {kyc === 'approved' && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <ShieldCheck className="size-4" aria-hidden /> You’re verified — nothing more to do here.
          </div>
        )}

        {(kyc === 'pending' || kyc === 'resubmit_required') && (
          <Card className="gap-2">
            <div className="text-sm font-medium">Submit your documents first</div>
            <p className="text-sm text-secondary">You can book the video call once your Aadhaar, licence and selfie are uploaded.</p>
            <Button variant="full" asChild><Link to="/verify/documents">Go to documents</Link></Button>
          </Card>
        )}

        {kyc === 'video_pending' && vv && vv.status === 'scheduled' && !rescheduling && (
          <Card className="gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-blue-600" aria-hidden /> Scheduled for {fmt(vv.scheduledAt)}</div>
            <p className="text-sm text-secondary">On the call, an admin will ask you to show your original documents to the camera and do a quick liveness check (turn your head / blink).</p>
            {vv.meetingUrl && (
              <Button variant="full" asChild>
                <a href={vv.meetingUrl} target="_blank" rel="noreferrer"><Video className="size-4" aria-hidden /> Join the call</a>
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setRescheduling(true)}>Reschedule</Button>
              <Button variant="outline" className="flex-1" disabled={busy} onClick={onCancel}>Cancel</Button>
            </div>
          </Card>
        )}

        {(kyc === 'docs_submitted' || rescheduling) && (
          <Card className="gap-3">
            <div className="text-sm font-semibold">{rescheduling ? 'Pick a new slot' : 'Pick a slot for your video call'}</div>
            <p className="text-sm text-secondary">15-minute slots, IST. You’ll get a join link right away.</p>
            <SlotPicker disabled={busy} onPick={rescheduling ? onReschedule : onBook} />
            {rescheduling && <Button variant="ghost" onClick={() => setRescheduling(false)}>Keep my current slot</Button>}
          </Card>
        )}
      </div>
    </div>
  );
}

export default BookVideoCallPage;
