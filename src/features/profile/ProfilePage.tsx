import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  LogOut,
  Globe,
  ShieldCheck,
  Phone,
  Mail,
  Star,
  IdCard,
  FileText,
  Car,
  Snowflake,
  Users,
  Fuel,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Video,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useGoBack } from '@/hooks/useGoBack';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials, cn } from '@/lib/utils';
import { mockDrivers, mockManagers, mockAppSettings } from '@/data/mockData';
import type {
  Driver,
  EligibilityStatus,
  KycStatus,
  LanguageCode,
  Vehicle,
} from '@/types';

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

export function ProfilePage() {
  const navigate = useNavigate();
  const goBack = useGoBack('/home');
  const { user, logout } = useAuth();
  const { language, setLanguage, available } = useLanguage();

  // Defensive guard — if a refresh lands here without a session
  // (e.g. localStorage cleared), bounce to the splash instead of a blank page.
  useEffect(() => {
    if (!user) navigate('/', { replace: true });
  }, [user, navigate]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const driver = mockDrivers.find((d) => d.userId === user.id);
  const manager = mockManagers.find((m) => m.userId === user.id);

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">My Profile</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Hero card */}
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarFallback className="text-xl">
                  {initials(user.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-lg truncate">{user.displayName}</div>
                <div className="text-xs text-muted-foreground capitalize">
                  {user.role.replace('_', ' ')}
                </div>
                {driver && (
                  <div className="flex items-center gap-1 mt-1 text-amber-600 font-bold text-sm">
                    <Star className="size-3.5 fill-amber-500 stroke-amber-500" />
                    {driver.ratingAvg > 0 ? driver.ratingAvg.toFixed(1) : 'New'}
                    <span className="text-muted-foreground font-normal text-xs">
                      · {driver.totalTripsCompleted} trips
                      {driver.ratingCount > 0 && ` · ${driver.ratingCount} reviews`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {(driver || manager) && (
              <Badge
                variant={KYC_VARIANT[(driver ?? manager)!.kycStatus]}
                className="text-xs"
              >
                <ShieldCheck className="size-3" />{' '}
                KYC: {KYC_LABEL[(driver ?? manager)!.kycStatus]}
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardContent className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Contact
            </div>
            <Row icon={<Phone />} label="Phone" value={user.phone} verified />
            {user.email && <Row icon={<Mail />} label="Email" value={user.email} />}
            {driver?.homeCity && (
              <Row
                icon={<Globe />}
                label="Home city"
                value={`${driver.homeCity.name}, ${driver.homeCity.state}`}
              />
            )}
            {manager?.businessName && (
              <Row
                icon={<FileText />}
                label="Business"
                value={`${manager.businessName} · ${manager.businessCity.name}`}
              />
            )}
          </CardContent>
        </Card>

        {/* Identity documents — driver + manager */}
        {(driver || manager) && (
          <Card>
            <CardContent className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Identity documents
              </div>

              <DocRow
                icon={<IdCard />}
                label="Aadhaar"
                value="**** **** 1234"
                hint="Masked · last 4 digits only"
                ok
              />
              <DocRow
                icon={<IdCard />}
                label="Voter ID"
                value="**** 5678"
                hint="Masked · last 4 digits only"
                ok
              />
              <DocRow
                icon={<Camera />}
                label="Profile selfie"
                value="Uploaded"
                ok
              />
              {driver && (
                <DocRow
                  icon={<FileText />}
                  label="Driver license"
                  value="DL-09-2018-1234567"
                  hint={`Expires ${formatDate('2030-01-15')}`}
                  ok
                />
              )}
              <DocRow
                icon={<Video />}
                label="Video verification"
                value={
                  (driver ?? manager)!.kycStatus === 'approved'
                    ? 'Completed'
                    : 'Scheduled'
                }
                ok={(driver ?? manager)!.kycStatus === 'approved'}
              />

              <div className="text-[10px] text-muted-foreground italic pt-2 border-t">
                Documents are stored securely. Only admins can view originals
                during KYC review.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vehicles — driver only */}
        {driver && driver.vehicles.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                My vehicles ({driver.vehicles.length})
              </h3>
              <Button variant="ghost" size="sm" className="text-primary text-xs">
                + Add
              </Button>
            </div>
            {driver.vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} driver={driver} />
            ))}
          </div>
        )}

        {/* Stats — driver only */}
        {driver && (
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate('/driver/trips')}
          >
            <CardContent className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                <CalendarClock className="size-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm">Trip History</div>
                <div className="text-xs text-muted-foreground">
                  {driver.totalTripsCompleted} completed · earnings & ratings
                </div>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {/* Language */}
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 font-semibold mb-3 text-sm">
              <Globe className="size-4" />
              Language
            </div>
            <div className="grid grid-cols-3 gap-2">
              {available.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLanguage(l.code as LanguageCode)}
                  className={cn(
                    'p-3 rounded-lg border text-center transition-all',
                    language === l.code
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  <div className="font-semibold text-sm">{l.native}</div>
                  <div className="text-xs text-muted-foreground">{l.english}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Takes effect on next screen
            </p>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            logout();
            navigate('/', { replace: true });
          }}
        >
          <LogOut className="size-4" /> Sign out
        </Button>
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
  verified,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  verified?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="text-muted-foreground mt-0.5 [&_svg]:size-4 shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-semibold flex items-center gap-1.5">
          {value}
          {verified && (
            <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
          )}
        </div>
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
          ok
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700',
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

        {/* Specs grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Spec icon={<Car />} label="Type" value={vehicle.carType} />
          <Spec icon={<Users />} label="Seats" value={`${vehicle.seats}`} />
          <Spec
            icon={<Snowflake />}
            label="AC"
            value={vehicle.ac ? 'Yes' : 'No'}
          />
          <Spec icon={<Fuel />} label="Fuel" value={vehicle.fuelType} />
        </div>

        {/* 4-side photos */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
            Vehicle photos
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
          {vehicle.permitUrl && (
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span className="font-medium">Commercial Permit</span>
            </div>
          )}
        </div>

        {/* Eligibility hint */}
        <div className="text-[10px] text-muted-foreground italic pt-1 border-t">
          Vehicle retires {vehicle.retirementYear} (admin minimum: year{' '}
          {mockAppSettings.minVehicleYear}). Driver{' '}
          {driver.fullName.split(' ')[0]} will be notified at 90 / 30 / 7 days
          before retirement.
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
