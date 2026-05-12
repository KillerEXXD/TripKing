import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useScrollReveal, revealClasses } from '@/hooks/useScrollReveal';
import {
  AGENT_COPY,
  AGENT_LANGS,
  WHATSAPP_NUMBER,
  sampleWhatsAppPost,
  type AgentLang,
} from '@/components/agents/copy';
import { agentIcon } from '@/components/agents/icons';
import {
  WhatsAppPostCard,
  DashboardCard,
  CompareTable,
  LifecyclePills,
  AnalyticsCard,
  DriverApplicantMini,
} from '@/components/agents/cards';

/**
 * `/for-agents` — public landing page for travel agents / trip managers.
 *
 * Positions Trip King as a WhatsApp-powered trip-assignment & driver-management
 * system, not a passenger taxi app. Bilingual (English / Tamil), mobile-first.
 * No pricing / cost copy — features and pain points only. CTAs go to the app
 * (`/`) and to WhatsApp.
 */

const LANG_KEY = 'tripking.agents.lang';

function initialLang(): AgentLang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ta') return saved;
  } catch {
    /* ignore */
  }
  return 'en';
}

// ── small layout helpers ────────────────────────────────────────────────────

function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { ref, inView } = useScrollReveal();
  return (
    <section id={id} className={cn(id && 'scroll-mt-16', 'py-14 sm:py-20', className)}>
      <div ref={ref} className={cn('mx-auto max-w-6xl px-4 sm:px-6', revealClasses(inView))}>
        {children}
      </div>
    </section>
  );
}

function SectionHead({ h, sub }: { h: string; sub?: string }) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">{h}</h2>
      {sub && <p className="mx-auto mt-2 max-w-2xl text-gray-600">{sub}</p>}
    </div>
  );
}

