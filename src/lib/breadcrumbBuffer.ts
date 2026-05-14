/**
 * Breadcrumb buffer — taps the existing data-breadcrumb pipeline so that the
 * bug-reporter can attach a recent activity trail without relying on Sentry's
 * private buffer.
 *
 * Wraps the in-module `addDataBreadcrumb` from `@/lib/sentry/dataErrors` —
 * the existing call sites continue to fire that function (which forwards to
 * Sentry), and we additionally mirror to this local ring buffer.
 */

export interface BreadcrumbEntry {
  ts: number;
  category: string;
  level: string;
  message: string;
  data: Record<string, unknown>;
}

const MAX = 50;
const buffer: BreadcrumbEntry[] = [];

export function pushBreadcrumb(entry: Omit<BreadcrumbEntry, 'ts'>): void {
  buffer.push({ ts: Date.now(), ...entry });
  while (buffer.length > MAX) buffer.shift();
}

export function getBreadcrumbs(): BreadcrumbEntry[] {
  return buffer.slice();
}

export function __clearBreadcrumbsForTests(): void {
  buffer.length = 0;
}
