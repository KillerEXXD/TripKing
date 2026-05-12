/**
 * Domain types barrel — always `import type { … } from '@/types'`.
 *
 * Add `export * from './trip'` etc. as feature types land. Note: the
 * prototype's hard-coded unions (`CarType`, `FuelType`, `LanguageCode`) are
 * deliberately NOT here — those are admin-managed DB lookup rows fetched via
 * the API (see CLAUDE.md §"Administration").
 */
export * from './api';
export * from './user';
