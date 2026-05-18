import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Languages, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { languageHooks } from '@/hooks/useAdminConfig';
import { Badge, Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { LanguageRow } from '@/types';

function LanguageEntryRow({ lang, onToggle, onRemove, busy }: { lang: LanguageRow; onToggle: () => void; onRemove: () => void; busy: boolean }) {
  return (
    <Card className="flex-row items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="muted" className="font-mono">
            {lang.code}
          </Badge>
          <span className="font-semibold">{lang.nativeName || lang.englishName || lang.code}</span>
        </div>
        {lang.englishName && lang.englishName !== lang.nativeName ? <div className="text-xs text-secondary">{lang.englishName}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={lang.isActive} onChange={onToggle} disabled={busy} /> Active
        </label>
        <Button variant="ghost" size="sm" aria-label={`Remove ${lang.englishName || lang.code}`} onClick={onRemove} disabled={busy}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </Card>
  );
}

/**
 * `/app/administration/translations` — the translation manager (admin-only): the
 * `languages` lookup that drives which locales the consumer app offers (the
 * admin app is English-only; UI strings are `t('key')` resolved per active
 * locale). Add / activate / deactivate / remove languages via `languageHooks`.
 */
export function TranslationManagerPage() {
  const langsQuery = languageHooks.useList({ includeInactive: true });
  const create = languageHooks.useCreate();
  const toggle = languageHooks.useToggleActive();
  const remove = languageHooks.useRemove();
  const busy = create.isPending || toggle.isPending || remove.isPending;

  const [code, setCode] = useState('');
  const [nativeName, setNativeName] = useState('');
  const [englishName, setEnglishName] = useState('');
  const canAdd = code.trim().length > 0 && (nativeName.trim().length > 0 || englishName.trim().length > 0) && !create.isPending;

  function onAdd() {
    const c = code.trim().toLowerCase();
    const en = englishName.trim();
    const native = nativeName.trim();
    if (!c || (!en && !native)) {
      toast.error('Enter a locale code and at least one name');
      return;
    }
    create.mutate(
      { code: c, nativeName: native || en, englishName: en || native },
      {
        onSuccess: () => {
          toast.success(`Added ${c}`);
          setCode('');
          setNativeName('');
          setEnglishName('');
        },
        onError: () => toast.error("Couldn't add that language — try again."),
      },
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/app/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <h1 className="text-2xl font-bold">Translation manager</h1>
      <p className="text-sm text-secondary">Active locales here drive which languages the consumer app offers; the admin app stays English-only. UI strings are resolved per locale via <code>t('key')</code>.</p>

      <Card className="gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Add a language</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Locale code</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ta" aria-label="Locale code" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Native name</span>
            <Input value={nativeName} onChange={(e) => setNativeName(e.target.value)} placeholder="e.g. தமிழ்" aria-label="Native name" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">English name</span>
            <Input value={englishName} onChange={(e) => setEnglishName(e.target.value)} placeholder="e.g. Tamil" aria-label="English name" />
          </label>
        </div>
        <Button variant="full" size="sm" className="w-fit" onClick={onAdd} disabled={!canAdd}>
          {create.isPending ? 'Adding…' : 'Add language'}
        </Button>
      </Card>

      {langsQuery.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : langsQuery.isError ? (
        <ErrorState title="Couldn't load languages" message="Check your connection and try again." onRetry={() => void langsQuery.refetch()} />
      ) : (langsQuery.data ?? []).length === 0 ? (
        <EmptyState icon={<Languages className="size-7" />} title="No languages yet" message="Add the first locale above." />
      ) : (
        <div className="space-y-2">
          {(langsQuery.data ?? []).map((l) => (
            <LanguageEntryRow
              key={l.code}
              lang={l}
              busy={busy}
              onToggle={() => toggle.mutate({ id: l.code, isActive: !l.isActive })}
              onRemove={() => remove.mutate(l.code)}
            />
          ))}
        </div>
      )}
    </main>
  );
}

export default TranslationManagerPage;
