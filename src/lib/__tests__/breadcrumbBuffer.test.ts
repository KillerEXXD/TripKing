import { describe, it, expect, beforeEach } from 'vitest';
import { __clearBreadcrumbsForTests, getBreadcrumbs, pushBreadcrumb } from '@/lib/breadcrumbBuffer';
import { addDataBreadcrumb } from '@/lib/sentry/dataErrors';

beforeEach(() => __clearBreadcrumbsForTests());

describe('breadcrumbBuffer', () => {
  it('caps at 50 entries (ring)', () => {
    for (let i = 0; i < 80; i++) pushBreadcrumb({ category: 'x', level: 'info', message: `m${i}`, data: {} });
    expect(getBreadcrumbs().length).toBe(50);
  });

  it('addDataBreadcrumb mirrors into the local buffer', () => {
    addDataBreadcrumb('request', { feature: 'trips', endpoint: '/trips', method: 'GET' });
    const last = getBreadcrumbs().pop();
    expect(last?.message).toBe('trips: request');
    expect(last?.data.endpoint).toBe('/trips');
  });
});
