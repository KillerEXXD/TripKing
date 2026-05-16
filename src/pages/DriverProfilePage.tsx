import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Car, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { useDriver } from '@/hooks/useDrivers';
import { useDriverReviews } from '@/hooks/useReviews';
import { useAuth } from '@/contexts/AuthContext';
import { ReviewList } from '@/components/reviews/ReviewList';
import { AdminKycChecklist } from '@/components/admin/kyc/AdminKycChecklist';
import { Badge, Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatRating, initials } from '@/lib/utils';
import type { Driver, KycStatus, VehicleSummary } from '@/types';

const KYC_BADGE: Record<KycStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }> = {
  pending: { label: 'Verification pending', variant: 'muted' },
  docs_submitted: { label: 'Docs submitted', variant: 'info' },
  video_pending: { label: 'Video call pending', variant: 'info' },
  ready_for_approval: { label: 'Ready for approval', variant: 'success' },
  approved: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Verification rejected', variant: 'destructive' },
  resubmit_required: { label: 'Resubmit documents', variant: 'warning' },
};

function Avatar({ name, url }: { name: string; url?: string }) {
  if (url) return <img src={url} alt="" className="size-16 shrink-0 rounded-full object-cover" />;
  return (
    <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary" aria-hidden>
      {name ? initials(name) : '?'}
    </div>
  );
}

function RatingBars({ distribution, total }: { distribution: Record<'1' | '2' | '3' | '4' | '5', number>; total: number }) {
  const max = Math.max(1, ...(['1', '2', '3', '4', '5'] as const).map((k) => distribution[k]));
  return (
    <div className="space-y-1">
      {(['5', '4', '3', '2', '1'] as const).map((k) => {
        const n = distribution[k];
        return (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-6 text-right text-secondary">{k}★</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-amber-400" style={{ width: total > 0 ? `${(n / max) * 100}%` : '0%' }} />
            </div>
            <span className="w-6 text-secondary">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function VehicleRow({ v }: { v: VehicleSummary }) {
  const name = [v.makeLabel, v.modelName].filter(Boolean).join(' ') || 'Vehicle';
  return (
    <div className="flex items-start gap-3">
      <Car className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
      <div className="text-sm">
        <span className="font-medium">
          {name}
          {v.year ? ` ${v.year}` : ''}
        </span>
        <span className="text-secondary">
          {' · '}
          {v.carTypeLabel ?? 'Car'} · {v.seats} seats · {v.ac ? 'AC' : 'Non-AC'}
        </span>
      </div>
    </div>
  );
}

function DriverDetail({ driver }: { driver: Driver }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const kyc = KYC_BADGE[driver.kycStatus] ?? KYC_BADGE.pending;
  // `phone` is required on the revealed `Driver` shape but the server may send a pre-reveal row
  // (empty / missing identity); guard before rendering tel: links.
  const phone = driver.phone || '';
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined;
  const reviewsQuery = useDriverReviews(driver.userId);
  const reviews = reviewsQuery.data ?? [];
  const primary = driver.fullName || `Driver ${driver.displayHandle}`;
  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={primary} url={driver.profilePhotoUrl || undefined} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{primary}</h1>
            {driver.displayHandle ? (
              <div className="font-mono text-[11px] uppercase tracking-wide text-secondary">{driver.displayHandle}</div>
            ) : null}
            <div className="mt-1 flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-secondary" aria-hidden />
              <Badge variant={kyc.variant}>{kyc.label}</Badge>
            </div>
            <div className="mt-1.5 text-sm text-secondary">
              {driver.ratingCount > 0 ? (
                <>
                  <span className="font-semibold text-amber-600">{formatRating(driver.ratingAvg)}</span> · {driver.ratingCount} review{driver.ratingCount === 1 ? '' : 's'} · {driver.totalTripsCompleted} trips
                </>
              ) : (
                <>No ratings yet · {driver.totalTripsCompleted} trips</>
              )}
            </div>
          </div>
        </div>
        {telHref ? (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <a href={telHref} aria-label={`Call ${primary}`}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          </Button>
        ) : null}
      </Card>

      {driver.ratingCount > 0 ? (
        <Card className="gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Ratings</div>
          <RatingBars distribution={driver.ratingDistribution} total={driver.ratingCount} />
        </Card>
      ) : null}

      {driver.topTags.length > 0 || driver.managerTopTags.length > 0 ? (
        <Card className="gap-3">
          {driver.topTags.length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">What passengers say</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {driver.topTags.map((t) => (
                  <Badge key={t} variant="success">
                    ★ {t}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {driver.managerTopTags.length > 0 ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">What agents say</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {driver.managerTopTags.map((t) => (
                  <Badge key={t} variant="info">
                    ★ {t}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {driver.homeCity || driver.currentCity ? (
        <Card className="gap-2">
          <div className="flex items-start gap-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-secondary" aria-hidden />
            <div>
              {driver.homeCity ? (
                <div>
                  <span className="text-secondary">Home: </span>
                  {driver.homeCity.name}
                  {driver.homeCity.state ? `, ${driver.homeCity.state}` : ''}
                </div>
              ) : null}
              {driver.currentCity ? (
                <div>
                  <span className="text-secondary">Currently in: </span>
                  {driver.currentCity.name}
                  {driver.currentCity.state ? `, ${driver.currentCity.state}` : ''}
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Vehicles</div>
        {driver.vehicles.length === 0 ? (
          <p className="text-sm text-secondary">No vehicles listed yet.</p>
        ) : (
          <div className="space-y-2">
            {driver.vehicles.map((v) => (
              <VehicleRow key={v.id || `${v.makeLabel}-${v.modelName}-${v.year}`} v={v} />
            ))}
          </div>
        )}
      </Card>

      {isAdmin && driver.verification ? (
        <AdminKycChecklist
          kind="driver"
          subject={{
            id: driver.id,
            fullName: driver.fullName,
            phone: driver.phone,
            email: driver.email,
            cityName: driver.currentCity?.name ?? driver.homeCity?.name,
            profilePhotoUrl: driver.profilePhotoUrl,
            verification: driver.verification,
          }}
        />
      ) : null}

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Reviews</div>
        {reviewsQuery.isPending ? (
          <LoadingSkeleton rows={2} />
        ) : reviewsQuery.isError ? (
          <p className="text-sm text-secondary">Couldn&apos;t load reviews.</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-secondary">No written reviews yet.</p>
        ) : (
          <ReviewList reviews={reviews} />
        )}
      </div>
    </div>
  );
}

/** `/drivers/:id` — a driver's public marketplace profile (rating, tags, vehicles). Read via `useDriver`. */
export function DriverProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const driverQuery = useDriver(id);
  const notFound = !id || (driverQuery.isError && driverQuery.error instanceof ApiError && driverQuery.error.status === 404);

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="text-base font-semibold">Driver</div>
      </header>

      <div className="space-y-4 p-4">
        {notFound ? (
          <ErrorState title="Driver not found" message="This profile may have been removed, or the link is out of date." />
        ) : driverQuery.isPending ? (
          <LoadingSkeleton rows={6} />
        ) : driverQuery.isError ? (
          <ErrorState title="Couldn't load this profile" message="Check your connection and try again." onRetry={() => void driverQuery.refetch()} />
        ) : (
          <DriverDetail driver={driverQuery.data} />
        )}
      </div>
    </div>
  );
}

export default DriverProfilePage;
