import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { cn } from '@/lib/utils';
import type { Agent, AgentPublic, KycStatus } from '@/types';

/**
 * Single source of truth for how a trip-manager (agent) is rendered. Twin of `DriverIdentity` —
 * the server decides whether the row is pre-reveal (handle only) or revealed (handle + fullName +
 * photo). Never fabricates a name from the handle and never crashes on missing identity fields.
 *
 * Optional `name` / `phone` / `profilePhotoUrl` overrides let the component be reused on a `Trip`
 * row where the poster fields are flat (`postedByName` / `postedByHandle` / `postedByPhone`).
 */
type AnyAgent = Agent | AgentPublic;
export interface AgentIdentityProps {
  agent?: AnyAgent | null;
  /** Override: pass the trip's `postedByHandle` when there's no full agent row to hand in. */
  handle?: string;
  /** Override: pass the trip's `postedByName` (optional — absent pre-reveal). */
  name?: string;
  /** Override: pass the trip's `postedByPhone` (optional — absent pre-reveal). */
  profilePhotoUrl?: string;
  /**
   * Override for the inline "Verified" badge — pass the trip's
   * `postedByKycStatus` when there's no full agent row. The badge shows iff
   * the resolved status is `'approved'`. Pre-reveal trip rows that don't
   * carry this just don't render the badge.
   */
  kycStatus?: KycStatus;
  size?: 'sm' | 'md' | 'lg';
  sub?: React.ReactNode;
  className?: string;
}

function initials(text: string): string {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const ch = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return ch.toUpperCase() || '·';
}

export function AgentIdentity({ agent, handle, name, profilePhotoUrl, kycStatus, size = 'md', sub, className }: AgentIdentityProps) {
  const h = handle ?? agent?.displayHandle ?? '';
  const n = name ?? (agent && 'fullName' in agent ? agent.fullName : undefined) ?? undefined;
  const photo = profilePhotoUrl ?? (agent && 'profilePhotoUrl' in agent ? agent.profilePhotoUrl : undefined) ?? undefined;
  const status = kycStatus ?? (agent && 'kycStatus' in agent ? agent.kycStatus : undefined);
  const isVerified = status === 'approved';
  const primary = n ?? (h ? `Agent ${h}` : 'Agent');
  const avatarSize = size === 'lg' ? 'size-16' : size === 'sm' ? 'size-8' : 'size-10';
  const nameSize = size === 'lg' ? 'text-xl font-bold' : 'text-sm font-semibold';
  const badgeSize = size === 'lg' ? 'sm' : 'xs';
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar className={avatarSize}>
        {photo ? <AvatarImage src={photo} alt={primary} /> : null}
        <AvatarFallback>{initials(n ?? h)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate', nameSize)}>{primary}</span>
          {isVerified ? <VerifiedBadge size={badgeSize} tone="emerald" /> : null}
        </div>
        {n && h ? <div className="font-mono text-[11px] uppercase tracking-wide text-secondary">{h}</div> : null}
        {sub ? <div className="text-xs text-secondary">{sub}</div> : null}
      </div>
    </div>
  );
}

export default AgentIdentity;
