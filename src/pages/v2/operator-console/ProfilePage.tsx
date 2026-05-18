import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * v2 Operator Console — profile. Dense info table + flat link list.
 * No avatar, no marketing — just the data + actions.
 */
export function OperatorProfilePage() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto max-w-md">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 text-[13px]">
        <Link to="/v2" aria-label="Back" className="rounded-control p-1 hover:bg-surface-muted">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="font-semibold">Account</span>
      </header>

      <dl>
        <Row label="Display name" value={user?.displayName ?? '—'} />
        <Row label="Phone" value={user?.phone ?? '—'} mono />
        <Row label="Role" value={user?.role ?? '—'} />
        <Row label="User ID" value={user?.id?.slice(0, 8).toUpperCase() ?? '—'} mono />
      </dl>

      <nav aria-label="Account actions" className="mt-2">
        <LinkRow to="/app/profile">Open v1 profile</LinkRow>
        <LinkRow to="/app/administration">Administration</LinkRow>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center justify-between border-b border-border px-3 py-2.5 text-left text-[13px] hover:bg-surface-muted"
        >
          <span className="inline-flex items-center gap-2 text-rose-600">
            <LogOut className="size-4" aria-hidden /> Sign out
          </span>
        </button>
      </nav>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[40%_60%] items-center gap-3 border-b border-border px-3 py-2 text-[13px]">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</dd>
    </div>
  );
}

function LinkRow({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between border-b border-border px-3 py-2.5 text-[13px] hover:bg-surface-muted"
    >
      <span>{children}</span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export default OperatorProfilePage;
