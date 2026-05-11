import { useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Star,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  IdCard,
  FileText,
  Camera,
  Video,
  Car,
  Users,
  Snowflake,
  Fuel,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useDriver } from '@/hooks/useDrivers';
import { useGoBack } from '@/hooks/useGoBack';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials, cn } from '@/lib/utils';
import { mockAppSettings } from '@/data/mockData';
import type {
  Driver,
  EligibilityStatus,
  KycStatus,
  Vehicle,
} from '@/types';

const FAKE_REVIEWS = [
  { id: 'r1', score: 5, when: '2 days ago', text: 'Reached on time, vehicle was spotless. Highly recommend.', who: 'Trip Manager' },
  { id: 'r2', score: 5, when: '5 days ago', text: 'Great driver, knew shortcuts to avoid traffic.', who: 'Trip Manager' },
  { id: 'r3', score: 4, when: '8 days ago', text: 'Polite and safe driver. Slightly delayed pickup.', who: 'Trip Manager' },
];

const KYC_LABEL: Record<KycStatus, string> = {
  pending: 'Pending',
  docs_submitted: 'Docs submitted',
  video_pending: 'Video pending',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmit_required: 'Resubmit required',
};

const KYC_VARIANT: Record<KycStatus, 'success' | 'warning' | 'destructive' | 'info'> = {
  pending: 'info',
  docs_submitted: 'info',
  video_pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  resubmit_required: 'warning',
};

const ELIG_LABEL: Record<EligibilityStatus, string> = {
  eligible: 'Eligible',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
};

