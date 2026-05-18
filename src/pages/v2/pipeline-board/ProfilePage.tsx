import { Link } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * v2 Pipeline Board — profile. Card-stack layout matching the
 * board aesthetic. Account "card" at top, then a stack of action
 * "cards" you can scan as a small to-do.
 */
export function PipelineProfilePage() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto max-w-md px-4 pb-8 pt-3">
      <header className="flex items-center gap-2">
        <Link to="/v4" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-5" />
        </Link>
        <h1 className="text-[16px] font-semibold">Account</h1>
      </header>

      <article className="mt-4 rounded-card bg-surface p-4 shadow-card">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Signed in as</div>
        <div className="mt-1 text-[18px] font-semibold">{user?.displayName ?? user?.phone ?? '—'}</div>
        <div className="mt-0.5 text-[12px] text-muted-foreground">{user?.phone} · {user?.role}</div>
      </article>

      <section aria-label="Quick links" className="mt-4 grid grid-cols-1 gap-2">
        <CardLink to="/v4/trips" title="Open the board" body="See your trips by stage" />
        <CardLink to="/app/profile" title="Full v1 profile" body="KYC, wallet, settings — everything" />
      </section>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-control border border-destructive text-destructive"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}

function CardLink({ to, title, body }: { to: string; title: string; body: string }) {
  return (
    <Link to={to} className="block rounded-card bg-surface p-3 shadow-card hover:shadow-md">
      <div className="text-[14px] font-semibold">{title}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{body}</div>
    </Link>
  );
}

export default PipelineProfilePage;
