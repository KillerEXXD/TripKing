import { Briefcase, Car, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useCanSwitchRole, useEffectiveRole, useRoleViewStore } from '@/stores/roleViewStore';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';

const OPTIONS: { role: UserRole; label: string; Icon: LucideIcon }[] = [
  { role: 'admin', label: 'Admin', Icon: ShieldCheck },
  { role: 'driver', label: 'Driver', Icon: Car },
  { role: 'trip_manager', label: 'Agent', Icon: Briefcase },
];

/**
 * The admin "view as" switch — a segmented Admin · Driver · Agent control.
 * Renders nothing for non-admins. Picking a role updates `useRoleViewStore`,
 * which flips `HomeForRole` (which home renders) and `BottomNav` (the tab set)
 * via `useEffectiveRole`. The choice is session-scoped (resets on tab close).
 */
export function RoleSwitcher() {
  const canSwitch = useCanSwitchRole();
  const active = useEffectiveRole();
  const setViewRole = useRoleViewStore((s) => s.setViewRole);
  if (!canSwitch) return null;

  return (
    <div className="flex items-center gap-2 border-b bg-white px-4 py-2">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-secondary">Viewing as</span>
      <div role="tablist" aria-label="View the app as" className="flex flex-1 items-center gap-1 rounded-full bg-muted p-0.5">
        {OPTIONS.map(({ role, label, Icon }) => {
          const isActive = role === active;
          return (
            <button
              key={role}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setViewRole(role)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-semibold transition-colors',
                isActive ? 'bg-white text-foreground shadow-sm' : 'text-secondary hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default RoleSwitcher;
