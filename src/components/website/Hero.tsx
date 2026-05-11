import { Link } from 'react-router-dom';
import { ArrowRight, Car, Briefcase, ShieldCheck } from 'lucide-react';
import { PhoneMockup } from './PhoneMockup';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import type { WebsiteCopy } from './copy';

export function Hero({
  t,
  onPick,
}: {
  t: WebsiteCopy;
  onPick: (audience: 'driver' | 'agent') => void;
}) {
  const { ref, inView } = useScrollReveal();

  return (
    <section id="top" className="relative overflow-hidden">
      {/* soft emerald wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-50/80 via-white to-white" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />

      <div
        ref={ref}
        className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:gap-14 lg:pb-20 lg:pt-20"
      >
        {/* Copy */}
        <div className={revealClasses(inView)}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            {t.hero.kicker}
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            {t.hero.h1}
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">
            {t.hero.sub}
          </p>

          {/* Dual-audience split CTA */}
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onPick('driver')}
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-transform hover:bg-emerald-700 active:scale-[0.99]"
            >
              <Car className="size-5" />
              {t.hero.ctaDriver}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              type="button"
              onClick={() => onPick('agent')}
              className="group inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-900 px-6 py-3.5 text-base font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white active:scale-[0.99]"
            >
              <Briefcase className="size-5" />
              {t.hero.ctaAgent}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600" />
              {t.hero.microcopy}
            </span>
            <Link to="/" className="font-semibold text-emerald-700 hover:underline">
              {t.hero.ctaOpen} →
            </Link>
          </div>
        </div>

        {/* Visual — layered phone mockups */}
        <div className={revealClasses(inView)}>
          <div className="relative mx-auto max-w-md">
            <div className="absolute -left-6 top-10 hidden -rotate-6 sm:block">
              <PhoneMockup shot="trip-feed" label="Trips near you" icon="navigation" size="sm" />
            </div>
            <div className="relative z-10 ml-auto mr-0 sm:mr-4">
              <PhoneMockup
                shot="applicants"
                label="Driver applicants + ratings"
                icon="star"
                size="lg"
              />
            </div>
            <div className="absolute -bottom-6 right-2 hidden rotate-6 sm:block">
              <PhoneMockup shot="tracking" label="Live tracking + ETA" icon="navigation" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
