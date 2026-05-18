import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, Circle, Send } from 'lucide-react';
import { Button } from '@/components/ui';
import { PREFERENCE_PAGES, SKIN_VERSIONS, VERSION_LABELS, CROSS_PAGE_QUESTIONS, SUS_QUESTIONS } from '@/lib/designFeedback/questions';
import { useFeedbackDraft } from '@/lib/designFeedback/draft';
import { useSubmitDesignFeedback } from '@/hooks/useDesignFeedback';

/**
 * /app/administration/designs/feedback — questionnaire hub.
 *
 * Reviewer enters their name, then walks through 16 sections:
 *   • 9 per-page preference sections
 *   • 6 per-design SUS sections
 *   • 1 cross-page synthesis section
 * Each section's completion state shows live; Submit enables once all done.
 */
export function FeedbackLandingPage() {
  const navigate = useNavigate();
  const { draft, update, reset } = useFeedbackDraft();
  const submit = useSubmitDesignFeedback();

  const sectionsDone = countCompleted(draft);
  const totalSections = PREFERENCE_PAGES.length + SKIN_VERSIONS.length + 1; // pages + per-design SUS + cross-page
  const allDone = sectionsDone.completed === totalSections;
  const nameOk = draft.reviewerName.trim().length > 0;

  async function onSubmit() {
    if (!allDone || !nameOk) return;
    try {
      // Merge "why" rationales into preferences payload (suffixed `.why`).
      const flatPreferences: Record<string, string> = { ...draft.preferences };
      for (const [k, v] of Object.entries(draft.preferencesWhy)) {
        if (v.trim()) flatPreferences[`${k}.why`] = v.trim();
      }
      await submit.mutateAsync({
        reviewer_name: draft.reviewerName.trim(),
        preferences: flatPreferences,
        sus_scores: draft.sus,
        cross_page: draft.crossPage,
        notes: draft.notes.trim() || undefined,
      });
      toast.success('Thanks — your feedback is in.');
      reset();
      navigate('/app/administration/designs/feedback/results');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit. Try again.');
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link to="/app/administration/designs" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Design previews
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Collect design feedback</h1>
        <p className="mt-1 text-sm text-secondary">
          Walk every section. For each page you'll compare all 6 versions and pick the best per product question.
          For each design you'll rate it on the System Usability Scale. Closes with cross-page synthesis questions.
          Drafts save automatically — close the tab and come back anytime.
        </p>
      </header>

      <section className="rounded-card bg-surface p-4 shadow-card">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">Your name</span>
          <input
            value={draft.reviewerName}
            onChange={(e) => update('reviewerName', e.target.value)}
            placeholder="e.g. Priya Krishnan"
            className="mt-1 block h-11 w-full rounded-control border border-border bg-page px-3 text-base outline-none focus:border-primary"
          />
        </label>
      </section>

      <Section title="Per-page preference questions (9)">
        <ul className="divide-y divide-border rounded-card bg-surface shadow-card">
          {PREFERENCE_PAGES.map((p) => {
            const done = sectionsDone.pageDone(p.pageKey);
            return (
              <li key={p.pageKey}>
                <Link
                  to={`/app/administration/designs/feedback/page/${p.pageKey}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    {done ? <Check className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                    <span className="text-sm font-medium">{p.label}</span>
                  </span>
                  <span className="text-xs text-secondary">{p.questions.length} questions</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Per-design System Usability Scale (6)">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SKIN_VERSIONS.map((v) => {
            const done = sectionsDone.susDone(v);
            return (
              <li key={v}>
                <Link
                  to={`/app/administration/designs/feedback/sus/${v}`}
                  className="flex items-center justify-between rounded-card bg-surface px-4 py-3 shadow-card hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    {done ? <Check className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                    <span className="text-sm font-medium">{VERSION_LABELS[v]}</span>
                  </span>
                  <span className="text-xs text-secondary">{SUS_QUESTIONS.length} items</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Cross-page synthesis (1)">
        <Link
          to="/app/administration/designs/feedback/cross-page"
          className="flex items-center justify-between rounded-card bg-surface px-4 py-3 shadow-card hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            {sectionsDone.crossPageDone() ? <Check className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
            <span className="text-sm font-medium">Brand, trust, consistency, forced ship</span>
          </span>
          <span className="text-xs text-secondary">{CROSS_PAGE_QUESTIONS.length} questions</span>
        </Link>
      </Section>

      <section className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-center justify-between gap-2">
          <span><strong>{sectionsDone.completed}</strong> of <strong>{totalSections}</strong> sections complete</span>
          <Button
            onClick={() => void onSubmit()}
            disabled={!allDone || !nameOk || submit.isPending}
            className="gap-2"
          >
            <Send className="size-4" /> {submit.isPending ? 'Sending…' : 'Submit feedback'}
          </Button>
        </div>
        {!nameOk ? <p className="mt-2 text-xs">Add your name above to enable Submit.</p> : null}
      </section>

      <p className="text-xs text-secondary">
        <Link to="/app/administration/designs/feedback/results" className="underline">See aggregated results</Link>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">{title}</h2>
      {children}
    </section>
  );
}

function countCompleted(draft: ReturnType<typeof useFeedbackDraft>['draft']) {
  const pageDone = (pageKey: string) => {
    const page = PREFERENCE_PAGES.find((p) => p.pageKey === pageKey);
    if (!page) return false;
    return page.questions.every((q) => !!draft.preferences[q.key]);
  };
  const susDone = (version: typeof SKIN_VERSIONS[number]) => {
    const arr = draft.sus[version];
    return Array.isArray(arr) && arr.length === SUS_QUESTIONS.length && arr.every((n) => Number.isInteger(n) && n >= 1 && n <= 5);
  };
  const crossPageDone = () => {
    return CROSS_PAGE_QUESTIONS.filter((q) => q.kind === 'pick-version').every((q) => !!draft.crossPage[q.key]);
  };
  let completed = 0;
  for (const p of PREFERENCE_PAGES) if (pageDone(p.pageKey)) completed++;
  for (const v of SKIN_VERSIONS)    if (susDone(v))           completed++;
  if (crossPageDone()) completed++;
  return { completed, pageDone, susDone, crossPageDone };
}

export default FeedbackLandingPage;
