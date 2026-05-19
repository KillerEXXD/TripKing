import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Compass, MapPin, Route, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePostVacancy, useUpdateVacancy, useVacancy } from '@/hooks/useVacancies';
import { useAppBack } from '@/hooks/useAppBack';
import { useMyDriver } from '@/hooks/useDrivers';
import { cityHooks } from '@/hooks/useAdminConfig';
import { LocationSearchPanel } from '@/components/location/LocationSearchPanel';
import { PlacePinField } from '@/components/location/PlacePinField';
import { PageHeader, PageShell } from '@/components/layout';
import { Badge, Button, Card, Input, SectionLabel, Select, StickyFooterCTA } from '@/components/ui';
import { DateTimeField } from '@/components/form';
import { KycGateNotice } from '@/components/driver';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatClockTime, formatShortDate } from '@/lib/utils';
import type { Place, PostVacancyInput } from '@/types';

const HOUR_MS = 3_600_000;
const MIN_HOURS = 1;
const MAX_HOURS = 24;
const DEFAULT_HOURS = 4;
const STEP_HOURS = 1; // PostHog logged 21 rage clicks on the "+" stepper in 7d — 0.5h steps were too many taps

/** A `Date` → the value an `<input type="datetime-local">` expects: `YYYY-MM-DDTHH:mm` in local time. */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Clamp to [MIN_HOURS, MAX_HOURS], rounded to the nearest whole hour (STEP_HOURS). */
function clampHours(h: number): number {
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(h)));
}
/** "4 hrs" / "1 hr" / "0.5 hrs" */
function formatHours(h: number): string {
  const txt = Number.isInteger(h) ? String(h) : h.toFixed(1);
  return `${txt} hr${h === 1 ? '' : 's'}`;
}

/**
 * `/app/vacancies/new` — a driver posts their availability ("I'm in city X, available
 * from <time> for <N> hours, willing to drive to [cities], min ₹/km"). Current city
 * and at least one destination are required; the start time defaults to now and the
 * window length steps in half hours. On success we go to the vacancy feed.
 * (The vehicle picker lands with the driver-profile screen.)
 */
