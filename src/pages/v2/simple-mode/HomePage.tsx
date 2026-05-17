import { Link } from 'react-router-dom';
import { Car, ClipboardList, IndianRupee, HelpCircle } from 'lucide-react';

/**
 * v7 Simple Mode — Home. Four big icon tiles, no clutter. One action
 * per tile. Persistent help line at the bottom tells the user what to tap.
 */
export function SimpleHomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="px-5 pt-6 pb-3">
        <div className="text-[18px] text-muted-foreground">Welcome</div>
        <div className="text-[28px] font-bold leading-tight">TripKing</div>
      </header>

      <main className="grid grid-cols-2 gap-3 px-5 pt-2">
        <Tile to="/v7/trips" icon={<Car className="size-12" />} label="Find a trip" hint="Pick a trip to drive" tone="go" />
        <Tile to="/v7/my-trips" icon={<ClipboardList className="size-12" />} label="My trips" hint="Trips you said yes to" />
        <Tile to="/v7/wallet" icon={<IndianRupee className="size-12" />} label="My money" hint="What you have" />
        <Tile to="/v7/profile" icon={<HelpCircle className="size-12" />} label="Help" hint="Get help here" />
      </main>

      <footer className="mt-auto px-5 pb-6 pt-8">
        <div className="rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-4 text-center">
          <div className="text-[18px] font-semibold">Tap a big square</div>
          <div className="text-[14px] text-muted-foreground">to choose what you want to do</div>
        </div>
      </footer>
    </div>
  );
}

function Tile({
  to, icon, label, hint, tone,
}: {
  to: string; icon: React.ReactNode; label: string; hint: string; tone?: 'go';
}) {
  const isGo = tone === 'go';
  return (
    <Link
      to={to}
      className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-card border-4 p-4 ${
        isGo
          ? 'border-[var(--skin-simple-go)] bg-[var(--skin-simple-go-bg)]'
          : 'border-border bg-surface'
      }`}
    >
      <div className={isGo ? 'text-[var(--skin-simple-go)]' : 'text-primary'}>{icon}</div>
      <div className="text-center leading-tight">
        <div className="text-[20px] font-bold">{label}</div>
        <div className="text-[13px] text-muted-foreground">{hint}</div>
      </div>
    </Link>
  );
}

export default SimpleHomePage;
