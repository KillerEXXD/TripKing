import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { CROSS_PAGE_QUESTIONS, SKIN_VERSIONS, VERSION_LABELS } from '@/lib/designFeedback/questions';
import type { SkinVersion } from '@/lib/designFeedback/questions';
import { useFeedbackDraft } from '@/lib/designFeedback/draft';

/** /app/administration/designs/feedback/cross-page — final synthesis questions across all designs. */
export function FeedbackCrossPagePage() {
  const navigate = useNavigate();
  const { draft, update } = useFeedbackDraft();

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link to="/app/administration/designs/feedback" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" /> Questionnaire
      </Link>
      <header>
        <div className="text-xs font-semibold uppercase tracking-wider text-secondary">Final section</div>
        <h1 className="mt-1 text-2xl font-bold">Cross-page synthesis</h1>
        <p className="mt-1 text-sm text-secondary">
          These cut across pages — they're the questions that matter for picking a single direction to ship.
        </p>
      </header>

      <ol className="space-y-5">
        {CROSS_PAGE_QUESTIONS.map((q, i) => (
          <li key={q.key} className="rounded-card bg-surface p-4 shadow-card">
            <div className="text-xs font-mono text-secondary">Q{i + 1}</div>
            <p className="mt-1 text-base font-medium">{q.prompt}</p>
            {q.kind === 'pick-version' ? (
              <div role="radiogroup" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {SKIN_VERSIONS.map((v) => {
                  const checked = draft.crossPage[q.key] === v;
                  return (
                    <label
                      key={v}
                      className={`flex cursor-pointer flex-col items-center rounded-control border px-2 py-2 text-sm font-semibold transition-colors ${
                        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.key}
                        checked={checked}
                        onChange={() => update('crossPage', (prev) => ({ ...prev, [q.key]: v as SkinVersion }))}
                        className="sr-only"
                      />
                      <span>{v}</span>
                      <span className="text-[10px] font-normal text-current opacity-80">{VERSION_LABELS[v].replace(/^v\d /, '')}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <textarea
                value={q.key === 'notes' ? draft.notes : (draft.crossPage[q.key] ?? '')}
                onChange={(e) => {
                  if (q.key === 'notes') {
                    update('notes', e.target.value);
                  } else {
                    update('crossPage', (prev) => ({ ...prev, [q.key]: e.target.value }));
                  }
                }}
                placeholder="Type your answer"
                rows={3}
                className="mt-3 block w-full rounded-control border border-border bg-page px-3 py-2 text-sm outline-none focus:border-primary"
              />
            )}
          </li>
        ))}
      </ol>

      <nav className="flex items-center justify-end border-t border-border pt-4">
        <Button onClick={() => navigate('/app/administration/designs/feedback')} className="gap-1">
          Back to hub <ChevronRight className="size-4" />
        </Button>
      </nav>
    </main>
  );
}

export default FeedbackCrossPagePage;
