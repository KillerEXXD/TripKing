import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { useAdminFraudFlags, useResolveAdminFraudFlag } from '@/hooks/useAdminReferrals';

const RESOLVED_FILTERS: { key: 'open' | 'resolved' | 'all'; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const SEV_TINT: Record<string, string> = {
  low: 'bg-amber-50 text-amber-900 ring-amber-200',
  medium: 'bg-amber-100 text-amber-900 ring-amber-300',
  high: 'bg-rose-50 text-rose-900 ring-rose-200',
};

/** `/app/administration/referrals/flags` — Stage 9 fraud queue. Resolve with a note. */
export function AdminReferralFlagsPage() {
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});
  const params = filter === 'all' ? undefined : { resolved: filter === 'resolved' };
  const q = useAdminFraudFlags(params);
  const resolve = useResolveAdminFraudFlag();

  async function onResolve(id: string) {
    try {
      await resolve.mutateAsync({ id, resolvedNote: noteFor[id] });
      toast.success('Flag resolved');
      setNoteFor((p) => { const { [id]: _, ...rest } = p; void _; return rest; });
    } catch {}
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-6">
      <Link to="/app/administration/referrals" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Referrals
      </Link>
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Flag className="size-5" aria-hidden /> Fraud queue</h1>

      <nav className="flex flex-wrap gap-2" aria-label="Resolved filter">
        {RESOLVED_FILTERS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilter(s.key)}
            aria-current={filter === s.key ? 'page' : undefined}
            className={`rounded-full px-3 py-1 text-xs uppercase ${filter === s.key ? 'bg-black text-white' : 'bg-black/5 hover:bg-black/10'}`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {q.isPending ? (
        <LoadingSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState title="Couldn't load flags" message="Try again." onRetry={() => void q.refetch()} />
      ) : q.data.length === 0 ? (
        <Card><p className="text-sm text-secondary">No flags match this filter.</p></Card>
      ) : (
        <ul className="space-y-2">
          {q.data.map((f) => (
            <li key={f.id}>
              <Card className="gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${SEV_TINT[f.severity] ?? 'bg-muted/50 ring-input'}`}>{f.severity}</span>
                      <span className="text-sm font-semibold">{f.flagType.replace(/_/g, ' ')}</span>
                      {f.autoDetected ? <span className="text-[11px] text-secondary">(auto)</span> : null}
                    </div>
                    <Link to={`/app/referrals/${f.referralLinkId}`} className="text-xs font-medium text-primary hover:underline">
                      View referral →
                    </Link>
                    {f.note ? <p className="text-sm text-secondary">{f.note}</p> : null}
                    <p className="text-[11px] text-secondary">
                      Opened {new Date(f.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                      {f.resolvedAt ? ` · Resolved ${new Date(f.resolvedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                    </p>
                    {f.resolvedNote ? <p className="text-xs text-secondary"><span className="font-medium">Resolution:</span> {f.resolvedNote}</p> : null}
                  </div>
                  {!f.resolvedAt ? (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <input
                        type="text"
                        placeholder="Resolution note (optional)"
                        value={noteFor[f.id] ?? ''}
                        onChange={(e) => setNoteFor((p) => ({ ...p, [f.id]: e.target.value }))}
                        className="w-56 rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                      <Button type="button" size="sm" disabled={resolve.isPending} onClick={() => void onResolve(f.id)}>
                        <CheckCircle2 className="mr-1 size-3.5" aria-hidden /> Resolve
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default AdminReferralFlagsPage;
