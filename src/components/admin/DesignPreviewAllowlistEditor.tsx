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

type Row = Record<string, unknown>;

/** Format a stored +91XXXXXXXXXX phone back to the 10-digit display form. */
function toDisplay(phone: unknown): string {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+91') && phone.length === 13) return phone.slice(3);
  return phone; // fall back to whatever's there (legacy rows)
}

/** Normalise a 10-digit input to the +91XXXXXXXXXX form we store. */
function toStored(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  return d.length === 10 ? `+91${d}` : d; // sub-10 returns raw so save can reject it
}

/**
 * Forgive common paste patterns:
 *   - `+91 9012345678` → `9012345678`
 *   - `091 9012345678` → `9012345678`
 *   - `9012345678`     → `9012345678` (already correct)
 *   - `9112345678`     → `9112345678` (real number starting with 91 kept intact —
 *                                       we only strip leading 91 when result still > 10)
 */
function normalizeTenDigit(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

function isValidTenDigit(digits: string): boolean {
  return /^\d{10}$/.test(digits);
}

interface Draft {
  phone: string;   // 10 digits in the UI, normalised to +91XXXXXXXXXX on save
  note: string;
  isActive: boolean;
}

const EMPTY_DRAFT: Draft = { phone: '', note: '', isActive: true };

/**
 * Bespoke editor for `public.design_preview_allowlist` — replaces the generic
 * AdminListEditor for this list. Three deliberate UX choices vs. the generic one:
 *
 *   1. Phone is a 10-digit numeric input only (inputMode="numeric"). Stored as
 *      +91XXXXXXXXXX so the /auth/me allowlist check (exact-match against
 *      public.users.phone) keeps working without backend normalisation.
 *   2. is_active is a Yes/No select (defaults to Yes on new rows) — easier to scan
 *      than "true / false" and matches operator language.
 *   3. sort_order is hidden — irrelevant for an allowlist where order doesn't matter.
 */
export function DesignPreviewAllowlistEditor() {
  const q = useAdminList('design-preview-allowlist', { includeInactive: true });
  const create = useCreateAdminRow('design-preview-allowlist');
  const update = useUpdateAdminRow('design-preview-allowlist');
  const remove = useDeleteAdminRow('design-preview-allowlist');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  function startEdit(row: Row) {
    setEditingId(String(row.id));
    setDraft({
      phone: toDisplay(row.phone),
      note: (row.note as string | null) ?? '',
      isActive: row.is_active !== false,
    });
  }
  function cancel() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }
  async function save() {
    if (editingId === null) return;
    if (!isValidTenDigit(draft.phone)) {
      toast.error('Phone must be exactly 10 digits.');
      return;
    }
    try {
      await update.mutateAsync({
        id: editingId,
        patch: { phone: toStored(draft.phone), note: draft.note || null, is_active: draft.isActive },
      });
      toast.success('Saved');
      cancel();
    } catch { /* mutation onError will toast */ }
  }
  async function add() {
    if (!isValidTenDigit(draft.phone)) {
      toast.error('Phone must be exactly 10 digits.');
      return;
    }
    try {
      await create.mutateAsync({
        phone: toStored(draft.phone),
        note: draft.note || null,
        is_active: draft.isActive,
      });
      toast.success('Phone added to allowlist');
      setDraft(EMPTY_DRAFT);
    } catch { /* mutation onError will toast */ }
  }
  async function onDelete(id: string) {
    if (!confirm('Remove this phone from the design preview allowlist?')) return;
    try {
      await remove.mutateAsync(id);
      toast.success('Removed');
    } catch { /* mutation onError will toast */ }
  }

  if (q.isPending) return <LoadingSkeleton rows={4} />;
  if (q.isError) return <ErrorState title="Couldn't load allowlist" message="Try again." onRetry={() => void q.refetch()} />;

  const rows = (q.data ?? []) as Row[];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-secondary">
              <th className="px-2 py-1.5 font-semibold">Phone</th>
              <th className="px-2 py-1.5 font-semibold">Note</th>
              <th className="px-2 py-1.5 font-semibold">Active</th>
              <th className="px-2 py-1.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-3 text-center text-secondary">No phones in the allowlist yet.</td></tr>
            ) : rows.map((row) => {
              const id = String(row.id);
              const isEditing = editingId === id;
              return (
                <tr key={id} className="border-b last:border-0 align-top">
                  <td className="px-2 py-1.5">
                    {isEditing ? (
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="\d{10}"
                        maxLength={10}
                        placeholder="10-digit phone"
                        aria-label="Phone (10 digits)"
                        className="w-32 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums"
                        value={draft.phone}
                        onChange={(e) => setDraft((p) => ({ ...p, phone: normalizeTenDigit(e.target.value) }))}
                      />
                    ) : (
                      <span className="font-mono text-sm tabular-nums">{toDisplay(row.phone)}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isEditing ? (
                      <input
                        type="text"
                        placeholder="e.g. Priya — design lead"
                        aria-label="Note"
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                        value={draft.note}
                        onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
                      />
                    ) : (
                      <span className="break-words text-secondary">{(row.note as string) || '—'}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {isEditing ? (
                      <select
                        aria-label="Active"
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                        value={draft.isActive ? 'yes' : 'no'}
                        onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.value === 'yes' }))}
                      >
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : (
                      <span className={row.is_active !== false ? 'font-semibold text-emerald-700' : 'text-secondary'}>
                        {row.is_active !== false ? 'Yes' : 'No'}
                      </span>
                    )}
                  </td>
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
          <div className="text-sm font-semibold">Add phone</div>
          <div className="grid gap-2 sm:grid-cols-[8rem_1fr_5rem]">
            <label className="block text-xs font-medium text-secondary">
              Phone (10 digits)
              <input
                type="tel"
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                placeholder="9012345678"
                className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums text-foreground"
                value={draft.phone}
                onChange={(e) => setDraft((p) => ({ ...p, phone: normalizeTenDigit(e.target.value) }))}
              />
            </label>
            <label className="block text-xs font-medium text-secondary">
              Note (optional)
              <input
                type="text"
                placeholder="e.g. Priya — design lead"
                className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                value={draft.note}
                onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-medium text-secondary">
              Active
              <select
                className="mt-0.5 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                value={draft.isActive ? 'yes' : 'no'}
                onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.value === 'yes' }))}
              >
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void add()} disabled={create.isPending || !isValidTenDigit(draft.phone)}>
              <Plus className="mr-1 size-4" aria-hidden /> Add
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
