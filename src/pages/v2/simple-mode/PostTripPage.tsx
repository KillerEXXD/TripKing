import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Flag, Clock, Car, IndianRupee, Check } from 'lucide-react';

const STEPS = [
  { key: 'from',    icon: MapPin,       ta: 'எங்கிருந்து?',  en: 'Where do you start?', placeholder: 'e.g. Vellore' },
  { key: 'to',      icon: Flag,         ta: 'எங்கே போக?',     en: 'Where to go?',         placeholder: 'e.g. Chennai' },
  { key: 'when',    icon: Clock,        ta: 'எப்போது?',       en: 'When?',                placeholder: 'Tomorrow 2 PM' },
  { key: 'vehicle', icon: Car,          ta: 'என்ன வாகனம்?',   en: 'What vehicle?',        placeholder: 'Sedan' },
  { key: 'fare',    icon: IndianRupee,  ta: 'எவ்வளவு பணம்?',  en: 'How much money?',      placeholder: '4000' },
];

/** v7 Simple Mode — post-trip wizard. One question, one big input, big green Next. */
export function SimplePostTripPage() {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const s = STEPS[step];
  const Icon = s.icon;

  return (
    <div className="flex min-h-dvh flex-col bg-page pb-6">
      <header className="flex items-center justify-between px-5 pt-5 pb-3">
        <Link to="/v7" aria-label="Back" className="rounded-pill border-2 border-border bg-surface p-2">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="rounded-pill border-2 border-border bg-surface px-3 py-1 text-[14px] font-semibold">
          {step + 1} / {STEPS.length}
        </div>
      </header>

      <div className="mx-5 mt-2 h-3 overflow-hidden rounded-pill bg-surface-muted">
        <div
          className="h-full rounded-pill bg-[var(--skin-simple-go)] transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <main className="px-5 pt-8">
        <div className="mb-4 flex size-20 items-center justify-center rounded-pill bg-[var(--skin-simple-go-bg)] text-[var(--skin-simple-go)]">
          <Icon className="size-10" aria-hidden />
        </div>
        <h1 className="text-[28px] font-bold leading-tight">{s.ta}</h1>
        <p className="text-[16px] text-muted-foreground">{s.en}</p>
        <input
          autoFocus
          placeholder={s.placeholder}
          className="mt-6 h-16 w-full rounded-control border-2 border-border bg-surface px-4 text-[22px] outline-none focus:border-[var(--skin-simple-go)]"
        />
      </main>

      <footer className="mt-auto space-y-2 px-5">
        <button
          type="button"
          onClick={() => setStep((x) => Math.min(STEPS.length - 1, x + 1))}
          className="flex h-16 w-full items-center justify-center gap-2 rounded-control bg-[var(--skin-simple-go)] text-[20px] font-bold text-white"
        >
          {last ? <><Check className="size-6" /> முடி · Finish</> : 'அடுத்தது · Next →'}
        </button>
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((x) => x - 1)}
            className="h-12 w-full rounded-control border-2 border-border text-[16px] font-bold text-muted-foreground"
          >
            ← பின்னால் · Back one step
          </button>
        ) : null}
        <div className="mt-2 rounded-card border-2 border-warning bg-[var(--skin-simple-wait-bg)] p-3 text-center text-[14px]">
          ஒரு கேள்விக்கு பதில் சொல்லவும், அடுத்தது அழுத்தவும் <br />
          <span className="text-muted-foreground">Answer one question, then tap Next</span>
        </div>
      </footer>
    </div>
  );
}

export default SimplePostTripPage;
