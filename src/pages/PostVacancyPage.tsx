import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { usePostVacancy } from '@/hooks/useVacancies';
import { useMyDriver } from '@/hooks/useDrivers';
import { cityHooks } from '@/hooks/useAdminConfig';
import { Badge, Button, Card, Input } from '@/components/ui';
import { KycGateNotice } from '@/components/driver';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { PostVacancyInput } from '@/types';

const selectClass = 'h-11 w-full rounded-lg border border-input bg-background px-3 text-base';

function FlowHeader({ onBack }: { onBack: () => void }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3">
      <button type="button" aria-label="Back" onClick={onBack} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
        <ArrowLeft className="size-5" aria-hidden />
      </button>
      <h1 className="text-base font-semibold">Post your availability</h1>
    </header>
  );
}

function toIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * `/vacancies/new` — a driver posts their availability ("I'm in city X,
 * available [dates], willing to drive to [cities], min ₹/km"). Current city +
 * available-from + at least one destination are required. On success we go to
 * the vacancy feed. (The vehicle picker lands with the driver-profile screen.)
 */
export function PostVacancyPage() {
  const navigate = useNavigate();
  const postVacancy = usePostVacancy();
  const myDriverQuery = useMyDriver();
  const citiesQuery = cityHooks.useList();

  const [currentCityId, setCurrentCityId] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableUntil, setAvailableUntil] = useState('');
  const [destinationCityIds, setDestinationCityIds] = useState<string[]>([]);
  const [minRatePerKm, setMinRatePerKm] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  function toggleDestination(id: string) {
    setDestinationCityIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const fromIso = toIso(availableFrom);
  const canSubmit = currentCityId.length > 0 && !!fromIso && destinationCityIds.length > 0 && !postVacancy.isPending;

  async function onSubmit() {
    if (!currentCityId || !fromIso || destinationCityIds.length === 0) {
      toast.error('Pick your city, when you’re available, and at least one destination');
      return;
    }
    const input: PostVacancyInput = {
      currentCityId,
      availableFrom: fromIso,
      availableUntil: toIso(availableUntil) ?? undefined,
      destinationCityIds,
      minRatePerKm: minRatePerKm === '' ? undefined : Math.max(0, Number(minRatePerKm)),
      notes: notes.trim() || undefined,
    };
    try {
      await postVacancy.mutateAsync(input);
      toast.success('Availability posted');
      navigate('/vacancies');
    } catch {
      toast.error("Couldn't post your availability — try again.");
    }
  }

  if (citiesQuery.isPending) {
    return (
      <div className="mx-auto max-w-md">
        <FlowHeader onBack={() => navigate('/vacancies')} />
        <div className="p-4">
          <LoadingSkeleton rows={5} />
        </div>
      </div>
    );
  }
  if (citiesQuery.isError) {
    return (
      <div className="mx-auto max-w-md">
        <FlowHeader onBack={() => navigate('/vacancies')} />
        <div className="p-4">
          <ErrorState title="Couldn't load the form" message="We need the city list to post your availability." onRetry={() => void citiesQuery.refetch()} />
        </div>
      </div>
    );
  }

  if (myDriverQuery.data && myDriverQuery.data.kycStatus !== 'approved') {
    return (
      <div className="mx-auto max-w-md">
        <FlowHeader onBack={() => navigate('/vacancies')} />
        <div className="p-4">
          <KycGateNotice heading="Get verified to post your availability" body="Once your account is verified — documents, your vehicle, and a quick video call — you can show as available so agents can find you." />
        </div>
      </div>
    );
  }

  const cities = citiesQuery.data ?? [];

  return (
    <div className="mx-auto max-w-md">
      <FlowHeader onBack={() => navigate('/vacancies')} />
      <div className="space-y-3 p-4">
      <Card className="gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Where are you?</span>
          <select className={selectClass} value={currentCityId} onChange={(e) => setCurrentCityId(e.target.value)}>
            <option value="">Select your current city</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Available from</span>
            <Input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">
              Until <span className="font-normal text-secondary">(optional)</span>
            </span>
            <Input type="date" value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Minimum ₹ per km <span className="font-normal text-secondary">(optional)</span>
          </span>
          <Input type="number" min={0} step={1} inputMode="numeric" value={minRatePerKm} onChange={(e) => setMinRatePerKm(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 14" />
        </label>
      </Card>

      <Card className="gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Willing to drive to</div>
        <div className="flex flex-wrap gap-1.5">
          {cities.map((c) => {
            const active = destinationCityIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDestination(c.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? 'border-primary bg-primary/15 text-primary' : 'border-input bg-background hover:border-primary/40'}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        {destinationCityIds.length === 0 ? <p className="text-xs text-secondary">Pick at least one destination.</p> : <div className="flex flex-wrap gap-1.5">{destinationCityIds.map((id) => <Badge key={id} variant="muted">{cities.find((c) => c.id === id)?.name ?? id}</Badge>)}</div>}
      </Card>

      <Card>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Notes <span className="font-normal text-secondary">(optional)</span>
          </span>
          <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. prefer day trips; can leave early" />
        </label>
      </Card>

      {postVacancy.isError ? <p className="text-sm text-red-700">Couldn&apos;t post your availability — please try again.</p> : null}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => navigate('/vacancies')} disabled={postVacancy.isPending}>
          Cancel
        </Button>
        <Button type="button" variant="full" onClick={() => void onSubmit()} disabled={!canSubmit}>
          {postVacancy.isPending ? 'Posting…' : 'Post availability'}
        </Button>
      </div>
      </div>
    </div>
  );
}

export default PostVacancyPage;
