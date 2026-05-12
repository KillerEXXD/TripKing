import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { transformUser, type ApiUser } from '@/lib/api/transforms/user';
import type { User } from '@/types';

interface ApiAuthSession {
  user: ApiUser;
  access_token: string;
  refresh_token: string;
}

/** Send an SMS OTP to a phone number (E.164). */
export async function requestOtp(phone: string): Promise<void> {
  await apiClient.post('/auth/request-otp', { phone });
}

/** Verify an OTP; persists the token pair and returns the signed-in user. */
export async function verifyOtp(phone: string, otp: string): Promise<User> {
  const res = await apiClient.post<ApiAuthSession>('/auth/verify-otp', { phone, otp });
  const session = res.data;
  if (!session?.access_token || !session.user) {
    throw new EmptyResponseError('verify-otp');
  }
  apiClient.setTokens(session.access_token, session.refresh_token ?? null);
  return transformUser(session.user);
}

/** Fetch the current session's user (uses the stored access token; the client refreshes on 401). */
export async function getCurrentUser(): Promise<User> {
  const res = await apiClient.get<ApiUser>('/auth/me');
  if (!res.data) throw new EmptyResponseError('/auth/me');
  return transformUser(res.data);
}

/** Best-effort server logout, then clear local tokens regardless. */
export async function logout(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // ignore — clearing tokens locally is what matters
  } finally {
    apiClient.clearTokens();
  }
}
