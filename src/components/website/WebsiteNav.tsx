import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LANGS, type WebsiteLang, type WebsiteCopy } from './copy';

export function WebsiteNav({
  t,
  lang,
  onLang,
}: {
  t: WebsiteCopy;
  lang: WebsiteLang;
  onLang: (l: WebsiteLang) => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        {/* Brand */}
        <a href="#top" className="flex items-center gap-2">
          <img src="/logo-mark.svg" alt="" width={28} height={24} className="h-6 w-auto" />
          <span className="text-lg font-extrabold tracking-tight">
            <span className="text-emerald-600">Trip</span>King
          </span>
        </a>

        {/* Anchor links — desktop only */}
        <nav className="hidden items-center gap-6 md:flex">
          <a href="#how" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            {t.nav.howItWorks}
          </a>
          <a href="#how" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            {t.nav.forDrivers}
          </a>
          <a href="#how" className="text-sm font-medium text-gray-600 hover:text-gray-900">
            {t.nav.forAgents}
          </a>
        </nav>

        {/* Lang switch + CTA */}
        <div className="flex items-center gap-2">
          <div
            className="flex items-center rounded-full border border-gray-200 p-0.5"
            role="group"
            aria-label="Language"
          >
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onLang(l.code)}
                aria-pressed={lang === l.code}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                  lang === l.code
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-500 hover:text-gray-800',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-gray-800"
          >
            {t.nav.openApp}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export default WebsiteNav;