const ELIG_VARIANT: Record<EligibilityStatus, 'success' | 'warning' | 'destructive'> = {
  eligible: 'success',
  expiring_soon: 'warning',
  expired: 'destructive',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DriverProfilePage() {
  const { driverId } = useParams<{ driverId: string }>();
  const goBack = useGoBack('/home');
  const { user } = useAuth();
  const { data: driver, isLoading } = useDriver(driverId);

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!driver) return <div className="p-6">Driver not found.</div>;

  const isAdmin = user?.role === 'admin';

  const total = Object.values(driver.ratingDistribution).reduce((a, b) => a + b, 0) || 1;
  const dist = (n: 1 | 2 | 3 | 4 | 5) =>
    Math.round((driver.ratingDistribution[n] / total) * 100);

  const telHref = `tel:${driver.phone.replace(/[^\d+]/g, '')}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
            <ArrowLeft className="size-5" />
          </Button>
          <h1 className="font-semibold truncate">
            {isAdmin ? 'Driver — Admin View' : 'Driver Profile'}
          </h1>
        </div>
        {isAdmin && (
          <Badge variant={KYC_VARIANT[driver.kycStatus]}>
            <ShieldCheck className="size-3" /> {KYC_LABEL[driver.kycStatus]}
          </Badge>
        )}
      </header>

      <div className="p-4 space-y-4">
        {/* HERO — always shown */}
        <Card>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarFallback className="text-xl">{initials(driver.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg truncate">{driver.fullName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {driver.currentCity.name} ·{' '}
                  {driver.vehicles[0]
                    ? `${driver.vehicles[0].make} ${driver.vehicles[0].model} ${driver.vehicles[0].year}`
                    : 'No vehicle'}
                </div>
                <div className="flex items-center gap-1 mt-1 text-amber-600 font-bold">
                  <Star className="size-4 fill-amber-500 stroke-amber-500" />
                  {driver.ratingAvg > 0 ? driver.ratingAvg.toFixed(1) : 'New'}
                  <span className="text-muted-foreground font-normal text-sm">
                    · {driver.totalTripsCompleted} trips
                    {driver.ratingCount > 0 && ` · ${driver.ratingCount} reviews`}
                  </span>
                </div>
              </div>
            </div>

            {/* Histogram */}
            <div className="mt-4 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => (
                <div key={n} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-muted-foreground">{n}★</span>
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${dist(n as 1 | 2 | 3 | 4 | 5)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">
                    {driver.ratingDistribution[n as 1 | 2 | 3 | 4 | 5]}
                  </span>
                </div>
              ))}
            </div>

            {/* Top tags */}
            <div className="flex flex-wrap gap-1 mt-3">
              {driver.topTags.map((t) => (
                <Badge key={t} variant="success">
                  ★ {t}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ADMIN-ONLY BLOCKS */}
        {isAdmin && (
          <>
            {/* Contact */}
            <Card>
              <CardContent className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Contact
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <div className="text-muted-foreground mt-0.5 [&_svg]:size-4 shrink-0">
                    <Phone />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Phone
                    </div>
                    <div className="font-semibold font-mono">{driver.phone}</div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={telHref}>
                      <Phone className="size-3.5" /> Call
                    </a>
                  </Button>
                </div>
                {driver.email && (
                  <Row icon={<Mail />} label="Email" value={driver.email} />
                )}
                <Row
                  icon={<MapPin />}
                  label="Home city"
                  value={`${driver.homeCity.name}, ${driver.homeCity.state}`}
                />
                {driver.currentCity.id !== driver.homeCity.id && (
                  <Row
                    icon={<MapPin />}
                    label="Currently in"
                    value={`${driver.currentCity.name}, ${driver.currentCity.state}`}
                  />
                )}
              </CardContent>
            </Card>

            {/* Identity Documents */}
            <Card>
              <CardContent className="space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Identity documents
                </div>

                <DocRow
                  icon={<IdCard />}
                  label="Aadhaar"
                  value="**** **** 1234"
                  hint="Masked · last 4 digits only · UIDAI compliant"
                  ok
                />
                <DocRow
                  icon={<IdCard />}
                  label="Voter ID"
                  value="**** 5678"
                  hint="Masked · last 4 digits only"
                  ok
                />
                <DocRow icon={<Camera />} label="Profile selfie" value="Uploaded" ok />
                <DocRow
                  icon={<FileText />}
                  label="Driver license"
                  value="DL-09-2018-1234567"
                  hint={`Expires ${formatDate('2030-01-15')}`}
                  ok
                />
                <DocRow
                  icon={<Video />}
                  label="Video verification"
                  value={driver.kycStatus === 'approved' ? 'Completed' : 'Scheduled'}
                  ok={driver.kycStatus === 'approved'}
                />

                {/* Document image grid (placeholders) */}
                <div className="pt-2 border-t">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                    Uploaded scans
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: 'Aadhaar front', tone: 'amber' },
                      { label: 'Aadhaar back', tone: 'amber' },
                      { label: 'Voter ID front', tone: 'blue' },
                      { label: 'Voter ID back', tone: 'blue' },
                      { label: 'License', tone: 'emerald' },
                      { label: 'Selfie', tone: 'pink' },
                    ].map((d) => (
                      <DocThumb key={d.label} label={d.label} tone={d.tone as ToneKey} />
                    ))}
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground italic pt-2 border-t">
                  Documents are encrypted at rest in private buckets. Signed-URL
                  fetch logged to audit_log.
                </div>
              </CardContent>
            </Card>

            {/* Vehicles */}
            {driver.vehicles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Vehicles ({driver.vehicles.length})
                  </h3>
                </div>
                {driver.vehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} driver={driver} />
                ))}
              </div>
            )}
          </>
        )}

        {/* PUBLIC — recent reviews — always shown */}
        <div>
          <h2 className="font-semibold text-sm mb-2">Recent Reviews</h2>
          <div className="space-y-2">
            {FAKE_REVIEWS.map((r) => (
              <Card key={r.id}>
                <CardContent>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-amber-600 font-bold">
                      {Array.from({ length: r.score }).map((_, i) => (
                        <Star
                          key={i}
                          className="inline size-3.5 fill-amber-500 stroke-amber-500"
                        />
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.when} · {r.who}
                    </div>
                  </div>
                  <p className="text-sm">{r.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3 italic">
            Rater identity hidden — shown only as role
          </p>
        </div>
      </div>
    </div>
  );
}

// =====================
// Sub-components
// =====================

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="text-muted-foreground mt-0.5 [&_svg]:size-4 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

function DocRow({
  icon,
  label,
  value,
  hint,
  ok,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  ok?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div
        className={cn(
          'size-9 rounded-lg flex items-center justify-center shrink-0 [&_svg]:size-4',
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
        )}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-semibold truncate">{value}</div>
        {hint && (
          <div className="text-xs text-muted-foreground truncate">{hint}</div>
        )}
      </div>
      {ok ? (
        <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-1" />
      ) : (
        <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-1" />
      )}
    </div>
  );
}

type ToneKey = 'amber' | 'blue' | 'emerald' | 'pink';

function DocThumb({ label, tone }: { label: string; tone: ToneKey }) {
  const map: Record<ToneKey, string> = {
    amber: 'from-amber-50 to-amber-100 border-amber-200 text-amber-700',
    blue: 'from-blue-50 to-blue-100 border-blue-200 text-blue-700',
    emerald: 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-700',
    pink: 'from-pink-50 to-pink-100 border-pink-200 text-pink-700',
  };
  return (
    <div
      className={cn(
        'aspect-[4/3] rounded-lg border bg-gradient-to-br flex flex-col items-center justify-center text-[9px] uppercase tracking-wider font-semibold text-center px-1',
        map[tone],
      )}
    >
      <FileText className="size-4 mb-0.5 opacity-60" />
      {label}
    </div>
  );
}

function VehicleCard({ vehicle, driver }: { vehicle: Vehicle; driver: Driver }) {
  const insExpiring =
    new Date(vehicle.insuranceExpiry).getTime() <
    Date.now() + 30 * 24 * 3600_000;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="font-bold truncate">
                {vehicle.make} {vehicle.model}
              </div>
              {vehicle.isPrimary && (
                <Badge variant="success" className="text-[10px]">
                  Primary
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              {vehicle.registrationNumber} · {vehicle.year}
            </div>
          </div>
          <Badge variant={ELIG_VARIANT[vehicle.eligibilityStatus]}>
            {ELIG_LABEL[vehicle.eligibilityStatus]}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Spec icon={<Car />} label="Type" value={vehicle.carType} />
          <Spec icon={<Users />} label="Seats" value={`${vehicle.seats}`} />
          <Spec icon={<Snowflake />} label="AC" value={vehicle.ac ? 'Yes' : 'No'} />
          <Spec icon={<Fuel />} label="Fuel" value={vehicle.fuelType} />
        </div>

        {/* 4-side photos */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            Vehicle photos (4-side)
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['front', 'back', 'left', 'right'] as const).map((side) => (
              <div
                key={side}
                className="aspect-square rounded-lg bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-100 flex flex-col items-center justify-center text-[9px] uppercase tracking-wider text-emerald-700 font-semibold"
              >
                <Camera className="size-4 mb-0.5 opacity-60" />
                {side}
              </div>
            ))}
          </div>
        </div>

        {/* Documents */}
        <div className="space-y-1.5 pt-2 border-t">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Vehicle documents
          </div>
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
            <span className="font-medium">RC Book</span>
            <span className="text-muted-foreground">uploaded</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {insExpiring ? (
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
            ) : (
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">Insurance</span>
            <span className="text-muted-foreground">
              expires {formatDate(vehicle.insuranceExpiry)}
            </span>
          </div>
          {vehicle.permitUrl !== undefined && (
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span className="font-medium">Commercial Permit</span>
            </div>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground italic pt-1 border-t">
          Vehicle retires {vehicle.retirementYear} · admin minimum: year{' '}
          {mockAppSettings.minVehicleYear}. {driver.fullName.split(' ')[0]} will be
          notified at 90 / 30 / 7 days before retirement.
        </div>
      </CardContent>
    </Card>
  );
}

function Spec({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-50 border border-input">
      <div className="text-muted-foreground [&_svg]:size-3.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}