function Chips({ items, accent = false }: { items: string[]; accent?: boolean }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {items.map((c) => (
        <span
          key={c}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium ring-1',
            accent
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-white text-gray-700 ring-gray-200',
          )}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export function ForAgentsPage() {
  const [lang, setLang] = useState<AgentLang>(initialLang);
  const t = AGENT_COPY[lang];

  useEffect(() => {
    document.title = t.meta.title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const prev = meta?.getAttribute('content') ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', t.meta.description);
    return () => {
      document.title = 'Trip King — Cab & Trip Marketplace';
      if (meta && prev !== null) meta.setAttribute('content', prev);
    };
  }, [t.meta.title, t.meta.description]);

  const onLang = useCallback((l: AgentLang) => {
    setLang(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const wa = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Hi — I run a travel agency and I want to use Trip King for my trips.',
  )}`;

  const dashRows =
    lang === 'ta'
      ? [
          { label: '12 டிரைவர்கள் விண்ணப்பித்தனர்', tone: 'default' as const },
          { label: '5 வெரிஃபைட் டிரைவர்கள்', tone: 'good' as const },
          { label: '3 இன்னோவா — சென்னை அருகில்', tone: 'good' as const },
          { label: '2 ஷார்ட்லிஸ்ட்', tone: 'accent' as const },
          { label: '1 டிரைவர் ஒதுக்கப்பட்டார்', tone: 'done' as const },
          { label: 'டிரிப் மூடப்பட்டது', tone: 'done' as const },
        ]
      : [
          { label: '12 drivers applied', tone: 'default' as const },
          { label: '5 verified drivers', tone: 'good' as const },
          { label: '3 Innova available near Chennai', tone: 'good' as const },
          { label: '2 shortlisted', tone: 'accent' as const },
          { label: '1 driver assigned', tone: 'done' as const },
          { label: 'Trip closed', tone: 'done' as const },
        ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* ── sticky nav ── */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="" className="h-6 w-auto" />
            <span className="text-lg font-extrabold tracking-tight">
              <span className="text-emerald-600">Trip</span>King
            </span>
            <span className="hidden text-xs font-medium text-gray-400 sm:inline">· for agents</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="#how" className="hidden text-sm font-medium text-gray-600 hover:text-gray-900 sm:inline">
              {t.nav.howItWorks}
            </a>
            <div className="flex items-center rounded-full border border-gray-200 p-0.5" role="group" aria-label="Language">
              {AGENT_LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => onLang(l.code)}
                  aria-pressed={lang === l.code ? 'true' : 'false'}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                    lang === l.code ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-800',
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

      <main>
        {/* ── hero ── */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-50/80 via-white to-white" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-2 lg:gap-12 lg:pb-20 lg:pt-20">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                {t.hero.kicker}
              </span>
              <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-gray-900 sm:text-5xl">
                {t.hero.h1}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-gray-600 sm:text-lg">{t.hero.sub}</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  {t.hero.ctaPrimary}
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-900 px-6 py-3.5 text-base font-semibold text-gray-900 transition-colors hover:bg-gray-900 hover:text-white"
                >
                  {t.hero.ctaSecondary}
                </a>
              </div>
              <p className="mt-5 text-sm text-gray-500">{t.hero.note}</p>
            </div>
            {/* hero visual: WhatsApp post + dashboard, side by side */}
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:justify-center">
              <WhatsAppPostCard title={t.hero.waCardTitle} text={sampleWhatsAppPost(lang)} />
              <DashboardCard title={t.hero.dashCardTitle} rows={dashRows} />
            </div>
          </div>
        </section>

        {/* ── keep WhatsApp ── */}
        <div className="bg-gray-50/60">
          <Section>
            <SectionHead h={t.keepWa.h} sub={t.keepWa.body} />
            <div className="mt-9">
              <CompareTable leftLabel={t.keepWa.leftLabel} rightLabel={t.keepWa.rightLabel} rows={t.keepWa.rows} />
            </div>
          </Section>
        </div>

        {/* ── how it works ── */}
        <Section id="how">
          <SectionHead h={t.how.h} sub={t.how.sub} />
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
            {t.how.steps.map((s) => {
              const Icon = agentIcon(s.icon);
              return (
                <div key={s.n} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                      {s.n}
                    </span>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100">
                      <Icon className="size-4 text-emerald-600" />
                    </span>
                  </div>
                  <h3 className="mt-3 text-base font-bold text-gray-900">{s.h}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{s.p}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-8">
            <LifecyclePills label={t.how.lifecycleLabel} steps={t.how.lifecycle} />
          </div>
        </Section>

        {/* ── pain points ── */}
        <div className="bg-gray-50/60">
          <Section>
            <SectionHead h={t.pains.h} sub={t.pains.sub} />
            <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {t.pains.cards.map((c, i) => {
                const Icon = agentIcon(c.icon);
                return (
                  <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-red-50">
                      <Icon className="size-4 text-red-500" />
                    </span>
                    <h3 className="mt-3 text-base font-bold text-gray-900">{c.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{c.body}</p>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        {/* ── core features ── */}
        <Section id="features">
          <SectionHead h={t.features.h} sub={t.features.sub} />
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.blocks.map((f, i) => {
              const Icon = agentIcon(f.icon);
              return (
                <div key={i} className="flex flex-col rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-100">
                    <Icon className="size-5 text-emerald-600" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-gray-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{f.body}</p>
                  {f.bullets && (
                    <ul className="mt-3 space-y-1.5">
                      {f.bullets.map((b, j) => (
                        <li key={j} className="flex items-start gap-2 text-xs leading-relaxed text-gray-600">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── amount visibility control ── */}
        <div className="bg-gray-50/60">
          <Section>
            <SectionHead h={t.amounts.h} sub={t.amounts.body} />
            <div className="mt-9 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2">
                <div className="bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800">{t.amounts.optionHead}</div>
                <div className="bg-gray-50 px-5 py-3 text-sm font-bold text-gray-500">{t.amounts.seesHead}</div>
              </div>
              <ul>
                {t.amounts.rows.map((r, i) => (
                  <li key={i} className="grid grid-cols-1 border-t border-gray-100 sm:grid-cols-2">
                    <div className="px-5 py-3 text-sm font-semibold text-gray-900">{r.option}</div>
                    <div className="bg-gray-50/40 px-5 py-3 text-sm text-gray-600">{r.sees}</div>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        </div>

        {/* ── not another taxi app ── */}
        <Section>
          <SectionHead h={t.vsTaxi.h} sub={t.vsTaxi.body} />
          <div className="mt-9">
            <CompareTable leftLabel={t.vsTaxi.leftLabel} rightLabel={t.vsTaxi.rightLabel} rows={t.vsTaxi.rows} />
          </div>
        </Section>

        {/* ── better than WhatsApp alone ── */}
        <div className="bg-gray-50/60">
          <Section>
            <SectionHead h={t.vsWa.h} sub={t.vsWa.body} />
            <div className="mt-9">
              <CompareTable leftLabel={t.vsWa.leftLabel} rightLabel={t.vsWa.rightLabel} rows={t.vsWa.rows} />
            </div>
          </Section>
        </div>

        {/* ── South India routes ── */}
        <Section>
          <SectionHead h={t.routes.h} sub={t.routes.body} />
          <div className="mt-8">
            <Chips items={t.routes.chips} accent />
          </div>
        </Section>

        {/* ── analytics preview ── */}
        <div className="bg-gray-50/60">
          <Section>
            <SectionHead h={t.analytics.h} sub={t.analytics.body} />
            <div className="mt-9 grid gap-6 lg:grid-cols-3 lg:items-start">
              <div className="lg:col-span-2">
                <AnalyticsCard title={t.analytics.cardTitle} metrics={t.analytics.metrics} />
              </div>
              <div className="space-y-3">
                {t.analytics.bullets.map((b, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-2xl bg-white p-4 text-sm leading-relaxed text-gray-700 ring-1 ring-gray-100">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {b}
                  </div>
                ))}
                <DriverApplicantMini
                  name={lang === 'ta' ? 'குமார் டிராவல்ஸ்' : 'Kumar Travels'}
                  rating="4.8"
                  trips="18"
                  vehicle="Innova"
                />
              </div>
            </div>
          </Section>
        </div>

        {/* ── own driver network ── */}
        <Section>
          <SectionHead h={t.network.h} sub={t.network.body} />
          <div className="mt-8 space-y-4">
            <Chips items={t.network.pools} accent />
            <Chips items={t.network.examples} />
          </div>
        </Section>

        {/* ── unions / WhatsApp groups ── */}
        <div className="bg-gray-50/60">
          <Section>
            <div className="rounded-3xl border border-gray-100 bg-white p-7 shadow-sm sm:p-10">
              <div className="flex items-start gap-4">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <MessageCircle className="size-6" />
                </span>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">{t.union.h}</h2>
                  <p className="mt-2 text-base leading-relaxed text-gray-600">{t.union.body}</p>
                </div>
              </div>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {t.union.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 rounded-2xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {b}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm font-semibold text-emerald-800">{t.union.positioning}</p>
            </div>
          </Section>
        </div>

        {/* ── benefits ── */}
        <Section>
          <SectionHead h={t.benefits.h} />
          <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.benefits.cards.map((c, i) => {
              const Icon = agentIcon(c.icon);
              return (
                <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100">
                    <Icon className="size-4 text-emerald-600" />
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-gray-900">{c.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{c.body}</p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── FAQ ── */}
        <div className="bg-gray-50/60">
          <Section>
            <SectionHead h={t.faq.h} />
            <div className="mx-auto mt-9 max-w-3xl divide-y divide-gray-200 rounded-2xl border border-gray-100 bg-white shadow-sm">
              {t.faq.items.map((f, i) => (
                <details key={i} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-900">
                    {f.q}
                    <span className="shrink-0 text-gray-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.a}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>

        {/* ── final CTA ── */}
        <section className="relative overflow-hidden bg-white py-20">
          <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{t.finalCta.h}</h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-gray-600 sm:text-lg">{t.finalCta.sub}</p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-base font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                {t.finalCta.ctaPrimary}
                <ArrowRight className="size-4" />
              </Link>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 px-7 py-3.5 text-base font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
              >
                <MessageCircle className="size-4" />
                {t.finalCta.ctaWhatsapp}
              </a>
            </div>
            <p className="mt-7 text-xs text-gray-400">{t.finalCta.footnote}</p>
          </div>
        </section>
      </main>

      {/* ── footer band: the one takeaway ── */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-4xl px-4 py-10 text-center sm:px-6">
          <p className="text-sm leading-relaxed text-gray-600">{t.takeaway}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <a href="#how" className="text-gray-500 hover:text-gray-900">{t.nav.howItWorks}</a>
            <a href="#features" className="text-gray-500 hover:text-gray-900">{lang === 'ta' ? 'அம்சங்கள்' : 'Features'}</a>
            <Link to="/" className="text-gray-500 hover:text-gray-900">{t.nav.openApp}</Link>
            <Link to="/website" className="text-gray-500 hover:text-gray-900">{lang === 'ta' ? 'முழு தளம்' : 'Full site'}</Link>
            <Link to="/passenger" className="text-emerald-700 hover:underline">
              {lang === 'ta' ? 'நீங்கள் பயணியா? →' : 'Are you a passenger? →'}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default ForAgentsPage;
