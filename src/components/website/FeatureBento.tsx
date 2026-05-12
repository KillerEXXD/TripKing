import { iconFor } from './icons';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import type { WebsiteCopy, Feature } from './copy';

function Tile({ f }: { f: Feature }) {
  const Icon = iconFor(f.icon);
  return (
    <div
      className={cn(
        'rounded-3xl border p-6 transition-shadow hover:shadow-md sm:p-7',
        f.wide && 'sm:col-span-2',
        f.lead
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
          : 'border-gray-100 bg-white',
      )}
    >
      <span
        className={cn(
          'flex size-11 items-center justify-center rounded-2xl',
          f.lead ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-600',
        )}
      >
        <Icon className="size-5" />
      </span>
      <h3 className="mt-4 text-lg font-bold text-gray-900">{f.h}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.p}</p>
    </div>
  );
}

export function FeatureBento({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  return (
    <section id="features" className="scroll-mt-16 bg-white py-16 sm:py-20">
      <div ref={ref} className={cn('mx-auto max-w-6xl px-4 sm:px-6', revealClasses(inView))}>
        <h2 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
          {t.features.title}
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-gray-600">{t.features.sub}</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.items.map((f, i) => (
            <Tile key={i} f={f} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FeatureBento;
