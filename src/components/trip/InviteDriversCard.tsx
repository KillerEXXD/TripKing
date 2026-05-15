import { useMemo, useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card } from '@/components/ui';
import { DriverIdentity } from '@/components/driver/DriverIdentity';
import { LoadingSkeleton } from '@/components/feedback';
import { useInviteDrivers, useTripInvites, useWithdrawTripInvite } from '@/hooks/useTrips';
import { useDrivers } from '@/hooks/useDrivers';
import { ApiError } from '@/lib/api/client';
import type { Trip, TripInvitation } from '@/types';

const INVITE_BADGE: Record<TripInvitation['status'], { label: string; variant: 'info' | 'success' | 'muted' | 'warning' }> = {
  pending: { label: 'Awaiting driver', variant: 'info' },
  applied: { label: 'Applied', variant: 'success' },
  declined: { label: 'Declined', variant: 'muted' },
  withdrawn: { label: 'Withdrawn', variant: 'muted' },
  expired: { label: 'Expired', variant: 'muted' },
};

/**
 * Poster-only card on the trip detail page: lists the drivers already invited to this trip,
 * and lets the poster invite more (KYC-approved drivers in the pickup city). Withdrawing an
 * invite removes it from the driver's "Invited" tab.
 */
export function InviteDriversCard({ trip }: { trip: Trip }) {
  const invites = useTripInvites(trip.id);
  const [picking, setPicking] = useState(false);
  const isOpen = trip.status === 'open' || trip.status === 'has_applicants';

  if (invites.isPending) return <LoadingSkeleton rows={2} />;
  const items = invites.data ?? [];
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const declinedCount = items.filter((i) => i.status === 'declined').length;
  const hasAnyInvite = items.length > 0;
  const buttonLabel = pendingCount > 0 ? 'Invite more' : 'Invite';

  return (
    <Card className="gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Invited drivers</div>
          <div className="text-xs text-secondary">
            Reach out to specific drivers — they&apos;ll see your name &amp; phone in their <span className="font-medium">Invited</span> tab.
          </div>
          {hasAnyInvite ? (
            <div className="mt-1 text-xs font-medium text-secondary">
              {pendingCount} pending{declinedCount > 0 ? ` · ${declinedCount} declined` : ''}
            </div>
          ) : null}
        </div>
        {isOpen ? (
          <Button size="sm" variant="outline" onClick={() => setPicking(true)} className="gap-1.5 shrink-0">
            <UserPlus className="size-3.5" aria-hidden /> {buttonLabel}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-secondary">No invites yet.</div>
      ) : (
        <ul className="space-y-2">
          {items.map((inv) => (
            <InviteRow key={inv.id} tripId={trip.id} invite={inv} canWithdraw={isOpen} />
          ))}
        </ul>
      )}

      {picking ? <InvitePickerDialog trip={trip} alreadyInvited={items.map((i) => i.driverId)} onClose={() => setPicking(false)} /> : null}
    </Card>
  );
}

function InviteRow({ tripId, invite, canWithdraw }: { tripId: string; invite: TripInvitation; canWithdraw: boolean }) {
  const withdraw = useWithdrawTripInvite();
  const badge = INVITE_BADGE[invite.status];
  return (
    <li className="flex items-center gap-2 rounded-lg border bg-white p-2">
      <div className="min-w-0 flex-1">
        <DriverIdentity driver={invite.driver} size="sm" />
      </div>
      <Badge variant={badge.variant} className="shrink-0">{badge.label}</Badge>
      {canWithdraw && invite.status === 'pending' ? (
        <Button
          size="sm"
          variant="ghost"
          className="size-7 p-0 shrink-0"
          aria-label="Withdraw invite"
          disabled={withdraw.isPending}
          onClick={() => {
            withdraw.mutate(
              { tripId, inviteId: invite.id },
              {
                onSuccess: () => toast.success('Invite withdrawn'),
                onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not withdraw'),
              },
            );
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </li>
  );
}

function InvitePickerDialog({ trip, alreadyInvited, onClose }: { trip: Trip; alreadyInvited: string[]; onClose: () => void }) {
  const fromCityId = trip.fromCity?.id;
  const drivers = useDrivers(fromCityId ? { currentCityId: fromCityId, kycStatus: 'approved', limit: 25 } : { kycStatus: 'approved', limit: 25 });
  const invite = useInviteDrivers();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const candidates = useMemo(() => (drivers.data ?? []).filter((d) => !alreadyInvited.includes(d.id)), [drivers.data, alreadyInvited]);

  function toggle(id: string) {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    if (picked.size === 0) return;
    invite.mutate(
      { tripId: trip.id, driverIds: Array.from(picked) },
      {
        onSuccess: (r) => {
          toast.success(`${r.created.length} invite${r.created.length === 1 ? '' : 's'} sent${r.skipped.length ? ` · ${r.skipped.length} skipped` : ''}`);
          onClose();
        },
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not invite'),
      },
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Invite drivers" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="font-semibold">Invite drivers</div>
          <Button size="sm" variant="ghost" className="size-8 p-0" onClick={onClose} aria-label="Close">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-3">
          {drivers.isPending ? (
            <LoadingSkeleton rows={4} />
          ) : candidates.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm text-secondary">
              No KYC-approved drivers in {trip.fromCity?.name ?? 'this city'} yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {candidates.map((d) => {
                const on = picked.has(d.id);
                return (
                  <li key={d.id}>
                    <label className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border p-2 text-left transition-colors ${on ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(d.id)}
                        className="size-4 shrink-0"
                        aria-label={`Invite ${d.fullName ?? d.displayHandle}`}
                      />
                      <DriverIdentity driver={d} size="sm" className="flex-1 min-w-0" />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={invite.isPending}>Cancel</Button>
          <Button size="sm" onClick={send} disabled={picked.size === 0 || invite.isPending}>
            Send {picked.size > 0 ? `(${picked.size})` : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

