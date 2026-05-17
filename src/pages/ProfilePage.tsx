import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Car, LogOut, Pencil, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useEffectiveRole } from '@/stores/roleViewStore';
import { useMyAgent, useMyDriver, useUpdateAgent, useUpdateDriver } from '@/hooks/useDrivers';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { cityHooks } from '@/hooks/useAdminConfig';
import { Badge, Button, Card, Input } from '@/components/ui';
import { AGENT_VERIFICATION_STEPS, VerificationChecklist } from '@/components/driver';
import { MyKycDocsCard } from '@/components/driver/MyKycDocsCard';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { ApiError } from '@/lib/api/client';
import { formatRating, initials } from '@/lib/utils';
import type { Agent, Driver, KycStatus } from '@/types';

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

function EditForm({
  initial,
  cityLabel,
  onSave,
  saving,
  onCancel,
}: {
  initial: { fullName: string; email: string; cityId: string; profilePhotoUrl: string };
  cityLabel: string;
  onSave: (v: { fullName: string; email: string; cityId: string; profilePhotoUrl: string }) => void;
  saving: boolean;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(initial.fullName);
  const [email, setEmail] = useState(initial.email);
  const [cityId, setCityId] = useState(initial.cityId);
  const [photo, setPhoto] = useState(initial.profilePhotoUrl);
  const citiesQuery = cityHooks.useList();
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Full name</span>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{cityLabel}</span>
        <select className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">Select a city</option>
          {(citiesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Email <span className="font-normal text-secondary">(optional)</span>
        </span>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Photo URL <span className="font-normal text-secondary">(optional)</span>
        </span>
        <Input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
      </label>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="flex-1">
          Cancel
        </Button>
        <Button variant="full" size="sm" onClick={() => onSave({ fullName: fullName.trim(), email: email.trim(), cityId, profilePhotoUrl: photo.trim() })} disabled={saving || fullName.trim().length === 0} className="flex-1">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function DriverProfile({ driver, onSignOut, signingOut }: { driver: Driver; onSignOut: () => void; signingOut: boolean }) {
  const { hash } = useLocation();
  const [editing, setEditing] = useState(hash === '#edit');
  useEffect(() => { setEditing(hash === '#edit'); }, [hash]);
  const update = useUpdateDriver();
  const vehiclesQuery = useDriverVehicles(driver.id);
  const kyc = KYC_BADGE[driver.kycStatus] ?? KYC_BADGE.pending;

  function save(v: { fullName: string; email: string; cityId: string; profilePhotoUrl: string }) {
    update.mutate(
      { id: driver.id, input: { fullName: v.fullName, email: v.email || undefined, homeCityId: v.cityId || undefined, profilePhotoUrl: v.profilePhotoUrl || undefined } },
      { onSuccess: () => { toast.success('Profile updated'); setEditing(false); }, onError: () => toast.error("Couldn't save — try again.") },
    );
  }

  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={driver.fullName} url={driver.profilePhotoUrl || undefined} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{driver.fullName || 'Your profile'}</h1>
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
            {driver.phone ? <div className="mt-0.5 text-sm text-secondary">{driver.phone}{driver.email ? ` · ${driver.email}` : ''}</div> : null}
          </div>
          {!editing ? (
            <Button variant="ghost" size="sm" aria-label="Edit profile" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        {editing ? (
          <EditForm
            cityLabel="Home city"
            saving={update.isPending}
            onCancel={() => setEditing(false)}
            onSave={save}
            initial={{ fullName: driver.fullName, email: driver.email ?? '', cityId: driver.homeCity?.id ?? '', profilePhotoUrl: driver.profilePhotoUrl }}
          />
        ) : (
          <Link to={`/drivers/${driver.id}`} className="text-sm font-medium text-primary underline">
            View your public profile →
          </Link>
        )}
      </Card>

      {driver.verification ? (
        <div id="get-verified" className="scroll-mt-4">
          <VerificationChecklist verification={driver.verification} primaryVehicleId={(vehiclesQuery.data ?? []).find((v) => v.isPrimary)?.id ?? (vehiclesQuery.data ?? [])[0]?.id} />
        </div>
      ) : null}

      <MyKycDocsCard kind="driver" id={driver.id} />

      <Card className="gap-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your vehicles</div>
          <Link to="/vehicles/new" className="text-xs font-medium text-primary hover:underline">+ Add vehicle</Link>
        </div>
        {vehiclesQuery.isPending ? (
          <LoadingSkeleton rows={2} />
        ) : vehiclesQuery.isError ? (
          <p className="text-sm text-secondary">Couldn&apos;t load your vehicles.</p>
        ) : (vehiclesQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-secondary">No vehicles added yet. <Link to="/vehicles/new" className="font-medium text-primary underline">Add one</Link> to get verified.</p>
        ) : (
          <div className="space-y-2">
            {(vehiclesQuery.data ?? []).map((v) => {
              const photosDone = !!v.photoFrontUrl && !!v.photoBackUrl && !!v.photoLeftUrl && !!v.photoRightUrl && !!v.photoPlateUrl && !!v.rcBookUrl && !!v.insuranceUrl;
              return (
                <div key={v.id} className="rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Car className="size-4 shrink-0 text-secondary" aria-hidden />
                    <span className="font-medium">{[v.makeLabel, v.modelName].filter(Boolean).join(' ') || 'Vehicle'}{v.year ? ` ${v.year}` : ''}</span>
                    {v.isPrimary ? <Badge variant="muted">primary</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-secondary">{v.carTypeLabel ?? 'Car'} · {v.seats} seats · {v.ac ? 'AC' : 'Non-AC'}{v.fuelTypeLabel ? ` · ${v.fuelTypeLabel}` : ''}{v.registrationNumber ? ` · ${v.registrationNumber}` : ''}</div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <Badge variant={photosDone ? 'success' : 'warning'}>{photosDone ? 'Photos complete' : 'Photos needed'}</Badge>
                    <Link to={`/vehicles/${v.id}/photos`} className="font-medium text-primary hover:underline">{photosDone ? 'View photos' : 'Add photos'}</Link>
                    <Link to={`/vehicles/${v.id}/edit`} className="font-medium text-primary hover:underline">Edit</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Button variant="outline" onClick={onSignOut} disabled={signingOut} className="w-full">
        <LogOut className="size-4" aria-hidden /> {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}

function AgentProfile({ agent, onSignOut, signingOut }: { agent: Agent; onSignOut: () => void; signingOut: boolean }) {
  const { hash } = useLocation();
  const [editing, setEditing] = useState(hash === '#edit');
  useEffect(() => { setEditing(hash === '#edit'); }, [hash]);
  const update = useUpdateAgent();
  const kyc = KYC_BADGE[agent.kycStatus] ?? KYC_BADGE.pending;

  function save(v: { fullName: string; email: string; cityId: string; profilePhotoUrl: string }) {
    update.mutate(
      { id: agent.id, input: { fullName: v.fullName, email: v.email || undefined, businessCityId: v.cityId || undefined, profilePhotoUrl: v.profilePhotoUrl || undefined } },
      { onSuccess: () => { toast.success('Profile updated'); setEditing(false); }, onError: () => toast.error("Couldn't save — try again.") },
    );
  }

  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <div className="flex items-start gap-3">
          <Avatar name={agent.fullName} url={agent.profilePhotoUrl || undefined} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{agent.fullName || 'Your profile'}</h1>
            <div className="mt-1 flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-secondary" aria-hidden />
              <Badge variant={kyc.variant}>{kyc.label}</Badge>
            </div>
            <div className="mt-1.5 text-sm text-secondary">
              {agent.businessName ? `${agent.businessName} · ` : ''}
              {agent.businessCity ? `${agent.businessCity.name}${agent.businessCity.state ? `, ${agent.businessCity.state}` : ''} · ` : ''}
              {agent.totalTripsPosted} posted
            </div>
            {agent.phone ? <div className="mt-0.5 text-sm text-secondary">{agent.phone}{agent.email ? ` · ${agent.email}` : ''}</div> : null}
          </div>
          {!editing ? (
            <Button variant="ghost" size="sm" aria-label="Edit profile" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
        {editing ? (
          <EditForm
            cityLabel="Business city"
            saving={update.isPending}
            onCancel={() => setEditing(false)}
            onSave={save}
            initial={{ fullName: agent.fullName, email: agent.email ?? '', cityId: agent.businessCity?.id ?? '', profilePhotoUrl: agent.profilePhotoUrl }}
          />
        ) : (
          <Link to={`/agents/${agent.id}`} className="text-sm font-medium text-primary underline">
            View your public profile →
          </Link>
        )}
      </Card>

      {agent.verification ? (
        <div id="get-verified" className="scroll-mt-4">
          <VerificationChecklist verification={agent.verification} steps={AGENT_VERIFICATION_STEPS} />
        </div>
      ) : null}

      <MyKycDocsCard kind="agent" id={agent.id} />

      <Button variant="outline" onClick={onSignOut} disabled={signingOut} className="w-full">
        <LogOut className="size-4" aria-hidden /> {signingOut ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}

/**
 * `/profile` — the signed-in user's own account. Drivers see their public-profile
 * preview + vehicles + edit; agents see their business details + edit; admins get
 * an Administration link. Everyone gets sign-out. Built on `useMyDriver` /
 * `useMyAgent`; a 404 means the account has no driver/agent profile yet → onboard.
 */
export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const effectiveRole = useEffectiveRole();
  const [signingOut, setSigningOut] = useState(false);
  const isDriver = effectiveRole === 'driver';
  const isAgent = effectiveRole === 'trip_manager';
  const driverQuery = useMyDriver(isDriver);
  const agentQuery = useMyAgent(isAgent);

  async function onSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      navigate('/signin', { replace: true });
    }
  }

  const q = isDriver ? driverQuery : isAgent ? agentQuery : null;
  const noProfile = q?.isError && q.error instanceof ApiError && q.error.status === 404;

  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="sr-only">Profile</h1>
      <button type="button" onClick={() => navigate(-1)} className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>
      {/* Header shell from useAuth() — paints the LCP element immediately instead of
          waiting on useMyDriver/useMyAgent (~1.3-1.4s). When the profile query lands,
          DriverProfile/AgentProfile renders with the full data and replaces the shell. */}
      {(isDriver || isAgent) && q?.isPending ? (
        <Card className="gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={user?.displayName ?? ''} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-xl font-bold">{user?.displayName || 'Your profile'}</h2>
              <div className="mt-1 h-4 w-32 animate-pulse rounded bg-muted" aria-hidden />
            </div>
          </div>
        </Card>
      ) : null}
      {!isDriver && !isAgent ? (
        <>
          <Card className="gap-2">
            <h2 className="text-xl font-bold">{user?.displayName || user?.phone}</h2>
            <p className="text-sm text-secondary">Admin account ({user?.role}).</p>
            <Link to="/administration" className="text-sm font-medium text-primary underline">
              Open Administration →
            </Link>
          </Card>
          <Button variant="outline" onClick={onSignOut} disabled={signingOut} className="w-full">
            <LogOut className="size-4" aria-hidden /> {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </>
      ) : noProfile ? (
        <Card className="gap-2">
          <h2 className="text-lg font-bold">Finish setting up your profile</h2>
          <p className="text-sm text-secondary">You don&apos;t have a {isAgent ? 'agent' : 'driver'} profile yet — complete onboarding to add one.</p>
          <Button asChild variant="full" size="sm" className="w-fit">
            <Link to="/onboarding">Set up my profile</Link>
          </Button>
        </Card>
      ) : q?.isPending ? (
        // The header shell above is already painted. Below-the-fold skeleton fills the rest.
        <LoadingSkeleton rows={5} />
      ) : q?.isError ? (
        <ErrorState title="Couldn't load your profile" message="Check your connection and try again." onRetry={() => void q.refetch()} />
      ) : isDriver && driverQuery.data ? (
        <DriverProfile driver={driverQuery.data} onSignOut={onSignOut} signingOut={signingOut} />
      ) : isAgent && agentQuery.data ? (
        <AgentProfile agent={agentQuery.data} onSignOut={onSignOut} signingOut={signingOut} />
      ) : null}
    </main>
  );
}

export default ProfilePage;
