import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui';
import { LookupListEditor } from '@/components/admin/LookupListEditor';
import { AppSettingsForm } from '@/components/admin/AppSettingsForm';
import { CancelReasonsEditor, CitiesEditor, LanguagesEditor, MakesModelsEditor, ReviewTagsEditor, SeatOptionsEditor } from '@/components/admin/extraEditors';
import { carTypeHooks, fuelTypeHooks } from '@/hooks/useAdminConfig';

type SectionId =
  | 'general'
  | 'car-types'
  | 'fuel-types'
  | 'makes-models'
  | 'seat-options'
  | 'cities'
  | 'languages'
  | 'review-tags'
  | 'cancel-reasons';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'general', label: 'General settings' },
  { id: 'car-types', label: 'Car types' },
  { id: 'fuel-types', label: 'Fuel types' },
  { id: 'makes-models', label: 'Vehicle makes & models' },
  { id: 'seat-options', label: 'Seat options' },
  { id: 'cities', label: 'Cities' },
  { id: 'languages', label: 'Languages' },
  { id: 'review-tags', label: 'Review tags' },
  { id: 'cancel-reasons', label: 'Cancellation reasons' },
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

/** `/administration/config` — the master-data manager (§7.7). */
export function AdminConfigPage() {
  const [section, setSection] = useState<SectionId>('general');
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
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
        {section === 'makes-models' && <MakesModelsEditor />}
        {section === 'seat-options' && <SeatOptionsEditor />}
        {section === 'cities' && <CitiesEditor />}
        {section === 'languages' && <LanguagesEditor />}
        {section === 'review-tags' && <ReviewTagsEditor />}
        {section === 'cancel-reasons' && <CancelReasonsEditor />}
      </Card>
    </main>
  );
}

export default AdminConfigPage;
