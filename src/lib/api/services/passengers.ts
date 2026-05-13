/** Passengers directory — `GET /passengers` (admin list) + `GET /passengers/lookup?phone=` (post-trip prefill check). */
import { apiClient, ApiError } from '@/lib/api/client';
import { transformPassenger } from '@/lib/api/transforms/passenger';
import type { Passenger, PassengersQueryParams } from '@/types';

type Api = Record<string, unknown>;

/** `GET /passengers` — the admin directory: newest-registered first, optional `q` search. */
export function getPassengers(params?: PassengersQueryParams): Promise<Passenger[]> {
  const q: Record<string, unknown> = {};
  if (params?.q) q.q = params.q;
  if (params?.sort) q.sort = params.sort;
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/passengers', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformPassenger));
}

/** Paginated `GET /passengers` — page rows + `{ total, page, limit, hasMore }` meta. */
export function getPassengersPage(params?: PassengersQueryParams): Promise<{ data: Passenger[]; meta: { page: number; limit: number; total: number; hasMore: boolean } }> {
  const q: Record<string, unknown> = {};
  if (params?.q) q.q = params.q;
  if (params?.sort) q.sort = params.sort;
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/passengers', Object.keys(q).length ? q : undefined).then((r) => {
    const rawMeta = (r as { meta?: { total?: number; page?: number; limit?: number; has_more?: boolean } }).meta;
    const data = (r.data ?? []).map(transformPassenger);
    return {
      data,
      meta: {
        page: Number(rawMeta?.page ?? params?.page ?? 1),
        limit: Number(rawMeta?.limit ?? params?.limit ?? 50),
        total: Number(rawMeta?.total ?? data.length),
        hasMore: Boolean(rawMeta?.has_more ?? false),
      },
    };
  });
}

/**
 * `GET /passengers/lookup?phone=<e164>` — the passenger registered under that exact
 * phone, or `null` if none (the endpoint 404s, which we turn into `null` so the
 * post-trip form can tell "no match" from "still checking" from "error").
 */
export function lookupPassengerByPhone(phone: string): Promise<Passenger | null> {
  return apiClient
    .get<Api>('/passengers/lookup', { phone })
    .then((r) => (r.data ? transformPassenger(r.data) : null))
    .catch((e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    });
}
