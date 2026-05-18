/**
 * `/app/verify/video-call` — the video-verification step of the "Get verified" checklist (drivers and
 * trip managers alike). If a call is scheduled, show the time + a Join link + cancel/reschedule;
 * otherwise (once documents are submitted) pick a free 15-min slot to book one. Booking moves
 * `kyc_status` → video_pending; an admin runs the call.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout';
import { CalendarClock, ShieldCheck, Video } from 'lucide-react';
import { toast } from 'sonner';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { useMyAgent, useMyDriver } from '@/hooks/useDrivers';
import { useAvailableVideoSlots, useBookVideoCall, useCancelVideoCall, useRescheduleVideoCall, useVideoVerification } from '@/hooks/useVideoVerification';
import { Button, Card, StatusBanner } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatPickupDateTime } from '@/lib/utils';

function Header({ onBack }: { onBack: () => void }) {
  return <PageHeader title="Video verification" onBack={onBack} />;
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
  const effectiveRole = useEffectiveRole();
  const isAgent = effectiveRole === 'trip_manager';
  const driverQuery = useMyDriver(!isAgent);
  const agentQuery = useMyAgent(isAgent);
  const profileQuery = isAgent ? agentQuery : driverQuery;
  const book = useBookVideoCall();
  const cancel = useCancelVideoCall();
  const reschedule = useRescheduleVideoCall();
  const [rescheduling, setRescheduling] = useState(false);

  const vvId = profileQuery.data?.verification?.videoVerification?.id;
  const vvQuery = useVideoVerification(vvId);

  if (profileQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (profileQuery.isError || !profileQuery.data) return <div className="p-6"><ErrorState title="Couldn't load your profile" onRetry={() => profileQuery.refetch()} /></div>;

  const kyc = profileQuery.data.verification?.kycStatus ?? 'pending';
  const vv = vvQuery.data ?? profileQuery.data.verification?.videoVerification ?? null;
  const busy = book.isPending || cancel.isPending || reschedule.isPending;

  async function onBook(iso: string) {
    try { await book.mutateAsync({ slotAt: iso, kind: isAgent ? 'manager' : 'driver' }); toast.success('Video call booked.'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not book that slot'); }
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
          <StatusBanner tone="success" icon={<ShieldCheck />} title="You’re verified — nothing more to do here." />
        )}

        {(kyc === 'pending' || kyc === 'resubmit_required') && (
          <Card className="gap-2">
            <div className="text-sm font-medium">Submit your documents first</div>
            <p className="text-sm text-secondary">You can book the video call once your {isAgent ? 'Aadhaar and selfie are' : 'Aadhaar, licence and selfie are'} uploaded.</p>
            <Button variant="full" asChild><Link to="/app/verify/documents">Go to documents</Link></Button>
          </Card>
        )}

        {kyc === 'video_pending' && vv && vv.status === 'scheduled' && !rescheduling && (
          <Card className="gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-blue-600" aria-hidden /> Scheduled for {formatPickupDateTime(vv.scheduledAt)}</div>
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
