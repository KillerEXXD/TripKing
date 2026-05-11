import { ShieldCheck, Check } from 'lucide-react';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import type { WebsiteCopy } from './copy';

export function AdminNote({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  return (
    <section className="bg-white py-16 sm:py-20">
      <div ref={ref} className={cn('mx-auto max-w-4xl px-4 sm:px-6', revealClasses(inView))}>
        <div className="rounded-3xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-7 sm:p-10">
          <div className="flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t.admin.title}</h2>
              <p className="mt-2 text-base leading-relaxed text-gray-600">{t.admin.body}</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {t.admin.points.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-2xl bg-white p-4 text-sm leading-relaxed text-gray-700 ring-1 ring-gray-100"
              >
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default AdminNote;
