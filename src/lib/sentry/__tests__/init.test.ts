/**
 * Tests for the pure helpers exported from `src/lib/sentry/init.ts`.
 *
 * The init function itself (`initSentry()`) has global side effects on the Sentry SDK,
 * so it's exercised end-to-end in production rather than unit-tested. This file covers
 * the `isOurSwBridgeEvent` predicate that gates the SW-bridge short-circuit in
 * `beforeSend` — a regression here silently swallows every SW error our bridge sends.
 */

import { describe, it, expect } from 'vitest';
import type * as Sentry from '@sentry/react';
import { isOurSwBridgeEvent } from '@/lib/sentry/init';

function event(tags?: Record<string, unknown>): Sentry.ErrorEvent {
  return { tags } as unknown as Sentry.ErrorEvent;
}

describe('isOurSwBridgeEvent', () => {
  it('returns true when tags.source === "service-worker"', () => {
    expect(isOurSwBridgeEvent(event({ source: 'service-worker' }))).toBe(true);
  });

  it('returns true even with other tags alongside', () => {
    expect(isOurSwBridgeEvent(event({ source: 'service-worker', kind: 'unhandledrejection', release: 'tripking@1.0.0' }))).toBe(true);
  });

  it('returns false when source is anything else', () => {
    expect(isOurSwBridgeEvent(event({ source: 'react-query' }))).toBe(false);
    expect(isOurSwBridgeEvent(event({ source: 'apiClient' }))).toBe(false);
    expect(isOurSwBridgeEvent(event({ source: '' }))).toBe(false);
  });

  it('returns false when tags is missing', () => {
    expect(isOurSwBridgeEvent(event(undefined))).toBe(false);
    expect(isOurSwBridgeEvent(event({}))).toBe(false);
  });

  it('returns false when source key exists but is not a string', () => {
    expect(isOurSwBridgeEvent(event({ source: null }))).toBe(false);
    expect(isOurSwBridgeEvent(event({ source: 0 }))).toBe(false);
    expect(isOurSwBridgeEvent(event({ source: true }))).toBe(false);
  });
});
