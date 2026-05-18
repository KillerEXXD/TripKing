import { Link } from 'react-router-dom';
import { ChevronLeft, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';

/**
 * v2 Field Companion — profile. Big circular avatar placeholder, name
 * dominant, one card list, sticky sign-out CTA.
 */
export function FieldProfilePage() {
  const { user, logout } = useAuth();
  const name = user?.displayName ?? user?.phone ?? 'Driver';
  return (
    <div className="min-h-dvh pb-32">
      <header className="flex items-center gap-3 px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[22px] font-bold">You</h1>
      </header>

      <section className="mx-5 mt-6 rounded-card bg-surface p-6 text-center shadow-card">
        <div className="mx-auto grid size-20 place-items-center rounded-pill bg-primary text-primary-foreground">
          <UserIcon className="size-9" aria-hidden />
        </div>
        <div className="mt-4 text-[22px] font-semibold">{name}</div>
        <div className="mt-1 text-[14px] text-muted-foreground">{user?.role ?? 'Driver'} · {user?.phone}</div>
      </section>

      <nav aria-label="Account" className="mt-4 space-y-2 px-5">
        <Link to="/app/profile" className="block rounded-card bg-surface p-4 text-[16px] shadow-card">
          Open v1 profile
        </Link>
        <Link to="/v3/trips" className="block rounded-card bg-surface p-4 text-[16px] shadow-card">
          Browse trips
        </Link>
      </nav>

      <StickyCtaBar>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-destructive text-[17px] font-semibold text-white"
        >
          <LogOut className="size-5" /> Sign out
        </button>
      </StickyCtaBar>
    </div>
  );
}

export default FieldProfilePage;
