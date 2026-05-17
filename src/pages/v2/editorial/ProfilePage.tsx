import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * v2 Editorial — profile. The "About the contributor" page of a
 * magazine: portrait initial, italic name, bio-like role line, a
 * thin reading list of actions.
 */
export function EditorialProfilePage() {
  const { user, logout } = useAuth();
  const name = user?.displayName ?? user?.phone ?? 'Driver';
  const initial = name.trim().charAt(0).toUpperCase() || 'T';

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <Link
        to="/v5"
        aria-label="Back"
        className="m-3 -ml-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground"
      >
        <ArrowLeft className="size-3" /> the journal
      </Link>

      <header className="border-b-2 border-foreground/80 pb-6 pt-2">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">About the contributor</div>
        <div className="mt-4 flex items-center gap-4">
          <div
            className="editorial-headline grid size-16 place-items-center rounded-full bg-foreground text-[28px] text-background"
          >
            {initial}
          </div>
          <h1 className="editorial-headline text-[32px] leading-tight">{name}</h1>
        </div>
        <p className="mt-4 text-[14px] italic text-muted-foreground">
          A {user?.role ?? 'contributor'} on the network, reachable at {user?.phone ?? 'a private line'}.
        </p>
      </header>

      <nav aria-label="Reading list" className="mt-6 divide-y divide-border">
        <ReadLink to="/profile">Full v1 profile</ReadLink>
        <ReadLink to="/v5/trips">Browse trips</ReadLink>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-baseline justify-between py-4 text-left text-[14px] italic text-destructive hover:underline"
        >
          Sign out of the journal
        </button>
      </nav>
    </div>
  );
}

function ReadLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex items-baseline justify-between py-4 text-[14px] hover:text-primary">
      <span>{children}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">read →</span>
    </Link>
  );
}

export default EditorialProfilePage;
