import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { LookupRow } from '@/types';
import { ApiError } from '@/lib/api/client';
import { Button, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';

// Minimal structural shapes — a React Query `UseQueryResult` / `UseMutationResult`
// is assignable to these, so the page wires the hook bundle straight through.
interface QueryLike<T> {
  data?: T;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}
type MutateOpts = { onSuccess?: () => void; onError?: (e: unknown) => void };
interface MutationLike<V> {
  mutate: (vars: V, opts?: MutateOpts) => void;
  isPending: boolean;
}

export interface LookupListEditorProps {
  title: string;
  /** singular noun for the "Add a …" placeholder, e.g. "car type". */
  itemNoun: string;
  list: QueryLike<LookupRow[]>;
  create: MutationLike<{ label: string }>;
  update: MutationLike<{ id: string; patch: { label: string } }>;
  toggleActive: MutationLike<{ id: string; isActive: boolean }>;
  remove: MutationLike<string>;
  reorder: MutationLike<string[]>;
}

function moveError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return err instanceof Error ? err.message : fallback;
}

/**
 * Generic editor for a label-based admin lookup list (car types, fuel types, …):
 * add, rename (inline), enable/disable (soft), delete-if-unreferenced (the API
 * returns 409 → we offer "disable instead"), and reorder via up/down buttons.
 */
export function LookupListEditor({ title, itemNoun, list, create, update, toggleActive, remove, reorder }: LookupListEditorProps) {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const rows = list.data ?? [];

  function onAdd() {
    const label = newLabel.trim();
    if (!label) return;
    create.mutate(
      { label },
      {
        onSuccess: () => setNewLabel(''),
        onError: (e) => toast.error(moveError(e, `Couldn't add the ${itemNoun}`)),
      },
    );
  }
  function startEdit(row: LookupRow) {
    setEditingId(row.id);
    setEditLabel(row.label);
  }
  function saveEdit(id: string) {
    const label = editLabel.trim();
    if (!label) return;
    update.mutate(
      { id, patch: { label } },
      { onSuccess: () => setEditingId(null), onError: (e) => toast.error(moveError(e, "Couldn't rename")) },
    );
  }
  function onToggle(row: LookupRow) {
    toggleActive.mutate({ id: row.id, isActive: !row.isActive }, { onError: (e) => toast.error(moveError(e, "Couldn't update")) });
  }
  function onRemove(row: LookupRow) {
    remove.mutate(row.id, {
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409) {
          toast.error(`"${row.label}" is in use — disable it instead of deleting.`);
        } else {
          toast.error(moveError(e, "Couldn't delete"));
        }
      },
    });
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    reorder.mutate(next.map((r) => r.id), { onError: (e) => toast.error(moveError(e, "Couldn't reorder")) });
  }

  return (
    <section aria-labelledby={`section-${title}`} className="space-y-4">
      <h2 id={`section-${title}`} className="text-lg font-semibold">
        {title}
      </h2>

      <div className="flex gap-2">
        <Input
          placeholder={`Add a ${itemNoun}…`}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onAdd();
          }}
          aria-label={`New ${itemNoun} label`}
        />
        <Button onClick={onAdd} disabled={!newLabel.trim() || create.isPending}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </div>

      {list.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorState title={`Couldn't load ${title.toLowerCase()}`} message={moveError(list.error, '')} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()} yet`} message={`Add the first ${itemNoun} above.`} />
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((row, i) => (
            <li key={row.id} className={`flex items-center gap-2 p-3 ${row.isActive ? '' : 'opacity-50'}`}>
              <div className="flex flex-col">
                <button
                  type="button"
                  className="text-secondary/60 disabled:opacity-30"
                  aria-label={`Move ${row.label} up`}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="text-secondary/60 disabled:opacity-30"
                  aria-label={`Move ${row.label} down`}
                  disabled={i === rows.length - 1 || reorder.isPending}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>

              {editingId === row.id ? (
                <>
                  <Input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(row.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    aria-label={`Edit ${row.label}`}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => saveEdit(row.id)} disabled={!editLabel.trim() || update.isPending} aria-label="Save">
                    <Check className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel edit">
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1">{row.label}</span>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(row)} aria-label={`Rename ${row.label}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onToggle(row)} disabled={toggleActive.isPending}>
                    {row.isActive ? 'Disable' : 'Enable'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onRemove(row)} disabled={remove.isPending} aria-label={`Delete ${row.label}`}>
                    <Trash2 className="size-4 text-red-500" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default LookupListEditor;
