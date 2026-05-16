import { useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import {
  useAdminList,
  useCreateAdminRow,
  useDeleteAdminRow,
  useUpdateAdminRow,
} from '@/hooks/useAdminStage5';
import type { AdminListKey } from '@/lib/api/services/admin-stage5';

type Row = Record<string, unknown>;

interface Props {
  listKey: AdminListKey;
  /** Columns to render in the table (and editable in the form). Excludes id/created_at by default. */
  columns: string[];
  /** Optional pretty labels per column. */
  labels?: Record<string, string>;
  itemNoun: string;
}

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Stage 5 — generic list editor for the new admin lists (referral-tiers,
 * fraud-action-rules, notification-templates). Untyped rows; the caller picks
 * which columns to expose. Inline edit + delete + add-row.
 */
export function AdminListEditor({ listKey, columns, labels = {}, itemNoun }: Props) {
  const q = useAdminList(listKey, { includeInactive: true });
  const create = useCreateAdminRow(listKey);
  const update = useUpdateAdminRow(listKey);
  const remove = useDeleteAdminRow(listKey);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row>({});

  function startEdit(row: Row) {
    setEditingId(String(row.id));
    setDraft({ ...row });
  }
  function cancel() {
    setEditingId(null);
    setDraft({});
  }
  async function save() {
    if (editingId === null) return;
    const patch: Row = {};
    for (const c of columns) patch[c] = draft[c];
    try {
      await update.mutateAsync({ id: editingId, patch });
      toast.success('Saved');
      cancel();
    } catch {}
  }
  async function add() {
    const input: Row = {};
    for (const c of columns) input[c] = draft[c];
    try {
      await create.mutateAsync(input);
      toast.success(`Added ${itemNoun}`);
      setDraft({});
    } catch {}
  }
  async function onDelete(id: string) {
    if (!confirm(`Delete this ${itemNoun}?`)) return;
    try {
      await remove.mutateAsync(id);
      toast.success(`Deleted ${itemNoun}`);
    } catch {}
  }

  if (q.isPending) return <LoadingSkeleton rows={4} />;
  if (q.isError) return <ErrorState title="Couldn't load list" message="Try again." onRetry={() => void q.refetch()} />;

  const rows = (q.data ?? []) as Row[];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-secondary">
              {columns.map((c) => <th key={c} className="px-2 py-1.5 font-semibold">{labels[c] ?? humanize(c)}</th>)}
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="px-2 py-3 text-center text-secondary">No {itemNoun}s yet.</td></tr>
            ) : rows.map((row) => {
              const id = String(row.id);
              const isEditing = editingId === id;
              return (
                <tr key={id} className="border-b last:border-0 align-top">
                  {columns.map((c) => (
                    <td key={c} className="px-2 py-1.5">
                      {isEditing ? (
                        <input
                          type={typeof row[c] === 'number' ? 'number' : 'text'}
                          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                          value={fmt(draft[c])}
                          onChange={(e) => setDraft((p) => ({ ...p, [c]: typeof row[c] === 'number' ? Number(e.target.value) : e.target.value }))}
                        />
                      ) : (
                        <span className="break-words">{fmt(row[c])}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    {isEditing ? (
                      <div className="inline-flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => void save()} aria-label="Save"><Save className="size-4" aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="sm" onClick={cancel} aria-label="Cancel"><X className="size-4" aria-hidden /></Button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(row)} aria-label="Edit"><Pencil className="size-4" aria-hidden /></Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void onDelete(id)} aria-label="Delete"><Trash2 className="size-4" aria-hidden /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingId === null ? (
        <Card className="gap-2">
          <div className="text-sm font-semibold">Add {itemNoun}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {columns.map((c) => (
              <label key={c} className="block text-xs font-medium text-secondary">
                {labels[c] ?? humanize(c)}
                <input
                  type="text"
                  className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                  value={fmt(draft[c])}
                  onChange={(e) => setDraft((p) => ({ ...p, [c]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void add()} disabled={create.isPending}>
              <Plus className="mr-1 size-4" aria-hidden /> Add
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
