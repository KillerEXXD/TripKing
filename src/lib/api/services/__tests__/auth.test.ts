import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import * as userTransforms from '@/lib/api/transforms/user';
import { getCurrentUser, logout, requestOtp, verifyOtp } from '@/lib/api/services/auth';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(userTransforms, 'transformUser').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
});

describe('auth service', () => {
  it('requestOtp → POST /auth/request-otp { phone }', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(null) as never);
    await requestOtp('+919999999999');
    expect(post).toHaveBeenCalledWith('/auth/request-otp', { phone: '+919999999999' });
  });

  it('verifyOtp persists tokens via apiClient.setTokens, returns the transformed user', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockReturnValue(ok({ user: { id: 'u1' }, access_token: 'AT', refresh_token: 'RT' }) as never);
    const setTokens = vi.spyOn(apiClient, 'setTokens').mockImplementation(() => undefined);
    const user = await verifyOtp('+91', '12345');
    expect(post).toHaveBeenCalledWith('/auth/verify-otp', { phone: '+91', otp: '12345' });
    expect(setTokens).toHaveBeenCalledWith('AT', 'RT');
    expect(user.id).toBe('u1');
  });

  it('verifyOtp throws EmptyResponseError when access_token or user is missing', async () => {
    vi.spyOn(apiClient, 'post').mockReturnValue(ok({ user: null, access_token: '' }) as never);
    await expect(verifyOtp('+91', '12345')).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it('verifyOtp passes null to setTokens when refresh_token is absent', async () => {
    vi.spyOn(apiClient, 'post').mockReturnValue(ok({ user: { id: 'u1' }, access_token: 'AT' }) as never);
    const setTokens = vi.spyOn(apiClient, 'setTokens').mockImplementation(() => undefined);
    await verifyOtp('+91', '12345');
    expect(setTokens).toHaveBeenCalledWith('AT', null);
  });

  it('getCurrentUser → GET /auth/me, throws EmptyResponseError on empty body', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 'u1' }) as never);
    const u = await getCurrentUser();
    expect(get).toHaveBeenCalledWith('/auth/me');
    expect(u.id).toBe('u1');
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(null) as never);
    await expect(getCurrentUser()).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it('logout calls POST /auth/logout then clears tokens; clears tokens even when the request fails', async () => {
    const clearTokens = vi.spyOn(apiClient, 'clearTokens').mockImplementation(() => undefined);
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(null) as never);
    await logout();
    expect(post).toHaveBeenCalledWith('/auth/logout');
    expect(clearTokens).toHaveBeenCalledTimes(1);
    post.mockRejectedValueOnce(new Error('boom'));
    await expect(logout()).resolves.toBeUndefined();
    expect(clearTokens).toHaveBeenCalledTimes(2);
  });
});
