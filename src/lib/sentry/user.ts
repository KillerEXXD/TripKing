import * as Sentry from '@sentry/react';
import { getPostHogSessionId } from '@/lib/posthog';
import { isSentryInitialized } from './init';

/** What the app knows about the signed-in user for observability — never PII beyond id + role + name. */
export interface SentryUserInfo {
  id: string;
  role?: string;
  name?: string;
}

/** Attach the current user to subsequent Sentry events + breadcrumb the sign-in. Call after a successful login / session restore. */
export function setSentryUser(user: SentryUserInfo): void {
  if (!isSentryInitialized()) return;
  Sentry.setUser({ id: user.id, username: user.name, role: user.role });
  const phSession = getPostHogSessionId();
  if (phSession) Sentry.setTag('posthog_session_id', phSession);
  Sentry.addBreadcrumb({ category: 'auth', level: 'info', message: 'user identified', data: { role: user.role } });
}

/** Drop the user from Sentry. Call on logout / dead-session. */
export function clearSentryUser(): void {
  if (!isSentryInitialized()) return;
  Sentry.setUser(null);
  Sentry.addBreadcrumb({ category: 'auth', level: 'info', message: 'user cleared' });
}
