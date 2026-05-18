import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { PREFERENCE_PAGES, SKIN_VERSIONS } from '@/lib/designFeedback/questions';
import type { PreferencePage, SkinVersion } from '@/lib/designFeedback/questions';
import { useFeedbackDraft } from '@/lib/designFeedback/draft';

/** /app/administration/designs/feedback/page/:page — preference questions for a single page across all 6 versions. */
export function FeedbackPagePage() {
  const { page: pageKey } = useParams<{ page: string }>();
  const navigate = useNavigate();
  const { draft, update } = useFeedbackDraft();
  const page = PREFERENCE_PAGES.find((p) => p.pageKey === pageKey);

  if (!page) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Link to="/app/administration/designs/feedback" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Unknown page</h1>
        <p className="mt-1 text-sm text-secondary">No questionnaire section for "{pageKey}".</p>
      </main>
    );
  }

  const idx = PREFERENCE_PAGES.findIndex((p) => p.pageKey === pageKey);
  const prev = idx > 0 ? PREFERENCE_PAGES[idx - 1] : null;
  const next = idx < PREFERENCE_PAGES.length - 1 ? PREFERENCE_PAGES[idx + 1] : null;

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link to="/app/administration/designs/feedback" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" /> Questionnaire
      </Link>
      <header>
        <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
          Section {idx + 1} of {PREFERENCE_PAGES.length} · Preference
        </div>
        <h1 className="mt-1 text-2xl font-bold">{page.label}</h1>
        {page.intro ? <p className="mt-1 text-sm text-secondary">{page.intro}</p> : null}
      </header>

      <LaunchRow page={page} />

      <ol className="space-y-5">
        {page.questions.map((q, qi) => (
          <li key={q.key} className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-start gap-2">
              {q.forcedShip ? <span className="rounded-pill bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Forced ship</span> : null}
              <span className="text-xs font-mono text-secondary">Q{qi + 1}</span>
            </div>
            <p className="mt-2 text-base font-medium">{q.prompt}</p>
            <VersionRadios
              name={q.key}
              value={draft.preferences[q.key] ?? ''}
              onChange={(v) => update('preferences', (prev) => ({ ...prev, [q.key]: v }))}
            />
            <textarea
              value={draft.preferencesWhy[q.key] ?? ''}
              onChange={(e) => update('preferencesWhy', (prev) => ({ ...prev, [q.key]: e.target.value }))}
              placeholder="Why? (optional)"
              className="mt-3 block w-full rounded-control border border-border bg-page px-3 py-2 text-sm outline-none focus:border-primary"
              rows={2}
            />
          </li>
        ))}
      </ol>

      <nav className="flex items-center justify-between border-t border-border pt-4">
        {prev ? (
          <Button variant="outline" onClick={() => navigate(`/app/administration/designs/feedback/page/${prev.pageKey}`)} className="gap-1">
            <ChevronLeft className="size-4" /> {prev.label}
          </Button>
        ) : <span />}
        {next ? (
          <Button onClick={() => navigate(`/app/administration/designs/feedback/page/${next.pageKey}`)} className="gap-1">
            {next.label} <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button onClick={() => navigate('/app/administration/designs/feedback')} className="gap-1">
            Done — back to hub <ChevronRight className="size-4" />
          </Button>
        )}
      </nav>
    </main>
  );
}

function LaunchRow({ page }: { page: PreferencePage }) {
  return (
    <section className="rounded-card border border-border bg-page p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-secondary">Open this page in each design</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {SKIN_VERSIONS.map((v) => {
          // Trip detail has no real ID — fall back to the trips list so the launch button works.
          const targetSub = page.pageKey === 'trip-detail' ? '/trips' : page.sub;
          return (
            <a
              key={v}
              href={`/${v}${targetSub}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Open {v} <ExternalLink className="size-3" aria-hidden />
            </a>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-secondary">Each opens in a new tab. Compare, then answer below.</p>
    </section>
  );
}

function VersionRadios({ name, value, onChange }: { name: string; value: string; onChange: (v: SkinVersion) => void }) {
  return (
    <div role="radiogroup" aria-label={`Pick a version for ${name}`} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {SKIN_VERSIONS.map((v) => {
        const checked = value === v;
        return (
          <label
            key={v}
            className={`flex cursor-pointer items-center justify-center rounded-control border px-2 py-2 text-sm font-semibold transition-colors ${
              checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={checked}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {v}
          </label>
        );
      })}
    </div>
  );
}

export default FeedbackPagePage;
