import { useState } from 'react';
import { Card } from '@/components/ui';
import { LookupListEditor } from '@/components/admin/LookupListEditor';
import { AppSettingsForm } from '@/components/admin/AppSettingsForm';
import { carTypeHooks, fuelTypeHooks } from '@/hooks/useAdminConfig';

type SectionId = 'general' | 'car-types' | 'fuel-types' | 'more';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'general', label: 'General settings' },
  { id: 'car-types', label: 'Car types' },
  { id: 'fuel-types', label: 'Fuel types' },
  { id: 'more', label: 'More lists' },
];

/** A label-list section — calls the resource's 6 hooks and feeds them to the generic editor. */
function LabelListSection({ hooks, title, itemNoun }: { hooks: typeof carTypeHooks; title: string; itemNoun: string }) {
  return (
    <LookupListEditor
      title={title}
      itemNoun={itemNoun}
      list={hooks.useList({ includeInactive: true })}
      create={hooks.useCreate()}
      update={hooks.useUpdate()}
      toggleActive={hooks.useToggleActive()}
      remove={hooks.useRemove()}
      reorder={hooks.useReorder()}
    />
  );
}

/**
 * `/administration/config` — the master-data manager (§7.7).
 * General settings, Car types and Fuel types are wired; the remaining lists
 * (vehicle makes & models, seat options, cities, languages, review tags,
 * cancellation reasons) are the next iteration — their data layer
 * (`useAdminConfig`, `/admin/*`) is already in place.
 */
export function AdminConfigPage() {
  const [section, setSection] = useState<SectionId>('general');
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Reference data</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Reference-data sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            aria-current={section === s.id ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-sm ${section === s.id ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <Card>
        {section === 'general' && <AppSettingsForm />}
        {section === 'car-types' && <LabelListSection hooks={carTypeHooks} title="Car types" itemNoun="car type" />}
        {section === 'fuel-types' && <LabelListSection hooks={fuelTypeHooks} title="Fuel types" itemNoun="fuel type" />}
        {section === 'more' && (
          <div className="space-y-2 text-sm text-secondary">
            <p className="font-medium text-foreground">More lists — next iteration</p>
            <p>
              Vehicle makes &amp; models (master-detail), seat options, cities (name / state / lat / lng), languages,
              review tags (by vocabulary) and cancellation reasons get their editors next — the data layer
              (<code>useAdminConfig</code> hooks, the <code>/admin/*</code> contract) already supports all of them.
            </p>
          </div>
        )}
      </Card>
    </main>
  );
}

export default AdminConfigPage;
