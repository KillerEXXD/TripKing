/**
 * REST API envelope types.
 *
 * The TripKing API responds with `{ success, data, meta?, error }` — `meta`
 * is present on list responses, `error` is non-null on failures. The wire
 * format is `snake_case`; domain types are `camelCase` (transforms bridge it).
 */

/** Pagination metadata returned on list endpoints. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Error body shape from the API. */
export interface ApiErrorBody {
  code: string;
  message: string;
}

/** Standard response envelope. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta?: PaginationMeta;
  error: ApiErrorBody | null;
}

/** Common list-query params (`?page=&limit=&sort=`). */
export interface ListQueryParams {
  page?: number;
  limit?: number;
  sort?: string;
}
