import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { SUS_QUESTIONS, SKIN_VERSIONS, VERSION_LABELS, type SkinVersion } from '@/lib/designFeedback/questions';
import { computeSusScore } from '@/lib/designFeedback/sus';
import { useFeedbackDraft } from '@/lib/designFeedback/draft';

/** /app/administration/designs/feedback/sus/:design — SUS questionnaire for one design. */
export function FeedbackSusPage() {
  const { design } = useParams<{ design: string }>();
  const navigate = useNavigate();
  const { draft, update } = useFeedbackDraft();
  const version = (SKIN_VERSIONS as readonly string[]).includes(design ?? '') ? (design as SkinVersion) : null;

  if (!version) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Link to="/app/administration/designs/feedback" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </Link>
        <h1 className="mt-3 text-2xl font-bold">Unknown design</h1>
      </main>
    );
  }

  const idx = SKIN_VERSIONS.indexOf(version);
  const prev = idx > 0 ? SKIN_VERSIONS[idx - 1] : null;
  const next = idx < SKIN_VERSIONS.length - 1 ? SKIN_VERSIONS[idx + 1] : null;

  const responses: number[] = draft.sus[version] ?? Array(SUS_QUESTIONS.length).fill(0);
  const allAnswered = responses.length === SUS_QUESTIONS.length && responses.every((n) => n >= 1 && n <= 5);
  const score = allAnswered ? computeSusScore(responses) : null;

  function setResponse(i: number, value: number) {
    update('sus', (prev) => {
      const arr = [...(prev[version!] ?? Array(SUS_QUESTIONS.length).fill(0))];
      arr[i] = value;
      return { ...prev, [version!]: arr };
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link to="/app/administration/designs/feedback" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" /> Questionnaire
      </Link>
      <header>
        <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
          SUS · design {idx + 1} of {SKIN_VERSIONS.length}
        </div>
        <h1 className="mt-1 text-2xl font-bold">{VERSION_LABELS[version]}</h1>
        <p className="mt-1 text-sm text-secondary">
          Rate each statement 1 (Strongly disagree) → 5 (Strongly agree).
          Score is computed live; the average across all reviewers is the comparable usability number.
        </p>
      </header>

      <a
        href={`/${version}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      >
        Open {VERSION_LABELS[version]} <ExternalLink className="size-3" aria-hidden />
      </a>

      <ol className="space-y-4">
        {SUS_QUESTIONS.map((q, i) => (
          <li key={q.index} className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono text-secondary">Q{q.index}</span>
              <span className={`rounded-pill px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                q.polarity === 'positive' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}>{q.polarity}</span>
            </div>
            <p className="mt-2 text-base font-medium">{q.prompt}</p>
            <LikertRow value={responses[i] ?? 0} onChange={(v) => setResponse(i, v)} />
          </li>
        ))}
      </ol>

      <section className="rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        {score !== null ? (
          <span>This reviewer's SUS score for {version.toUpperCase()}: <strong>{score.toFixed(1)}</strong> / 100 (industry-average threshold: 68)</span>
        ) : (
          <span>Score appears once all 10 items are rated.</span>
        )}
      </section>

      <nav className="flex items-center justify-between border-t border-border pt-4">
        {prev ? (
          <Button variant="outline" onClick={() => navigate(`/app/administration/designs/feedback/sus/${prev}`)} className="gap-1">
            <ChevronLeft className="size-4" /> {prev.toUpperCase()}
          </Button>
        ) : <span />}
        {next ? (
          <Button onClick={() => navigate(`/app/administration/designs/feedback/sus/${next}`)} className="gap-1">
            {next.toUpperCase()} <ChevronRight className="size-4" />
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

const LIKERT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

function LikertRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" className="mt-3 grid grid-cols-5 gap-2 text-center">
      {[1, 2, 3, 4, 5].map((n) => {
        const checked = value === n;
        return (
          <label
            key={n}
            className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-control border px-1 py-2 text-xs transition-colors ${
              checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface hover:border-primary/40'
            }`}
          >
            <input type="radio" name="likert" value={n} checked={checked} onChange={() => onChange(n)} className="sr-only" />
            <span className="text-base font-bold">{n}</span>
            <span className="leading-tight">{LIKERT_LABELS[n - 1]}</span>
          </label>
        );
      })}
    </div>
  );
}

export default FeedbackSusPage;
