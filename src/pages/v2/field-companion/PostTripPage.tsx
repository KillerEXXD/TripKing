import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Flag, Calendar, Car, IndianRupee, Check } from 'lucide-react';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';

const STEPS = [
  { key: 'from', label: 'Pickup city', icon: MapPin, placeholder: 'e.g. Vellore' },
  { key: 'to', label: 'Drop city', icon: Flag, placeholder: 'e.g. Chennai' },
  { key: 'when', label: 'When?', icon: Calendar, placeholder: 'Tomorrow 2:30 PM' },
  { key: 'vehicle', label: 'Vehicle', icon: Car, placeholder: 'Sedan · 4 seats' },
  { key: 'fare', label: 'Fare', icon: IndianRupee, placeholder: '4200' },
];

/**
 * v2 Field — post-trip wizard. One field per screen, big input, big CTA.
 * Designed for a driver-poster filling on a bumpy back-seat ride.
 */
export function FieldPostTripPage() {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const Icon = current.icon;

  return (
    <div className="min-h-dvh pb-32">
      <header className="flex items-center justify-between px-5 pt-4">
        <Link to="/v3" aria-label="Back" className="rounded-pill bg-surface p-2">
          <ChevronLeft className="size-5" />
        </Link>
        <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </div>
      </header>

      <div className="mx-5 mt-4 h-1.5 overflow-hidden rounded-pill bg-surface-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <section className="mx-5 mt-10 rounded-card bg-surface p-6 shadow-card">
        <div className="grid size-14 place-items-center rounded-pill bg-primary/15 text-primary">
          <Icon className="size-7" aria-hidden />
        </div>
        <h1 className="mt-4 text-[26px] font-bold leading-tight">{current.label}</h1>
        <input
          autoFocus
          placeholder={current.placeholder}
          className="mt-5 h-14 w-full rounded-control border border-border bg-page px-4 text-[20px] outline-none focus:border-primary"
        />
      </section>

      <StickyCtaBar>
        <button
          type="button"
          onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-primary text-[17px] font-semibold text-primary-foreground shadow-fab"
        >
          {last ? <><Check className="size-5" /> Post trip</> : 'Next'}
        </button>
      </StickyCtaBar>
    </div>
  );
}

export default FieldPostTripPage;
