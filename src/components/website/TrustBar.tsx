import { iconFor } from './icons';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import type { WebsiteCopy } from './copy';

export function TrustBar({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  return (
    <section className="border-y border-gray-100 bg-gray-50/60">
      <div
        ref={ref}
        className={`mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-5 sm:px-6 ${revealClasses(inView)}`}
      >
        {t.trust.items.map((it, i) => {
          const Icon = iconFor(it.icon);
          return (
            <div key={i} className="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
              <Icon className="size-4 text-emerald-600" />
              {it.text}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default TrustBar;
