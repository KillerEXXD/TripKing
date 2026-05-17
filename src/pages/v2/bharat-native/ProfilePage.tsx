import { Link } from 'react-router-dom';
import { ChevronLeft, LogOut, Phone, BadgeCheck, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';

/**
 * v2 Bharat-Native — profile. Indigo header with avatar circle, three
 * info tiles, big bilingual action rows, vermilion sign-out.
 */
export function BharatProfilePage() {
  const { user, logout } = useAuth();
  const name = user?.displayName ?? user?.phone ?? 'Driver';
  const initial = name.trim().charAt(0).toUpperCase() || 'T';

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="bg-primary px-4 pb-8 pt-4 text-primary-foreground">
        <Link to="/v6" aria-label="Back" className="inline-flex size-9 items-center justify-center rounded-pill bg-white/15">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <div className="grid size-16 place-items-center rounded-full bg-white/20 text-[28px] font-bold">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-[20px] font-semibold leading-tight">{name}</div>
            <div className="text-[13px] opacity-80">{user?.role ?? '—'}</div>
          </div>
        </div>
      </header>

      <section className="mx-4 -mt-5 grid grid-cols-2 gap-3 rounded-card bg-surface p-3 shadow-card">
        <InfoTile icon={<Phone className="size-4" />} ta="தொலைபேசி" en="Phone" value={user?.phone ?? '—'} />
        <InfoTile icon={<BadgeCheck className="size-4" />} ta="நிலை" en="Status" value="Active" />
      </section>

      <nav aria-label="Account actions" className="mt-6 px-4">
        <ActionRow to="/profile" ta="முழு சுயவிவரம்" en="Full profile (v1)" />
        <ActionRow to="/v6/trips" ta="டிரிப்கள்" en="Browse trips" />
      </nav>

      <div className="mt-6 px-4">
        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control text-[16px] font-semibold text-primary-foreground"
          style={{ background: 'var(--skin-bharat-vermilion)' }}
        >
          <LogOut className="size-5" /> வெளியேறு · Sign out
        </button>
      </div>
    </div>
  );
}

function InfoTile({ icon, ta, en, value }: { icon: React.ReactNode; ta: string; en: string; value: string }) {
  return (
    <div className="rounded-card bg-surface-muted p-3">
      <div className="flex items-center gap-1.5 text-primary">{icon}</div>
      <BilingualText ta={ta} en={en} size="sm" className="mt-1" />
      <div className="mt-1 text-[14px] font-semibold">{value}</div>
    </div>
  );
}

function ActionRow({ to, ta, en }: { to: string; ta: string; en: string }) {
  return (
    <Link to={to} className="flex items-center justify-between rounded-card bg-surface p-4 shadow-card mb-2">
      <BilingualText ta={ta} en={en} size="md" />
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

export default BharatProfilePage;
