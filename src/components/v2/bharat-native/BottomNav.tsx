import { Link, useLocation } from 'react-router-dom';
import { Home, Car, Wallet, Bell, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ITEMS: { to: string; ta: string; en: string; Icon: LucideIcon; match: (p: string) => boolean }[] = [
  { to: '/v6',               ta: 'வீடு',       en: 'Home',   Icon: Home,   match: (p) => p === '/v6' },
  { to: '/v6/trips',         ta: 'டிரிப்',     en: 'Trips',  Icon: Car,    match: (p) => p.startsWith('/v6/trips') },
  { to: '/v6/wallet',        ta: 'பணம்',       en: 'Money',  Icon: Wallet, match: (p) => p.startsWith('/v6/wallet') },
  { to: '/v6/notifications', ta: 'அறிவிப்பு',  en: 'Alerts', Icon: Bell,   match: (p) => p.startsWith('/v6/notifications') },
  { to: '/v6/profile',       ta: 'நீங்கள்',     en: 'You',    Icon: User,   match: (p) => p.startsWith('/v6/profile') },
];

/** v6 Bharat-Native — bottom nav. Indigo bar, bilingual labels, marigold dot on active. */
export function BharatBottomNav() {
  const { pathname, search } = useLocation();
  return (
    <nav aria-label="Bharat nav" className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md justify-around bg-primary px-2 pb-3 pt-2 text-primary-foreground">
      {ITEMS.map(({ to, ta, en, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={to}
            to={`${to}${search}`}
            aria-current={active ? 'page' : undefined}
            className="flex flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[10px]"
          >
            <div className="relative">
              <Icon className={`size-5 ${active ? '' : 'opacity-70'}`} aria-hidden />
              {active ? (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-0.5 size-1.5 rounded-full"
                  style={{ background: 'var(--skin-bharat-marigold)' }}
                />
              ) : null}
            </div>
            <span className={`leading-tight ${active ? 'font-bold' : 'opacity-75'}`}>{ta}</span>
            <span className="text-[9px] opacity-60">{en}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default BharatBottomNav;
