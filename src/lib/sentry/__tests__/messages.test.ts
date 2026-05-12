import { describe, it, expect } from 'vitest';
import { messageForError, ERROR_MESSAGES } from '@/lib/sentry/messages';
import { ApiError } from '@/lib/api/client';

describe('messageForError', () => {
  it('uses the category default for server / network / timeout errors', () => {
    expect(messageForError(new ApiError('Internal error', 500))).toBe(ERROR_MESSAGES.server_5xx);
    expect(messageForError(new ApiError('Network error', 0))).toBe(ERROR_MESSAGES.network);
    expect(messageForError(new ApiError('Request timeout', 408))).toBe(ERROR_MESSAGES.timeout);
  });

  it('shows the server message verbatim for validation / rate-limit / forbidden ApiErrors', () => {
    expect(messageForError(new ApiError('from_city_id and to_city_id are required', 422))).toBe('from_city_id and to_city_id are required');
    expect(messageForError(new ApiError('Too many trips posted — try again shortly', 429))).toBe('Too many trips posted — try again shortly');
    expect(messageForError(new ApiError('Only the trip poster can see applicants', 403))).toBe('Only the trip poster can see applicants');
  });

  it('does not echo a generic / unsafe server message', () => {
    expect(messageForError(new ApiError('Request failed', 422))).toBe(ERROR_MESSAGES.validation);
    expect(messageForError(new ApiError('fetch error undefined', 400))).toBe(ERROR_MESSAGES.validation);
  });

  it('handles non-ApiError throwables', () => {
    expect(messageForError(new Error('boom'))).toBe(ERROR_MESSAGES.unknown);
    expect(messageForError('a string')).toBe(ERROR_MESSAGES.unknown);
    const t = Object.assign(new Error('missing MISSING_ID'), { name: 'TripTransformError' });
    expect(messageForError(t)).toBe(ERROR_MESSAGES.transform);
  });
});