export function PostVacancyPage() {
  const navigate = useNavigate();
  const back = useAppBack();
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;
  const postVacancy = usePostVacancy();
  const updateVacancy = useUpdateVacancy();
  const myDriverQuery = useMyDriver();
  const citiesQuery = cityHooks.useList();
  const vacancyQuery = useVacancy(editId);

  const [currentCityId, setCurrentCityId] = useState('');
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocalValue(new Date()));
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [destinationCityIds, setDestinationCityIds] = useState<string[]>([]);
  const [destPlaces, setDestPlaces] = useState<Place[]>([]);
  const [destPlacePickerOpen, setDestPlacePickerOpen] = useState(false);
  const [destQuery, setDestQuery] = useState('');
  const [minRatePerKm, setMinRatePerKm] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isEdit || hydrated || !vacancyQuery.data) return;
    const v = vacancyQuery.data;
    setCurrentCityId(v.currentCity.id);
    setCurrentPlace(v.currentPlace ?? null);
    const from = new Date(v.availableFrom);
    if (!Number.isNaN(from.getTime())) {
      setStartLocal(toDatetimeLocalValue(from));
      if (v.availableUntil) {
        const until = new Date(v.availableUntil);
        if (!Number.isNaN(until.getTime())) {
          setHours(clampHours((until.getTime() - from.getTime()) / HOUR_MS));
        }
      }
    }
    setDestinationCityIds(v.destinationCities.map((c) => c.id));
    setDestPlaces(v.destinationPlaces);
    setMinRatePerKm(typeof v.minRatePerKm === 'number' ? v.minRatePerKm : '');
    setNotes(v.notes ?? '');
    setHydrated(true);
  }, [isEdit, hydrated, vacancyQuery.data]);

  function toggleDestination(id: string) {
    setDestinationCityIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function addDestPlace(p: Place) {
    setDestPlaces((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setDestPlacePickerOpen(false);
  }

  const startDate = new Date(startLocal);
  const startValid = !Number.isNaN(startDate.getTime());
  const endDate = startValid ? new Date(startDate.getTime() + hours * HOUR_MS) : null;
  const sameDay = !!endDate && startDate.toDateString() === endDate.toDateString();
  const hasDest = destinationCityIds.length > 0 || destPlaces.length > 0;
  const pending = postVacancy.isPending || updateVacancy.isPending;
  const canSubmit = currentCityId.length > 0 && startValid && hours >= MIN_HOURS && hasDest && !pending && (!isEdit || hydrated);

  async function onSubmit() {
    if (!currentCityId || !startValid || hours < MIN_HOURS || !hasDest) {
      toast.error('Pick your city, when you’re available, and at least one destination');
      return;
    }
    const input: PostVacancyInput = {
      currentCityId,
      currentPlaceId: currentPlace?.id,
      availableFrom: startDate.toISOString(),
      availableUntil: new Date(startDate.getTime() + hours * HOUR_MS).toISOString(),
      destinationCityIds,
      destinations: [...destinationCityIds.map((cityId) => ({ cityId })), ...destPlaces.map((p) => ({ placeId: p.id }))],
      minRatePerKm: minRatePerKm === '' ? undefined : Math.max(0, Number(minRatePerKm)),
      notes: notes.trim() || undefined,
    };
    try {
      if (isEdit && editId) {
        await updateVacancy.mutateAsync({ id: editId, input });
        toast.success('Availability updated');
      } else {
        await postVacancy.mutateAsync(input);
        toast.success('Availability posted');
      }
      navigate('/app/vacancies');
    } catch {
      toast.error(isEdit ? "Couldn't save your changes — try again." : "Couldn't post your availability — try again.");
    }
  }

  const pageTitle = isEdit ? 'Edit your vacancy' : "I'm vacant";

  if (citiesQuery.isPending) {
    return (
      <PageShell>
        <PageHeader title={pageTitle} onBack={back} />
        <LoadingSkeleton rows={5} />
      </PageShell>
    );
  }
  if (isEdit && vacancyQuery.isPending) {
    return (
      <PageShell>
        <PageHeader title="Edit your vacancy" onBack={back} />
        <LoadingSkeleton rows={5} />
      </PageShell>
    );
  }
  if (isEdit && vacancyQuery.isError) {
    return (
      <PageShell>
        <PageHeader title="Edit your vacancy" onBack={back} />
        <ErrorState title="Couldn't load this vacancy" message="We couldn't fetch the details — try again." onRetry={() => void vacancyQuery.refetch()} />
      </PageShell>
    );
  }
  if (citiesQuery.isError) {
    return (
      <PageShell>
        <PageHeader title={pageTitle} onBack={back} />
        <ErrorState title="Couldn't load the form" message="We need the city list to post your availability." onRetry={() => void citiesQuery.refetch()} />
      </PageShell>
    );
  }

  if (myDriverQuery.data && myDriverQuery.data.kycStatus !== 'approved') {
    return (
      <PageShell>
        <PageHeader title={pageTitle} onBack={back} />
        <KycGateNotice heading="Get verified to post your availability" body="Once your account is verified — documents, your vehicle, and a quick video call — you can show as available so agents can find you." />
      </PageShell>
    );
  }

  const cities = citiesQuery.data ?? [];
  const q = destQuery.trim().toLowerCase();
  const shownCities = cities.filter((c) => (q === '' || c.name.toLowerCase().includes(q)) || destinationCityIds.includes(c.id));

  return (
    <PageShell className="pb-32">
      <PageHeader title={pageTitle} onBack={back} />
      <div className="space-y-3">
      <Card className="gap-3">
        <SectionLabel icon={<Compass />} accent="green">Where & When</SectionLabel>
        <div className="space-y-1.5">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Where are you?</span>
            <Select tone="accent" value={currentCityId} onChange={(e) => setCurrentCityId(e.target.value)}>
              <option value="">Select your current city</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <PlacePinField value={currentPlace} onChange={setCurrentPlace} pinLabel="Pin your exact spot" pickerTitle="Pin your exact location" />
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <label className="block min-w-0 space-y-1">
              <span className="text-sm font-medium">Available from</span>
              <DateTimeField value={startLocal} onChange={setStartLocal} />
            </label>
            <div className="space-y-1">
              <span className="text-sm font-medium">For how long?</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Fewer hours"
                  disabled={hours <= MIN_HOURS}
                  onClick={() => setHours((h) => clampHours(h - STEP_HOURS))}
                  className="flex size-9 items-center justify-center rounded-lg border border-input text-lg leading-none disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-[3.5rem] text-center text-base font-semibold tabular-nums" aria-live="polite">
                  {formatHours(hours)}
                </span>
                <button
                  type="button"
                  aria-label="More hours"
                  disabled={hours >= MAX_HOURS}
                  onClick={() => setHours((h) => clampHours(h + STEP_HOURS))}
                  className="flex size-9 items-center justify-center rounded-lg border border-input text-lg leading-none disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          {startValid && endDate ? (
            <p className="text-sm text-secondary">
              Available <span className="font-semibold">{formatShortDate(startDate)}</span>, {formatClockTime(startDate)} → {sameDay ? null : <span className="font-semibold">{formatShortDate(endDate)} </span>}
              {formatClockTime(endDate)} <span className="text-xs">({formatHours(hours)})</span>
            </p>
          ) : (
            <p className="text-sm text-red-700">Pick a valid start time.</p>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Minimum ₹ per km <span className="font-normal text-secondary">(optional)</span>
          </span>
          <Input type="number" min={0} step={1} inputMode="numeric" value={minRatePerKm} onChange={(e) => setMinRatePerKm(e.target.value === '' ? '' : Number(e.target.value))} placeholder="e.g. 14" />
        </label>
      </Card>

      <Card className="gap-2">
        <SectionLabel icon={<Route />} accent="green">Willing to drive to</SectionLabel>
        <Input
          type="search"
          value={destQuery}
          onChange={(e) => setDestQuery(e.target.value)}
          placeholder="Filter the cities…"
          aria-label="Filter destination cities"
          className="h-9"
        />
        {shownCities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {shownCities.map((c) => {
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
        ) : (
          <p className="text-xs text-secondary">No cities match “{destQuery.trim()}”.</p>
        )}
        <button type="button" onClick={() => setDestPlacePickerOpen(true)} className="inline-flex items-center gap-1 self-start text-xs text-secondary underline underline-offset-2">
          <MapPin className="size-3" aria-hidden /> A place that&apos;s not in the list
        </button>
        {hasDest ? (
          <div className="flex flex-wrap gap-1.5">
            {destinationCityIds.map((id) => (
              <Badge key={`c-${id}`} variant="muted">
                {cities.find((c) => c.id === id)?.name ?? id}
              </Badge>
            ))}
            {destPlaces.map((p) => (
              <button
                key={`p-${p.id}`}
                type="button"
                onClick={() => setDestPlaces((prev) => prev.filter((x) => x.id !== p.id))}
                aria-label={`Remove the destination ${p.name}`}
                className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              >
                <MapPin className="size-3" aria-hidden /> {p.name} <X className="size-3" aria-hidden />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-secondary">Pick at least one destination.</p>
        )}
      </Card>

      <Card>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Notes <span className="font-normal text-secondary">(optional)</span>
          </span>
          <textarea rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. prefer day trips; can leave early" />
        </label>
      </Card>

      {postVacancy.isError || updateVacancy.isError ? <p className="text-sm text-red-700">{isEdit ? "Couldn't save your changes — please try again." : "Couldn't post your availability — please try again."}</p> : null}
      </div>

      <StickyFooterCTA>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="shrink-0" onClick={() => navigate('/app/vacancies')} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="full" className="min-w-0 flex-1" onClick={() => void onSubmit()} disabled={!canSubmit}>
            {pending ? (isEdit ? 'Saving…' : 'Posting…') : isEdit ? 'Save changes' : 'Post vacant'}
          </Button>
        </div>
      </StickyFooterCTA>

      {destPlacePickerOpen ? (
        <LocationSearchPanel title="Add a destination" placeholder="Search a town, area, or landmark…" onPick={addDestPlace} onClose={() => setDestPlacePickerOpen(false)} />
      ) : null}
    </PageShell>
  );
}

export default PostVacancyPage;
