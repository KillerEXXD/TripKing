/**
 * Bespoke editors for the admin lookup lists that carry more than a label
 * (cities, languages, review tags, cancellation reasons, seat options, vehicle
 * models). Each: add-form + list + enable/disable (soft) + delete-if-unreferenced
 * (the API 409s → toast "disable instead"). Inline editing is intentionally
 * minimal for v1 — re-add to change a row.
 */
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { Button, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import {
  cancelReasonHooks,
  cityHooks,
  languageHooks,
  reviewTagHooks,
  useCreateSeatOption,
  useRemoveSeatOption,
  useReviewTagsByCategory,
  useSeatOptions,
  useToggleSeatOption,
  useVehicleModelsForMake,
  vehicleMakeHooks,
  vehicleModelHooks,
} from '@/hooks/useAdminConfig';
import type { CancelReasonAppliesTo, ReviewTagCategory, ReviewTagSentiment } from '@/types';

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message || fallback : fallback;
}
function onDeleteError(label: string) {
  return (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) toast.error(`"${label}" is in use — disable it instead of deleting.`);
    else toast.error(errMsg(e, "Couldn't delete"));
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${title}`} className="space-y-3">
      <h2 id={`sec-${title}`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RowShell({ active, children }: { active: boolean; children: ReactNode }) {
  return <li className={`flex items-center gap-2 p-3 ${active ? '' : 'opacity-50'}`}>{children}</li>;
}

// ── Seat options ────────────────────────────────────────────────────────────
export function SeatOptionsEditor() {
  const list = useSeatOptions({ includeInactive: true });
  const create = useCreateSeatOption();
  const toggle = useToggleSeatOption();
  const remove = useRemoveSeatOption();
  const [val, setVal] = useState('');
  const rows = list.data ?? [];
  return (
    <Section title="Seat options">
      <div className="flex gap-2">
        <Input
          type="number"
          min={1}
          placeholder="Add a seat count…"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          aria-label="New seat count"
          className="w-44"
        />
        <Button
          onClick={() => {
            const n = Number(val);
            if (!Number.isInteger(n) || n < 1) return;
            create.mutate(n, { onSuccess: () => setVal(''), onError: (e) => toast.error(errMsg(e, "Couldn't add")) });
          }}
          disabled={!val || create.isPending}
        >
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </div>
      {list.isPending ? (
        <LoadingSkeleton rows={2} />
      ) : list.isError ? (
        <ErrorState title="Couldn't load seat options" onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No seat options yet" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <span key={r.value} className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${r.isActive ? '' : 'opacity-50'}`}>
              {r.value}
              <button type="button" className="text-xs underline" onClick={() => toggle.mutate({ value: r.value, isActive: !r.isActive })}>
                {r.isActive ? 'disable' : 'enable'}
              </button>
              <button type="button" aria-label={`Delete ${r.value} seats`} onClick={() => remove.mutate(r.value, { onError: onDeleteError(String(r.value)) })}>
                <Trash2 className="size-3.5 text-red-500" />
              </button>
            </span>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Cities ──────────────────────────────────────────────────────────────────
