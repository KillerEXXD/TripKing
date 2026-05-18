import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useDesignFeedbackResults } from '@/hooks/useDesignFeedback';
import {
  PREFERENCE_PAGES,
  CROSS_PAGE_QUESTIONS,
  SKIN_VERSIONS,
  VERSION_LABELS,
} from '@/lib/designFeedback/questions';
import type { SkinVersion } from '@/lib/designFeedback/questions';
import { averageSusScore, computeSusScore } from '@/lib/designFeedback/sus';
import type { DesignFeedbackRow } from '@/lib/api/services/designFeedback';

/**
 * /app/administration/designs/feedback/results — aggregation dashboard.
 * Reads every submission; computes vote tallies + average SUS per design.
 */
export function FeedbackResultsPage() {
  const query = useDesignFeedbackResults();

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <Link to="/app/administration/designs" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" /> Design previews
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Feedback results</h1>
        <p className="mt-1 text-sm text-secondary">
          Aggregated across {query.data?.length ?? 0} {query.data?.length === 1 ? 'submission' : 'submissions'}.
        </p>
      </header>

      {query.isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState message="Couldn't load results." onRetry={() => query.refetch()} />
      ) : !query.data || query.data.length === 0 ? (
        <section className="rounded-card border border-dashed border-border p-8 text-center text-sm text-secondary">
          No submissions yet. Reviewers can start at{' '}
          <Link to="/app/administration/designs/feedback" className="text-primary underline">the questionnaire</Link>.
        </section>
      ) : (
        <>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">SUS scores (average per design)</h2>
              <ExportCsv rows={query.data} />
            </div>
            <SusTable rows={query.data} />
          </section>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">Preference votes — per page</h2>
            {PREFERENCE_PAGES.map((page) => (
              <article key={page.pageKey} className="mb-4 rounded-card bg-surface p-4 shadow-card">
                <h3 className="text-sm font-semibold">{page.label}</h3>
                <dl className="mt-2 space-y-2">
                  {page.questions.map((q) => (
                    <div key={q.key}>
                      <dt className="text-xs text-secondary">{q.prompt}</dt>
                      <dd className="mt-1"><Tally rows={query.data ?? []} questionKey={q.key} /></dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </section>

          <section className="rounded-card bg-surface p-4 shadow-card">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">Cross-page synthesis</h2>
            <dl className="space-y-2">
              {CROSS_PAGE_QUESTIONS.filter((q) => q.kind === 'pick-version').map((q) => (
                <div key={q.key}>
                  <dt className="text-xs text-secondary">{q.prompt}</dt>
                  <dd className="mt-1"><Tally rows={query.data ?? []} questionKey={q.key} source="cross_page" /></dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-card bg-surface p-4 shadow-card">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-secondary">Submissions</h2>
            <ul className="divide-y divide-border text-sm">
              {query.data.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span className="font-medium">{r.reviewer_name}</span>
                  <span className="text-xs text-secondary">{new Date(r.submitted_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function SusTable({ rows }: { rows: DesignFeedbackRow[] }) {
  return (
    <table className="w-full table-auto text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-secondary">
          <th className="py-2">Design</th>
          <th className="py-2 text-right">Avg SUS</th>
          <th className="py-2 text-right">n</th>
          <th className="py-2 text-right">Verdict</th>
        </tr>
      </thead>
      <tbody>
        {SKIN_VERSIONS.map((v) => {
          const scores = rows
            .map((r) => r.sus_scores?.[v])
            .filter((arr): arr is number[] => Array.isArray(arr) && arr.length === 10 && arr.every((n) => n >= 1 && n <= 5))
            .map((arr) => computeSusScore(arr));
          const avg = averageSusScore(scores);
          const verdict = avg === null ? '—' : avg >= 80 ? 'Excellent' : avg >= 68 ? 'Above avg' : avg >= 50 ? 'OK' : 'Below avg';
          return (
            <tr key={v} className="border-b border-border last:border-0">
              <td className="py-2 font-medium">{VERSION_LABELS[v]}</td>
              <td className="py-2 text-right font-mono">{avg === null ? '—' : avg.toFixed(1)}</td>
              <td className="py-2 text-right text-secondary">{scores.length}</td>
              <td className="py-2 text-right text-xs">{verdict}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Tally({
  rows, questionKey, source = 'preferences',
}: {
  rows: DesignFeedbackRow[];
  questionKey: string;
  source?: 'preferences' | 'cross_page';
}) {
  const counts: Record<SkinVersion, number> = { v2: 0, v3: 0, v4: 0, v5: 0, v6: 0, v7: 0 };
  for (const r of rows) {
    const bag = source === 'cross_page' ? r.cross_page : r.preferences;
    const pick = bag?.[questionKey];
    if ((SKIN_VERSIONS as readonly string[]).includes(pick ?? '')) counts[pick as SkinVersion]++;
  }
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="grid grid-cols-6 gap-1">
      {SKIN_VERSIONS.map((v) => (
        <div key={v} className="flex flex-col items-center">
          <div className="h-12 w-full rounded bg-muted">
            <div
              className="h-full w-full origin-bottom rounded bg-primary transition-transform"
              style={{ transform: `scaleY(${counts[v] / max})` }}
              aria-hidden
            />
          </div>
          <div className="mt-1 text-[10px] font-mono">{v}</div>
          <div className="text-[10px] text-secondary">{counts[v]}</div>
        </div>
      ))}
    </div>
  );
}

function ExportCsv({ rows }: { rows: DesignFeedbackRow[] }) {
  function download() {
    const header = ['reviewer_name', 'submitted_at', 'question_key', 'response_kind', 'value'];
    const lines = [header.join(',')];
    for (const r of rows) {
      for (const [k, v] of Object.entries(r.preferences ?? {}))   lines.push(csv([r.reviewer_name, r.submitted_at, k, 'preference', String(v)]));
      for (const [k, v] of Object.entries(r.cross_page ?? {}))    lines.push(csv([r.reviewer_name, r.submitted_at, k, 'cross_page', String(v)]));
      for (const [v, arr] of Object.entries(r.sus_scores ?? {}))  if (Array.isArray(arr)) lines.push(csv([r.reviewer_name, r.submitted_at, `sus.${v}`, 'sus', arr.join(';')]));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `design-feedback-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  function csv(cells: string[]) {
    return cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
  }
  return (
    <button type="button" onClick={download} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      <Download className="size-3" /> Export CSV
    </button>
  );
}

export default FeedbackResultsPage;
