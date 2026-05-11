import { Link } from 'react-router-dom';
import { ArrowRight, Send } from 'lucide-react';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { WHATSAPP_NUMBER, type WebsiteCopy } from './copy';

export function FinalCTA({ t }: { t: WebsiteCopy }) {
  const { ref, inView } = useScrollReveal();
  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Hi — I want access to Trip King.',
  )}`;
  return (
    <section className="relative overflow-hidden bg-white py-20">
      <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
      <div
        ref={ref}
        className={cn('relative mx-auto max-w-3xl px-4 text-center sm:px-6', revealClasses(inView))}
      >
        <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          {t.finalCta.h}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base text-gray-600 sm:text-lg">{t.finalCta.sub}</p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            {t.finalCta.ctaOpen}
            <ArrowRight className="size-4" />
          </Link>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 px-7 py-3.5 text-base font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            <Send className="size-4" />
            {t.finalCta.ctaWhatsapp}
          </a>
        </div>
        <p className="mt-7 text-xs text-gray-400">{t.finalCta.footnote}</p>
      </div>
    </section>
  );
}

export default FinalCTA;
