/**
 * Code constants only.
 *
 * Business reference data — car types, fuel types, cities, tags, default
 * commission %, default bata, etc. — lives in the database and is fetched
 * through the API (see CLAUDE.md §"Administration"). Do not add domain
 * picklists or default values here.
 */

/** OTP length for the phone-OTP auth + passenger handshake. */
export const OTP_LENGTH = 6;

/** Client-side image compression target before upload. */
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;

/** Debounce for search inputs (city search, etc.). */
export const SEARCH_DEBOUNCE_MS = 300;

/** Default list page size; the server caps the upper bound. */
export const DEFAULT_PAGE_SIZE = 20;

/** API client timeout. */
export const API_TIMEOUT_MS = 30_000;

/** Retry attempts for idempotent GETs. */
export const API_RETRY_ATTEMPTS = 3;
