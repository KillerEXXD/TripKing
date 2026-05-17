import { Link } from 'react-router-dom';
import { Car, Bell, Wallet, Users, MapPin, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { LoadingSkeleton } from '@/components/feedback';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';
import { formatINR } from '@/lib/utils';
import type { TripStatus } from '@/types';

const STATUSES: TripStatus[] = ['open', 'has_applicants'];

const MENU = [
  { to: '/v6/trips', icon: Car, ta: 'டிரிப்கள்', en: 'Trips' },
  { to: '/v6', icon: MapPin, ta: 'என்னுடைய', en: 'My trips' },
  { to: '/v6', icon: Wallet, ta: 'பணப்பை', en: 'Wallet' },
  { to: '/v6', icon: Bell, ta: 'அறிவிப்புகள்', en: 'Alerts' },
  { to: '/v6', icon: Users, ta: 'பரிந்துரை', en: 'Refer' },
  { to: '/v6', icon: Settings, ta: 'அமைப்பு', en: 'Settings' },
];

const CITY_TAMIL: Record<string, string> = {
  Vellore: 'வேலூர்',
  Chennai: 'சென்னை',
  Bangalore: 'பெங்களூரு',
  Tirupati: 'திருப்பதி',
  Salem: 'சேலம்',
  Coimbatore: 'கோயம்புத்தூர்',
  Pondicherry: 'புதுச்சேரி',
};
const ta = (n?: string) => (n ? (CITY_TAMIL[n] ?? n) : '—');

export function BharatHomePage() {
  const { user } = useAuth();
  const query = useTrips({ status: STATUSES });
  const trips = query.data ?? [];
  const firstName = (user?.displayName ?? user?.phone ?? '').split(' ')[0] || 'Driver';

  return (
    <div className="mx-auto max-w-md pb-10">
      <header className="bg-primary px-4 pb-6 pt-5 text-primary-foreground">
        <div className="text-[13px] opacity-80">வணக்கம் · Welcome</div>
        <div className="mt-1 text-[24px] font-semibold leading-tight">{firstName}</div>
      </header>

      <section aria-label="Menu" className="mx-4 -mt-4 grid grid-cols-3 gap-2 rounded-card bg-surface p-3 shadow-card">
        {MENU.map(({ to, icon: Icon, ta: tamil, en }) => (
          <Link
            key={`${en}-${to}`}
            to={to}
            className="flex flex-col items-center gap-1 rounded-card p-2 hover:bg-surface-muted"
          >
            <div className="grid size-10 place-items-center rounded-full bg-surface-muted text-primary">
              <Icon className="size-5" aria-hidden />
            </div>
            <div className="mt-0.5 text-center leading-tight">
              <div className="text-[12px] font-semibold">{tamil}</div>
              <div className="text-[10px] text-muted-foreground">{en}</div>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 px-4">
        <BilingualText ta="புதிய டிரிப்கள்" en="New trips" size="md" />
        <div className="mt-3 space-y-3">
          {query.isLoading ? (
            <LoadingSkeleton rows={3} />
          ) : trips.length === 0 ? (
            <div className="rounded-card bg-surface p-4 text-center text-[14px] text-muted-foreground shadow-card">
              டிரிப்கள் இல்லை · No trips
            </div>
          ) : (
            trips.slice(0, 4).map((t) => (
              <Link
                key={t.id}
                to={`/v6/trips/${t.id}`}
                className="flex items-center justify-between rounded-card bg-surface p-3 shadow-card"
              >
                <div className="min-w-0">
                  <div className="text-[16px] font-semibold leading-tight">
                    {ta(t.fromCity?.name)} → {ta(t.toCity?.name)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t.fromCity?.name} → {t.toCity?.name}
                  </div>
                </div>
                <div className="shrink-0 text-[16px] font-bold text-[var(--skin-bharat-vermilion)]">
                  {formatINR(t.driverPayout)}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default BharatHomePage;
