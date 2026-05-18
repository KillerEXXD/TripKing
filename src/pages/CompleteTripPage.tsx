/**
 * `/trips/:id/complete` — driver-only 2-step "Complete the trip" wizard.
 *
 * Step 1 of 2 — Trip end & payout:
 *   • upload the ending-odometer photo (signed PUT URL into the trip-executions-photos bucket)
 *   • type the ending-odometer reading (must exceed the start reading recorded on /start)
 *   • enter any toll paid out-of-pocket
 *   • see a live payout preview: original → revised, with extra-KM fare + toll lines
 *
 * Step 2 of 2 — Review & note:
 *   • optional star rating + comment + tags for the trip poster (`driver_to_manager`)
 *   • optional private note that goes to the agent alongside the trip-completion event
 *   • "Complete trip" fires the completion mutation (with toll + odo + private note), then
 *     the review create if rating was supplied (skipping a review is allowed and never blocks
 *     completion), then navigates to /my-trips?tab=completed.
 *
 * The server is the source of truth for the final numbers — the trigger from migration 059
 * populates trips.{extra_distance_km, extra_km_fare, toll_amount, final_total_fare,
 * final_driver_payout}. The client-side preview here matches that math so the driver sees
 * what they're about to lock in.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { useCompleteTrip, useEndOdoUploadUrl, useTrip } from '@/hooks/useTrips';
import { useCreateReview } from '@/hooks/useReviews';
import { useReviewTagsByCategory } from '@/hooks/useAdminConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useMyDriver } from '@/hooks/useDrivers';
import { ApiError } from '@/lib/api/client';
import { PageHeader } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { FileUpload } from '@/components/form';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatKm } from '@/lib/utils';
import type { Trip } from '@/types';

const SCORES = [1, 2, 3, 4, 5] as const;

interface PayoutPreview {
  originalPayout: number;
  actualKm: number | null;
  acceptedKm: number;
  extraKm: number;
  extraFare: number;
  toll: number;
  revisedPayout: number;
}

/** Mirror migration 059's compute_trip_final_payout server-side trigger. */
function computePreview(trip: Trip, endOdoReading: number | null, startOdoReading: number | null, toll: number): PayoutPreview {
  const acceptedKm = trip.expectedDistanceKm;
  const actualKm = endOdoReading != null && startOdoReading != null && endOdoReading > startOdoReading
    ? endOdoReading - startOdoReading
    : null;
  const extraKm = actualKm != null ? Math.max(0, actualKm - acceptedKm) : 0;
  const extraFare = Math.round(extraKm * trip.ratePerKm * 100) / 100;
  const tollNum = Number.isFinite(toll) && toll > 0 ? toll : 0;
  // baseline payout (no overage, no toll) — equals trip.driverPayout
  const originalPayout = trip.driverPayout;
  const revisedPayout = Math.round((
    (trip.totalFare + extraFare)
    - (trip.totalFare + extraFare) * trip.commissionPct / 100
    - trip.gstAmount
    + trip.driverBata
    + tollNum
  ) * 100) / 100;
  return { originalPayout, actualKm, acceptedKm, extraKm, extraFare, toll: tollNum, revisedPayout };
}

function StepHeader({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Step {current} of {total}</div>
      <div className="text-base font-bold">{label}</div>
    </div>
  );
}

function Row({ label, value, muted, strong, accent }: { label: string; value: string; muted?: boolean; strong?: boolean; accent?: 'extra' | 'toll' }) {
  return (
    <div className={`flex items-center justify-between text-sm ${strong ? 'border-t pt-2 font-bold' : ''}`}>
      <span className={muted ? 'text-secondary' : undefined}>{label}</span>
      <span className={strong ? 'text-lg text-emerald-700' : accent === 'extra' ? 'font-medium text-amber-700' : accent === 'toll' ? 'font-medium text-sky-700' : muted ? 'text-secondary' : 'font-medium'}>{value}</span>
    </div>
  );
}

