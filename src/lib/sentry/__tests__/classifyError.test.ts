import { describe, it, expect } from 'vitest';
import { classifyError } from '@/lib/sentry/dataErrors';
import { ApiError, EmptyResponseError } from '@/lib/api/client';

class FakeTransformError extends Error {
  constructor() {
    super('missing MISSING_ID');
    this.name = 'TripTransformError';
  }
}

describe('classifyError', () => {
  it('maps HTTP status codes', () => {
    expect(classifyError(new ApiError('x', 500))).toBe('server_5xx');
    expect(classifyError(new ApiError('x', 503))).toBe('server_5xx');
    expect(classifyError(new ApiError('x', 429))).toBe('rate_limit');
    expect(classifyError(new ApiError('x', 404))).toBe('not_found');
    expect(classifyError(new ApiError('x', 403))).toBe('forbidden');
    expect(classifyError(new ApiError('x', 401))).toBe('unauthorized');
    expect(classifyError(new ApiError('x', 422))).toBe('validation');
    expect(classifyError(new ApiError('x', 400))).toBe('validation');
    expect(classifyError(new ApiError('x', 409))).toBe('client_4xx');
  });

  it('uses an explicit ctx.status over the error', () => {
    expect(classifyError(new Error('whatever'), { status: 503 })).toBe('server_5xx');
  });

  it('classifies transport errors from ApiError shape', () => {
    expect(classifyError(new ApiError('Network error', 0))).toBe('network');
    expect(classifyError(new ApiError('Request timeout', 408))).toBe('timeout');
  });

  it('classifies transform / empty-response errors as transform', () => {
    expect(classifyError(new FakeTransformError())).toBe('transform');
    const empty = new EmptyResponseError('trips');
    expect(empty.name).toBe('EmptyResponseError');
    expect(empty.message).toMatch(/empty response body/i);
    expect(classifyError(empty)).toBe('transform');
  });

  it('classifies chunk-load errors as render', () => {
    const e = new Error('Failed to fetch dynamically imported module: /assets/x.js');
    expect(classifyError(e)).toBe('render');
    const c = Object.assign(new Error('Loading chunk 12 failed'), { name: 'ChunkLoadError' });
    expect(classifyError(c)).toBe('render');
  });

  it('falls back to message heuristics, then unknown', () => {
    expect(classifyError(new Error('Network request failed'))).toBe('network');
    expect(classifyError(new Error('Unexpected token < in JSON'))).toBe('parse');
    expect(classifyError(new Error('field is required'))).toBe('validation');
    expect(classifyError(new Error('something weird'))).toBe('unknown');
    expect(classifyError('a bare string')).toBe('unknown');
  });
});
