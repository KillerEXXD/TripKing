import { ArrowRight } from 'lucide-react';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import type { WebsiteCopy } from './copy';

export function WhyTripKing({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  return (
    <section className="bg-gray-50/60 py-16 sm:py-20">
      <div ref={ref} className={cn('mx-auto max-w-4xl px-4 sm:px-6', revealClasses(inView))}>
        <h2 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
          {t.why.title}
        </h2>
        <div className="mt-8 space-y-4">
          {t.why.rows.map((r, i) => (
            <div
              key={i}
              className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6 sm:flex sm:items-start sm:gap-5"
            >
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900 sm:w-56 sm:shrink-0">
                <ArrowRight className="size-4 text-emerald-600" />
                {r.a}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 sm:mt-0">{r.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WhyTripKing;