export function CompleteTripPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tripQuery = useTrip(tripId);
  const driverQuery = useMyDriver();
  const endOdoUpload = useEndOdoUploadUrl();
  const completeMutation = useCompleteTrip();
  const createReview = useCreateReview();
  const tagsQuery = useReviewTagsByCategory('driver_to_manager');
  const tags = (tagsQuery.data ?? []).filter((t) => t.isActive);

  const [step, setStep] = useState<1 | 2>(1);
  const [endOdoPath, setEndOdoPath] = useState('');
  const [endOdoReading, setEndOdoReading] = useState('');
  const [toll, setToll] = useState('');
  const [score, setScore] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [comment, setComment] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [privateNote, setPrivateNote] = useState('');
  const [hoverScore, setHoverScore] = useState(0);

  if (tripQuery.isPending) return <div className="p-6"><LoadingSkeleton rows={6} /></div>;
  if (tripQuery.isError || !tripQuery.data) return <div className="p-6"><ErrorState title="Couldn't load the trip" onRetry={() => tripQuery.refetch()} /></div>;
  const trip = tripQuery.data;

  const myDriverId = driverQuery.data?.id;
  const isAssignedDriver = !!myDriverId && trip.assignedDriverId === myDriverId;
  const canRunWizard = isAssignedDriver && trip.status === 'in_progress';
  const isAdmin = user?.role === 'admin';

  if (!canRunWizard && !isAdmin) {
    return (
      <div className="p-6">
        <ErrorState
          title="This trip can't be completed from here"
          message={trip.status !== 'in_progress' ? `The trip is "${trip.status}". Only an in-progress trip can be completed.` : "Only the assigned driver can complete this trip."}
          onRetry={() => navigate(`/trips/${trip.id}`)}
        />
      </div>
    );
  }

  const endOdoNum = endOdoReading.trim() ? Number(endOdoReading) : null;
  const startOdoReading = trip.startOdoReading ?? null;
  const tollNum = toll.trim() ? Number(toll) : 0;
  const preview = useMemoPreview(trip, endOdoNum, startOdoReading, tollNum);

  const endValid = endOdoNum != null && Number.isFinite(endOdoNum) && endOdoNum > 0
    && (startOdoReading == null || endOdoNum > startOdoReading);
  const tollValid = !toll.trim() || (Number.isFinite(tollNum) && tollNum >= 0);
  const step1Valid = !!endOdoPath && endValid && tollValid;

  async function onNext() {
    if (!step1Valid) {
      if (!endOdoPath) { toast.error('Upload a photo of the ending odometer.'); return; }
      if (!endValid) {
        toast.error('Enter a valid ending odometer reading.');
        return;
      }
      if (!tollValid) { toast.error('Toll must be a non-negative number.'); return; }
    }
    setStep(2);
  }

  async function onComplete() {
    try {
      await completeMutation.mutateAsync({
        tripId: trip.id,
        input: {
          endOdoUrl: endOdoPath,
          endOdoReading: endOdoNum ?? undefined,
          tollPaidByDriver: preview.toll,
          driverReviewNote: privateNote.trim() || undefined,
        },
      });
      // Fire-and-forget the review — completion already succeeded; a review failure shouldn't reverse it.
      if (score > 0) {
        try {
          await createReview.mutateAsync({
            tripId: trip.id,
            direction: 'driver_to_manager',
            score,
            comment: comment.trim() || undefined,
            tagIds: tagIds.length ? tagIds : undefined,
          });
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409)) {
            toast.error('Trip completed, but the review failed to post — you can leave it from the trip detail page.');
          }
        }
      }
      toast.success(`Trip completed · ${formatINR(preview.revisedPayout)} paid out.`);
      navigate('/my-trips?tab=completed');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'INSUFFICIENT_WALLET_BALANCE_DRIVER' || err.code === 'INSUFFICIENT_WALLET_BALANCE_AGENT')) {
        toast.error(err.message || "Couldn't charge the platform fee — top up your wallet to complete.");
        return;
      }
      toast.error("Couldn't complete the trip — please try again.");
    }
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-32">
      <PageHeader title="Complete the trip" onBack={() => (step === 2 ? setStep(1) : navigate(`/trips/${trip.id}`))} />

      {step === 1 ? (
        <Card className="space-y-3">
          <StepHeader current={1} total={2} label="Trip end & payout" />
          <FileUpload
            label="Ending odometer photo"
            hint="Snap the dashboard so the reading is clearly visible."
            value={endOdoPath || undefined}
            required
            capture="environment"
            getUploadUrl={() => endOdoUpload.mutateAsync({ tripId: trip.id })}
            onUploaded={(path) => setEndOdoPath(path)}
          />
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-secondary" htmlFor="end-odo-reading">End odometer reading (km)</label>
            <input
              id="end-odo-reading"
              type="number"
              inputMode="numeric"
              min={1}
              value={endOdoReading}
              onChange={(e) => setEndOdoReading(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-white px-3 text-base"
              placeholder="e.g. 50125"
            />
            <div className="mt-1 text-xs text-secondary">Must be greater than the reading recorded when you started.</div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-secondary" htmlFor="toll-paid">Toll paid by you (₹)</label>
            <input
              id="toll-paid"
              type="number"
              inputMode="numeric"
              min={0}
              value={toll}
              onChange={(e) => setToll(e.target.value)}
              className="mt-1 h-11 w-full rounded-md border border-input bg-white px-3 text-base"
              placeholder="0"
            />
            <div className="mt-1 text-xs text-secondary">Reimbursed 100% in your payout and passed through to the passenger's bill.</div>
          </div>

          <div className="space-y-1.5 rounded-lg border bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Payout preview</div>
            <Row label="Original payout" value={formatINR(preview.originalPayout)} muted />
            <Row
              label="Distance"
              value={preview.actualKm != null ? `${formatKm(preview.actualKm)} driven · ${formatKm(preview.acceptedKm)} accepted` : `${formatKm(preview.acceptedKm)} accepted`}
              muted
            />
            {preview.extraKm > 0 ? (
              <Row label={`Extra ${formatKm(preview.extraKm)} @ ${formatINR(trip.ratePerKm)}/km`} value={`+ ${formatINR(preview.extraFare)}`} accent="extra" />
            ) : null}
            {preview.toll > 0 ? (
              <Row label="Toll reimbursement" value={`+ ${formatINR(preview.toll)}`} accent="toll" />
            ) : null}
            <Row label="Revised payout" value={formatINR(preview.revisedPayout)} strong />
          </div>

          <Button variant="full" size="lg" disabled={!step1Valid} onClick={() => void onNext()}>Next →</Button>
        </Card>
      ) : (
        <Card className="space-y-3">
          <StepHeader current={2} total={2} label="Review & note" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Rate the trip manager <span className="font-normal normal-case text-secondary">(optional)</span></div>
            <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating">
              {SCORES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n ? 'true' : 'false'}
                  aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
                  className="p-0.5"
                  onClick={() => setScore(score === n ? 0 : n)}
                  onMouseEnter={() => setHoverScore(n)}
                  onMouseLeave={() => setHoverScore(0)}
                >
                  <Star className={`size-8 ${(hoverScore || score) >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} aria-hidden />
                </button>
              ))}
            </div>
          </div>
          {score > 0 ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-secondary" htmlFor="review-comment">Comment (optional)</label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 500))}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-input bg-white p-2 text-sm"
                  placeholder="What stood out?"
                />
              </div>
              {tags.length > 0 ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Tags</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const selected = tagIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-input bg-white'}`}
                          aria-pressed={selected ? 'true' : 'false'}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-secondary" htmlFor="private-note">Private note to the agent <span className="font-normal normal-case text-secondary">(optional)</span></label>
            <textarea
              id="private-note"
              value={privateNote}
              onChange={(e) => setPrivateNote(e.target.value.slice(0, 500))}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-white p-2 text-sm"
              placeholder="Anything they should know — not shown publicly."
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setStep(1)} className="flex-1">← Back</Button>
            <Button variant="full" size="lg" disabled={completeMutation.isPending} onClick={() => void onComplete()} className="flex-[2]">
              {completeMutation.isPending ? 'Completing…' : 'Complete trip'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/** useMemo'd preview computation so the live numerals don't recompute on every keystroke render. */
function useMemoPreview(trip: Trip, endOdoReading: number | null, startOdoReading: number | null, toll: number): PayoutPreview {
  return useMemo(
    () => computePreview(trip, endOdoReading, startOdoReading, toll),
    [trip, endOdoReading, startOdoReading, toll],
  );
}

export default CompleteTripPage;
