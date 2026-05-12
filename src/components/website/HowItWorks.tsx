import { useRef } from 'react';
import { Car, Briefcase } from 'lucide-react';
import { iconFor } from './icons';
import { PhoneMockup } from './PhoneMockup';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import type { WebsiteCopy, Step } from './copy';

type Audience = 'driver' | 'agent';

function StepRow({ step, i }: { step: Step; i: number }) {
  const { ref, inView } = useScrollReveal();
  const Icon = iconFor(step.icon);
  const flip = i % 2 === 1;
  return (
    <div
      ref={ref}
      className={cn(
        'grid items-center gap-8 lg:grid-cols-2 lg:gap-12',
        revealClasses(inView),
      )}
    >
      <div className={cn(flip && 'lg:order-2')}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {step.n}
          </span>
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100">
            <Icon className="size-5 text-emerald-600" />
          </span>
        </div>
        <h3 className="mt-4 text-xl font-bold text-gray-900 sm:text-2xl">{step.h}</h3>
        <p className="mt-2.5 max-w-lg text-base leading-relaxed text-gray-600">{step.p}</p>
      </div>
      <div className={cn(flip && 'lg:order-1')}>
        <PhoneMockup shot={step.shot} label={step.shotLabel} icon={step.icon} />
      </div>
    </div>
  );
}

export function HowItWorks({
  t,
  audience,
  onAudience,
}: {
  t: WebsiteCopy;
  audience: Audience;
  onAudience: (a: Audience) => void;
}) {
  const { ref, inView } = useScrollReveal();
  const tabsRef = useRef<HTMLDivElement>(null);
  const steps = audience === 'driver' ? t.how.driverSteps : t.how.agentSteps;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      onAudience(audience === 'driver' ? 'agent' : 'driver');
    }
  };

  const tabBtn = (a: Audience, label: string, Icon: typeof Car) => (
    <button
      key={a}
      type="button"
      role="tab"
      aria-selected={audience === a}
      tabIndex={audience === a ? 0 : -1}
      onClick={() => onAudience(a)}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors',
        audience === a ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900',
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );

  return (
    <section id="how" className="scroll-mt-16 bg-gray-50/60 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div ref={ref} className={cn('text-center', revealClasses(inView))}>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            {t.how.title}
          </h2>
          <p className="mt-2 text-gray-600">{t.how.sub}</p>
          <div
            ref={tabsRef}
            role="tablist"
            aria-label={t.how.title}
            className="mx-auto mt-6 inline-flex items-center rounded-full border border-gray-200 bg-white p-1"
          >
            {tabBtn('driver', t.how.tabs.driver, Car)}
            {tabBtn('agent', t.how.tabs.agent, Briefcase)}
          </div>
        </div>

        <div className="mt-12 space-y-14 lg:space-y-20">
          {steps.map((s, i) => (
            <StepRow key={`${audience}-${s.n}`} step={s} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;
