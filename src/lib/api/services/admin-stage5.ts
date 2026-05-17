/**
 * Stage 5 admin endpoints — singleton settings + new list resources +
 * `/admin/app-wallet`. Untyped pass-through rows (Record<string, unknown>);
 * the AdminConfigPage renders a generic field-list. When a per-table editor
 * is built, slot a typed transform here.
 */
import { apiClient, EmptyResponseError } from '@/lib/api/client';

type Row = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('admin-stage5');
  return d;
}

// ── Singleton settings (wallet-settings, referral-settings, fraud-settings) ─
export type SingletonKey = 'wallet-settings' | 'referral-settings' | 'fraud-settings';

export const getSingletonSettings = (key: SingletonKey): Promise<Row> =>
  apiClient.get<Row>(`/admin/${key}`).then((r) => unwrap(r.data));

export const updateSingletonSettings = (key: SingletonKey, patch: Row): Promise<Row> =>
  apiClient.patch<Row>(`/admin/${key}`, patch).then((r) => unwrap(r.data));

// ── List resources (referral-tiers, fraud-action-rules, notification-templates, design-preview-allowlist) ─
export type AdminListKey = 'referral-tiers' | 'fraud-action-rules' | 'notification-templates' | 'design-preview-allowlist';

export const listAdminRows = (key: AdminListKey, opts?: { includeInactive?: boolean }): Promise<Row[]> =>
  apiClient.get<Row[]>(`/admin/${key}`, opts?.includeInactive ? { include_inactive: true } : undefined).then((r) => r.data ?? []);

export const createAdminRow = (key: AdminListKey, input: Row): Promise<Row> =>
  apiClient.post<Row>(`/admin/${key}`, input).then((r) => unwrap(r.data));

export const updateAdminRow = (key: AdminListKey, id: string, patch: Row): Promise<Row> =>
  apiClient.patch<Row>(`/admin/${key}/${id}`, patch).then((r) => unwrap(r.data));

export const deleteAdminRow = (key: AdminListKey, id: string): Promise<void> =>
  apiClient.delete<unknown>(`/admin/${key}/${id}`).then(() => undefined);

// ── /admin/app-wallet ────────────────────────────────────────────────────────
export interface AppWalletBalance {
  totalPaise: number;
  lifetimeCollectedPaise: number;
  lifetimeRefundedPaise: number;
  entries: number;
}

export interface AppWalletLedgerEntry {
  id: string;
  entryType: string;
  amountPaise: number;
  note?: string;
  createdAt: string;
  fee?: { id?: string; tripId?: string; side?: string; payerUserId?: string; paymentSource?: string; status?: string };
}

export interface AppWallet {
  balance: AppWalletBalance;
  ledger: AppWalletLedgerEntry[];
}

function transformAppWalletEntry(api: Row): AppWalletLedgerEntry {
  const fee = (api.fee && typeof api.fee === 'object' ? api.fee : null) as Row | null;
  return {
    id: String(api.id ?? ''),
    entryType: String(api.entry_type ?? ''),
    amountPaise: Number(api.amount_paise ?? 0),
    note: typeof api.note === 'string' ? api.note : undefined,
    createdAt: String(api.created_at ?? ''),
    fee: fee
      ? {
          id: typeof fee.id === 'string' ? fee.id : undefined,
          tripId: typeof fee.trip_id === 'string' ? fee.trip_id : undefined,
          side: typeof fee.side === 'string' ? fee.side : undefined,
          payerUserId: typeof fee.payer_user_id === 'string' ? fee.payer_user_id : undefined,
          paymentSource: typeof fee.payment_source === 'string' ? fee.payment_source : undefined,
          status: typeof fee.status === 'string' ? fee.status : undefined,
        }
      : undefined,
  };
}

export const getAppWallet = (limit?: number): Promise<AppWallet> =>
  apiClient.get<Row>('/admin/app-wallet', limit ? { limit } : undefined).then((r) => {
    const data = unwrap(r.data);
    const bal = (data.balance ?? {}) as Row;
    const ledger = Array.isArray(data.ledger) ? (data.ledger as Row[]) : [];
    return {
      balance: {
        totalPaise: Number(bal.total_paise ?? 0),
        lifetimeCollectedPaise: Number(bal.lifetime_collected_paise ?? 0),
        lifetimeRefundedPaise: Number(bal.lifetime_refunded_paise ?? 0),
        entries: Number(bal.entries ?? 0),
      },
      ledger: ledger.map(transformAppWalletEntry),
    };
  });
