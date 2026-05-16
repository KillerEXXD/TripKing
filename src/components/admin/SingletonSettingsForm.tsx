import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useSingletonSettings, useUpdateSingletonSettings } from '@/hooks/useAdminStage5';
import type { SingletonKey } from '@/lib/api/services/admin-stage5';

type Row = Record<string, unknown>;

interface Props {
  settingsKey: SingletonKey;
  /** Field display order — keys not listed here render at the end alphabetically. */
  pinnedFields?: string[];
  /** Pretty label per field. */
  labels?: Record<string, string>;
}

const READ_ONLY_KEYS = new Set(['id', 'created_at', 'updated_at']);

function inferKind(value: unknown): 'number' | 'boolean' | 'string' | 'json' {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) return 'json';
  return 'string';
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Stage 5 — generic singleton-settings editor for /admin/{wallet,referral,fraud}-settings.
 * Renders one input per known key based on its current value type. The user edits the
 * patch in-place; Save sends only the changed keys.
 */
export function SingletonSettingsForm({ settingsKey, pinnedFields = [], labels = {} }: Props) {
  const q = useSingletonSettings(settingsKey);
  const update = useUpdateSingletonSettings(settingsKey);
  const [draft, setDraft] = useState<Row>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (q.data) setDraft({ ...q.data });
  }, [q.data]);

  const fields = useMemo(() => {
    if (!q.data) return [] as string[];
    const all = Object.keys(q.data).filter((k) => !READ_ONLY_KEYS.has(k));
    const head = pinnedFields.filter((k) => all.includes(k));
    const tail = all.filter((k) => !head.includes(k)).sort();
    return [...head, ...tail];
  }, [q.data, pinnedFields]);

  function setField(k: string, v: unknown) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  async function onSave() {
    if (!q.data) return;
    if (Object.keys(errors).length > 0) {
      toast.error('Fix invalid fields before saving');
      return;
    }
    const patch: Row = {};
    for (const k of fields) {
      const orig = q.data[k];
      const cur = draft[k];
      if (inferKind(orig) === 'json') {
        if (JSON.stringify(orig) !== JSON.stringify(cur)) patch[k] = cur;
      } else if (orig !== cur) {
        patch[k] = cur;
      }
    }
    if (Object.keys(patch).length === 0) {
      toast.info('No changes to save');
      return;
    }
    try {
      await update.mutateAsync(patch);
      toast.success('Saved');
    } catch {
      // global mutation funnel toasts
    }
  }

  if (q.isPending) return <LoadingSkeleton rows={5} />;
  if (q.isError) return <ErrorState title="Couldn't load settings" message="Try again." onRetry={() => void q.refetch()} />;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((k) => {
          const value = draft[k];
          const orig = q.data?.[k];
          const kind = inferKind(orig);
          const label = labels[k] ?? humanize(k);
          if (kind === 'boolean') {
            return (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!value} onChange={(e) => setField(k, e.target.checked)} />
                <span>{label}</span>
              </label>
            );
          }
          if (kind === 'number') {
            return (
              <label key={k} className="block text-sm font-medium">
                {label}
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={typeof value === 'number' ? value : ''}
                  onChange={(e) => setField(k, e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            );
          }
          if (kind === 'json') {
            return (
              <label key={k} className="col-span-full block text-sm font-medium">
                {label}
                <textarea
                  className="mt-1 h-24 w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
                  value={JSON.stringify(value ?? null, null, 2)}
                  onChange={(e) => {
                    try {
                      setField(k, JSON.parse(e.target.value));
                      setErrors((prev) => {
                        if (!(k in prev)) return prev;
                        const rest = { ...prev };
                        delete rest[k];
                        return rest;
                      });
                    } catch {
                      setErrors((prev) => ({ ...prev, [k]: 'Invalid JSON' }));
                    }
                  }}
                />
                {errors[k] ? <p className="mt-1 text-xs text-destructive">{errors[k]}</p> : null}
              </label>
            );
          }
          return (
            <label key={k} className="col-span-full block text-sm font-medium">
              {label}
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => setField(k, e.target.value)}
              />
            </label>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={update.isPending || Object.keys(errors).length > 0}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
