import type { User, UserRole } from '@/types';

export type UserTransformErrorCode = 'MISSING_ID' | 'MISSING_ROLE' | 'BAD_ROLE' | 'MISSING_PHONE';

/** Thrown when an `/auth` or `/me` payload is missing a field the app requires. */
export class UserTransformError extends Error {
  constructor(
    message: string,
    public code: UserTransformErrorCode,
    public context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'UserTransformError';
  }
}

const ROLES: readonly UserRole[] = ['driver', 'trip_manager', 'admin'];

/** snake_case shape of a user as the API sends it. */
export interface ApiUser {
  id?: string;
  role?: string;
  phone?: string | null;
  email?: string | null;
  display_name?: string | null;
  preferred_language?: string | null;
  is_active?: boolean;
  can_report_bugs?: boolean;
}

export function transformUser(api: ApiUser): User {
  if (!api?.id) throw new UserTransformError('user payload has no id', 'MISSING_ID', { api });
  if (!api.role) throw new UserTransformError('user payload has no role', 'MISSING_ROLE', { id: api.id });
  if (!ROLES.includes(api.role as UserRole)) {
    throw new UserTransformError(`unknown user role "${api.role}"`, 'BAD_ROLE', { id: api.id, role: api.role });
  }
  if (!api.phone) throw new UserTransformError('user payload has no phone', 'MISSING_PHONE', { id: api.id });
  return {
    id: api.id,
    role: api.role as UserRole,
    phone: api.phone,
    email: api.email ?? undefined,
    displayName: api.display_name ?? '',
    preferredLanguage: api.preferred_language ?? 'en',
    isActive: api.is_active ?? true,
    canReportBugs: api.can_report_bugs === true,
  };
}