export function CitiesEditor() {
  const list = cityHooks.useList({ includeInactive: true });
  const create = cityHooks.useCreate();
  const toggle = cityHooks.useToggleActive();
  const remove = cityHooks.useRemove();
  const [name, setName] = useState('');
  const [state, setState] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const rows = list.data ?? [];
  const canAdd = name.trim() && state.trim() && lat.trim() && lng.trim() && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng));
  return (
    <Section title="Cities">
      <div className="grid gap-2 sm:grid-cols-5">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="City name" />
        <Input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} aria-label="State" />
        <Input placeholder="Lat" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude" />
        <Input placeholder="Lng" value={lng} onChange={(e) => setLng(e.target.value)} aria-label="Longitude" />
        <Button
          onClick={() =>
            create.mutate(
              { name: name.trim(), state: state.trim(), lat: Number(lat), lng: Number(lng) },
              {
                onSuccess: () => {
                  setName('');
                  setState('');
                  setLat('');
                  setLng('');
                },
                onError: (e) => toast.error(errMsg(e, "Couldn't add the city")),
              },
            )
          }
          disabled={!canAdd || create.isPending}
        >
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </div>
      {list.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorState title="Couldn't load cities" onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No cities yet" message="Add the first city above — lat/lng power radius matching." />
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((c) => (
            <RowShell key={c.id} active={c.isActive}>
              <span className="flex-1">
                {c.name}, {c.state} <span className="text-xs text-secondary">({c.lat}, {c.lng})</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: c.id, isActive: !c.isActive })}>
                {c.isActive ? 'Disable' : 'Enable'}
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => remove.mutate(c.id, { onError: onDeleteError(c.name) })}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </RowShell>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Languages ───────────────────────────────────────────────────────────────
export function LanguagesEditor() {
  const list = languageHooks.useList({ includeInactive: true });
  const create = languageHooks.useCreate();
  const toggle = languageHooks.useToggleActive();
  const remove = languageHooks.useRemove();
  const [code, setCode] = useState('');
  const [native, setNative] = useState('');
  const [english, setEnglish] = useState('');
  const rows = list.data ?? [];
  return (
    <Section title="Languages">
      <div className="grid gap-2 sm:grid-cols-4">
        <Input placeholder="Code (e.g. bn)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Language code" />
        <Input placeholder="Native name" value={native} onChange={(e) => setNative(e.target.value)} aria-label="Native name" />
        <Input placeholder="English name" value={english} onChange={(e) => setEnglish(e.target.value)} aria-label="English name" />
        <Button
          onClick={() =>
            create.mutate(
              { code: code.trim(), nativeName: native.trim(), englishName: english.trim() } as never,
              {
                onSuccess: () => {
                  setCode('');
                  setNative('');
                  setEnglish('');
                },
                onError: (e) => toast.error(errMsg(e, "Couldn't add the language")),
              },
            )
          }
          disabled={!code.trim() || !native.trim() || !english.trim() || create.isPending}
        >
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </div>
      {list.isPending ? (
        <LoadingSkeleton rows={3} />
      ) : list.isError ? (
        <ErrorState title="Couldn't load languages" onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No languages yet" />
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((l) => (
            <RowShell key={l.code} active={l.isActive}>
              <span className="flex-1">
                <code className="text-xs">{l.code}</code> — {l.nativeName} ({l.englishName})
              </span>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: l.code, isActive: !l.isActive })}>
                {l.isActive ? 'Disable' : 'Enable'}
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${l.englishName}`} onClick={() => remove.mutate(l.code, { onError: onDeleteError(l.englishName) })}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </RowShell>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Cancellation reasons ────────────────────────────────────────────────────
const APPLIES_TO_OPTIONS: { value: CancelReasonAppliesTo; label: string }[] = [
  { value: 'agent', label: 'Agent' },
  { value: 'driver', label: 'Driver' },
  { value: 'both', label: 'Both' },
];
export function CancelReasonsEditor() {
  const list = cancelReasonHooks.useList({ includeInactive: true });
  const create = cancelReasonHooks.useCreate();
  const toggle = cancelReasonHooks.useToggleActive();
  const remove = cancelReasonHooks.useRemove();
  const [label, setLabel] = useState('');
  const [appliesTo, setAppliesTo] = useState<CancelReasonAppliesTo>('agent');
  const rows = list.data ?? [];
  return (
    <Section title="Cancellation reasons">
      <div className="flex gap-2">
        <Input placeholder="Add a reason…" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="New cancellation reason" />
        <select className="rounded-lg border px-2 text-sm" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as CancelReasonAppliesTo)} aria-label="Applies to">
          {APPLIES_TO_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          onClick={() =>
            create.mutate({ label: label.trim(), appliesTo } as never, {
              onSuccess: () => setLabel(''),
              onError: (e) => toast.error(errMsg(e, "Couldn't add the reason")),
            })
          }
          disabled={!label.trim() || create.isPending}
        >
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </div>
      {list.isPending ? (
        <LoadingSkeleton rows={3} />
      ) : list.isError ? (
        <ErrorState title="Couldn't load cancellation reasons" onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No cancellation reasons yet" />
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((r) => (
            <RowShell key={r.id} active={r.isActive}>
              <span className="flex-1">
                {r.label} <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs">{r.appliesTo}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => toggle.mutate({ id: r.id, isActive: !r.isActive })}>
                {r.isActive ? 'Disable' : 'Enable'}
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Delete ${r.label}`} onClick={() => remove.mutate(r.id, { onError: onDeleteError(r.label) })}>
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </RowShell>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── Review tags (three vocabularies) ────────────────────────────────────────
const REVIEW_CATEGORIES: { id: ReviewTagCategory; label: string }[] = [
  { id: 'passenger_to_driver', label: 'Passenger → driver' },
  { id: 'manager_to_driver', label: 'Agent → driver' },
  { id: 'driver_to_manager', label: 'Driver → agent' },
];
const SENTIMENTS: ReviewTagSentiment[] = ['positive', 'neutral', 'negative'];

function ReviewTagCategoryList({ category }: { category: ReviewTagCategory }) {
  const list = useReviewTagsByCategory(category, { includeInactive: true });
  const create = reviewTagHooks.useCreate();
  const toggle = reviewTagHooks.useToggleActive();
  const remove = reviewTagHooks.useRemove();
  const [label, setLabel] = useState('');
  const [sentiment, setSentiment] = useState<ReviewTagSentiment>('positive');
  const rows = list.data ?? [];
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input placeholder="Add a tag…" value={label} onChange={(e) => setLabel(e.target.value)} aria-label={`New ${category} tag`} />
        <select className="rounded-lg border px-2 text-sm" value={sentiment} onChange={(e) => setSentiment(e.target.value as ReviewTagSentiment)} aria-label="Sentiment">
          {SENTIMENTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button
          onClick={() =>
            create.mutate({ label: label.trim(), category, sentiment } as never, {
              onSuccess: () => setLabel(''),
              onError: (e) => toast.error(errMsg(e, "Couldn't add the tag")),
            })
          }
          disabled={!label.trim() || create.isPending}
        >
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </div>
      {list.isPending ? (
        <LoadingSkeleton rows={2} />
      ) : list.isError ? (
        <ErrorState title="Couldn't load tags" onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="No tags yet" />
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((t) => (
            <span
              key={t.id}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${t.isActive ? '' : 'opacity-50'} ${t.sentiment === 'negative' ? 'border-red-200 bg-red-50' : t.sentiment === 'positive' ? 'border-emerald-200 bg-emerald-50' : ''}`}
            >
              {t.label}
              <button type="button" className="text-xs underline" onClick={() => toggle.mutate({ id: t.id, isActive: !t.isActive })}>
                {t.isActive ? 'disable' : 'enable'}
              </button>
              <button type="button" aria-label={`Delete ${t.label}`} onClick={() => remove.mutate(t.id, { onError: onDeleteError(t.label) })}>
                <Trash2 className="size-3.5 text-red-500" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
export function ReviewTagsEditor() {
  return (
    <Section title="Review tags">
      {REVIEW_CATEGORIES.map((c) => (
        <div key={c.id} className="space-y-2">
          <h3 className="text-sm font-semibold text-secondary">{c.label}</h3>
          <ReviewTagCategoryList category={c.id} />
        </div>
      ))}
    </Section>
  );
}

// ── Vehicle makes & models (master-detail) ──────────────────────────────────
export function MakesModelsEditor() {
  const makesList = vehicleMakeHooks.useList({ includeInactive: true });
  const makes = makesList.data ?? [];
  const [makeId, setMakeId] = useState<string | undefined>(undefined);
  const selectedMakeId = makeId ?? makes[0]?.id;

  // makes side
  const createMake = vehicleMakeHooks.useCreate();
  const toggleMake = vehicleMakeHooks.useToggleActive();
  const removeMake = vehicleMakeHooks.useRemove();
  const [newMake, setNewMake] = useState('');

  // models side
  const modelsList = useVehicleModelsForMake(selectedMakeId, { includeInactive: true });
  const createModel = vehicleModelHooks.useCreate();
  const toggleModel = vehicleModelHooks.useToggleActive();
  const removeModel = vehicleModelHooks.useRemove();
  const [newModel, setNewModel] = useState('');
  const models = modelsList.data ?? [];

  return (
    <Section title="Vehicle makes & models">
      <div className="grid gap-6 sm:grid-cols-2">
        {/* makes */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-secondary">Makes</h3>
          <div className="flex gap-2">
            <Input placeholder="Add a make…" value={newMake} onChange={(e) => setNewMake(e.target.value)} aria-label="New make" />
            <Button
              onClick={() => createMake.mutate({ label: newMake.trim() }, { onSuccess: () => setNewMake(''), onError: (e) => toast.error(errMsg(e, "Couldn't add")) })}
              disabled={!newMake.trim() || createMake.isPending}
            >
              <Plus className="size-4" aria-hidden /> Add
            </Button>
          </div>
          {makesList.isPending ? (
            <LoadingSkeleton rows={4} />
          ) : makesList.isError ? (
            <ErrorState title="Couldn't load makes" onRetry={() => void makesList.refetch()} />
          ) : makes.length === 0 ? (
            <EmptyState title="No makes yet" />
          ) : (
            <ul className="divide-y rounded-xl border">
              {makes.map((m) => (
                <li
                  key={m.id}
                  className={`flex items-center gap-2 p-2.5 ${m.isActive ? '' : 'opacity-50'} ${m.id === selectedMakeId ? 'bg-black/5' : ''}`}
                >
                  <button type="button" className="flex-1 text-left" onClick={() => setMakeId(m.id)}>
                    {m.label}
                  </button>
                  <button type="button" className="text-xs underline" onClick={() => toggleMake.mutate({ id: m.id, isActive: !m.isActive })}>
                    {m.isActive ? 'disable' : 'enable'}
                  </button>
                  <button type="button" aria-label={`Delete ${m.label}`} onClick={() => removeMake.mutate(m.id, { onError: onDeleteError(m.label) })}>
                    <Trash2 className="size-3.5 text-red-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* models for the selected make */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-secondary">{selectedMakeId ? `Models — ${makes.find((m) => m.id === selectedMakeId)?.label ?? ''}` : 'Models'}</h3>
          {!selectedMakeId ? (
            <EmptyState title="Pick a make on the left" />
          ) : (
            <>
              <div className="flex gap-2">
                <Input placeholder="Add a model…" value={newModel} onChange={(e) => setNewModel(e.target.value)} aria-label="New model" />
                <Button
                  onClick={() =>
                    createModel.mutate({ makeId: selectedMakeId, name: newModel.trim() } as never, {
                      onSuccess: () => setNewModel(''),
                      onError: (e) => toast.error(errMsg(e, "Couldn't add")),
                    })
                  }
                  disabled={!newModel.trim() || createModel.isPending}
                >
                  <Plus className="size-4" aria-hidden /> Add
                </Button>
              </div>
              {modelsList.isPending ? (
                <LoadingSkeleton rows={4} />
              ) : modelsList.isError ? (
                <ErrorState title="Couldn't load models" onRetry={() => void modelsList.refetch()} />
              ) : models.length === 0 ? (
                <EmptyState title="No models for this make yet" />
              ) : (
                <ul className="divide-y rounded-xl border">
                  {models.map((m) => (
                    <RowShell key={m.id} active={m.isActive}>
                      <span className="flex-1">
                        {m.name}
                        {m.defaultSeats ? <span className="ml-1 text-xs text-secondary">· {m.defaultSeats} seats</span> : null}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => toggleModel.mutate({ id: m.id, isActive: !m.isActive })}>
                        {m.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${m.name}`} onClick={() => removeModel.mutate(m.id, { onError: onDeleteError(m.name) })}>
                        <Trash2 className="size-4 text-red-500" />
                      </Button>
                    </RowShell>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
