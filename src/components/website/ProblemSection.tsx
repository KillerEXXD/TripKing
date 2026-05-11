import { Car, Briefcase } from 'lucide-react';
import { iconFor } from './icons';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import type { WebsiteCopy, PainItem } from './copy';

function PainColumn({
  title,
  items,
  badge,
}: {
  title: string;
  items: PainItem[];
  badge: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gray-900 text-white">
          {badge}
        </span>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((it, i) => {
          const Icon = iconFor(it.icon);
          return (
            <li key={i} className="flex items-start gap-3 rounded-2xl bg-gray-50 p-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                <Icon className="size-4 text-red-500" />
              </span>
              <span className="text-sm leading-relaxed text-gray-700">{it.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ProblemSection({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  return (
    <section className="bg-white py-16 sm:py-20">
      <div ref={ref} className={`mx-auto max-w-6xl px-4 sm:px-6 ${revealClasses(inView)}`}>
        <h2 className="text-center text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
          {t.problem.title}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <PainColumn
            title={t.problem.driver.title}
            items={t.problem.driver.items}
            badge={<Car className="size-5" />}
          />
          <PainColumn
            title={t.problem.agent.title}
            items={t.problem.agent.items}
            badge={<Briefcase className="size-5" />}
          />
        </div>
      </div>
    </section>
  );
}

export default ProblemSection;
