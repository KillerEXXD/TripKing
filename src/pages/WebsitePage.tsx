import { useEffect, useState, useCallback } from 'react';
import { WEBSITE_COPY, type WebsiteLang } from '@/components/website/copy';
import { WebsiteNav } from '@/components/website/WebsiteNav';
import { Hero } from '@/components/website/Hero';
import { TrustBar } from '@/components/website/TrustBar';
import { ProblemSection } from '@/components/website/ProblemSection';
import { HowItWorks } from '@/components/website/HowItWorks';
import { FeatureBento } from '@/components/website/FeatureBento';
import { WhyTripKing } from '@/components/website/WhyTripKing';
import { AdminNote } from '@/components/website/AdminNote';
import { FinalCTA } from '@/components/website/FinalCTA';
import { WebsiteFooter } from '@/components/website/WebsiteFooter';

const LANG_KEY = 'tripking.website.lang';

function initialLang(): WebsiteLang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ta' || saved === 'hi') return saved;
  } catch {
    /* ignore */
  }
  return 'en';
}

/**
 * `/website` — the public, single-page promo site for Trip King.
 * Standalone marketing page (not the app shell): trilingual (EN/Tamil/Hindi)
 * and explains the platform for both drivers and travel agents.
 */
export function WebsitePage() {
  const [lang, setLang] = useState<WebsiteLang>(initialLang);
  const [audience, setAudience] = useState<'driver' | 'agent'>('driver');
  const t = WEBSITE_COPY[lang];

  useEffect(() => {
    document.title = t.meta.title;
    return () => {
      document.title = 'Trip King — Cab & Trip Marketplace';
    };
  }, [t.meta.title]);

  const onLang = useCallback((l: WebsiteLang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const onPick = useCallback((a: 'driver' | 'agent') => {
    setAudience(a);
    const el = document.getElementById('how');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <WebsiteNav t={t} lang={lang} onLang={onLang} />
      <main>
        <Hero t={t} onPick={onPick} />
        <TrustBar t={t} />
        <ProblemSection t={t} />
        <HowItWorks t={t} audience={audience} onAudience={setAudience} />
        <FeatureBento t={t} />
        <WhyTripKing t={t} />
        <AdminNote t={t} />
        <FinalCTA t={t} />
      </main>
      <WebsiteFooter t={t} />
    </div>
  );
}

export default WebsitePage;
