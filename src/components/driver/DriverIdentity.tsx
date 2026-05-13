import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Driver, DriverPublic, DriverSummary, AssignedDriver } from '@/types';

/**
 * Single source of truth for how a driver is rendered in lists / cards. The server decides what
 * to send: a pre-reveal row has only `displayHandle` + trust signals; a revealed row also has
 * `fullName` / `profilePhotoUrl`. This component renders both cases consistently — never
 * fabricates a name from the handle and never crashes when the identity fields are absent.
 *
 * Pass `size="lg"` for hero (profile-page) usage. The default is the list/card size.
 */
type AnyDriver = Driver | DriverPublic | DriverSummary | AssignedDriver;

export interface DriverIdentityProps {
  driver: AnyDriver | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  /** Secondary line below the name/handle (rating, vehicle, etc.). */
  sub?: React.ReactNode;
  className?: string;
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const ch = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return ch.toUpperCase() || '·';
}

export function DriverIdentity({ driver, size = 'md', sub, className }: DriverIdentityProps) {
  const handle = (driver && 'displayHandle' in driver ? driver.displayHandle : '') || '';
  const fullName = (driver && 'fullName' in driver ? driver.fullName : undefined) || undefined;
  const profilePhotoUrl = (driver && 'profilePhotoUrl' in driver ? driver.profilePhotoUrl : undefined) || undefined;
  const primary = fullName ?? (handle ? `Driver ${handle}` : 'Driver');
  const avatarSize = size === 'lg' ? 'size-16' : size === 'sm' ? 'size-8' : 'size-10';
  const nameSize = size === 'lg' ? 'text-xl font-bold' : 'text-sm font-semibold';
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar className={avatarSize}>
        {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt={primary} /> : null}
        <AvatarFallback>{initials(fullName ?? handle)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className={cn('truncate', nameSize)}>{primary}</div>
        {fullName && handle ? (
          <div className="font-mono text-[11px] uppercase tracking-wide text-secondary">{handle}</div>
        ) : null}
        {sub ? <div className="text-xs text-secondary">{sub}</div> : null}
      </div>
    </div>
  );
}

export default DriverIdentity;
