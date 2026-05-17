import { Link } from 'react-router-dom';
import { ChevronLeft, Phone, BadgeCheck, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/** v7 Simple Mode — profile. Big tiles, big sign-out, big phone-number display. */
export function SimpleProfilePage() {
  const { user, logout } = useAuth();
  const name = user?.displayName ?? user?.phone ?? 'Driver';
  const initial = name.trim().charAt(0).toUpperCase() || 'T';

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center gap-3 px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="text-[22px] font-bold">You</div>
      </header>

      <section className="px-5">
        <div className="flex items-center gap-4 rounded-card border-2 border-border bg-surface p-5">
          <div className="grid size-20 place-items-center rounded-pill bg-primary text-[40px] font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-[22px] font-bold leading-tight">{name}</div>
            <div className="mt-1 text-[14px] text-muted-foreground">{user?.role ?? 'Driver'}</div>
          </div>
        </div>
      </section>

      <section className="mt-4 space-y-3 px-5">
        <BigTile
          icon={<Phone className="size-7" />}
          label="My phone number"
          value={user?.phone ?? '—'}
        />
        <BigTile
          icon={<BadgeCheck className="size-7" />}
          label="My documents"
          value="Verified ✓"
          tone="go"
        />
        <Link
          to="/v7"
          className="flex items-center gap-3 rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-4"
        >
          <HelpCircle className="size-7 text-[var(--skin-simple-wait)]" />
          <div className="flex-1">
            <div className="text-[18px] font-bold">Need help?</div>
            <div className="text-[13px] text-muted-foreground">Tap here to call support</div>
          </div>
        </Link>
      </section>

      <div className="mt-6 px-5">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control border-2 border-[var(--skin-simple-stop)] text-[18px] font-bold text-[var(--skin-simple-stop)]"
        >
          <LogOut className="size-5" /> Sign out
        </button>
      </div>
    </div>
  );
}

function BigTile({
  icon, label, value, tone,
}: {
  icon: React.ReactNode; label: string; value: string; tone?: 'go';
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-card border-2 p-4 ${
        tone === 'go'
          ? 'border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)]'
          : 'border-border bg-surface'
      }`}
    >
      <div className="text-primary">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        <div className="mt-0.5 text-[20px] font-bold">{value}</div>
      </div>
    </div>
  );
}

export default SimpleProfilePage;
