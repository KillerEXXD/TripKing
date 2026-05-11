import { Check, BadgeIndianRupee } from 'lucide-react';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import type { WebsiteCopy } from './copy';

export function PricingSection({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  return (
    <section id="pricing" className="scroll-mt-16 bg-gray-50/60 py-16 sm:py-20">
      <div ref={ref} className={cn('mx-auto max-w-3xl px-4 sm:px-6', revealClasses(inView))}>
        <div className="rounded-3xl bg-emerald-600 p-8 text-center text-white shadow-sm sm:p-12">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white/15">
            <BadgeIndianRupee className="size-6" />
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t.pricing.title}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-emerald-50">{t.pricing.body}</p>
          <ul className="mx-auto mt-7 grid max-w-xl gap-3 text-left sm:grid-cols-3">
            {t.pricing.points.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-2xl bg-white/10 p-4 text-sm leading-relaxed"
              >
                <Check className="mt-0.5 size-4 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default PricingSection;
