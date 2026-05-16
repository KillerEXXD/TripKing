import { Copy, Gift, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { useReferral, type ReferralRole } from '@/hooks/useReferral';
import { formatINR } from '@/lib/utils';

interface Props {
  role: ReferralRole;
}

async function copy(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy — long-press to copy manually");
  }
}

/** Stage 1 — minimal "Your referral code" card: code + copy/share. Hidden until the backend returns a code. */
export function ReferralCodeCard({ role }: Props) {
  const { data, isLoading, isError } = useReferral(role);

  if (isLoading) return <LoadingSkeleton className="h-28" />;
  // Until the backend Stage 1 PR ships, code is undefined — render nothing rather than a noisy error.
  if (isError || !data) return null;

  return (
    <Card aria-label="Your referral code">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Gift className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Your referral code</div>
          <div className="text-xs text-secondary">Share with drivers & trip managers — invite them to TripKing.</div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-3 py-2">
        <code className="text-base font-mono font-semibold tracking-wider">{data.code}</code>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy(data.code, 'Code')} aria-label="Copy referral code">
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy(data.link, 'Link')}>
          <Copy className="mr-1.5 size-4" aria-hidden /> Copy link
        </Button>
        <Button type="button" size="sm" asChild>
          <a href={data.whatsappUrl} target="_blank" rel="noopener noreferrer">
            <Share2 className="mr-1.5 size-4" aria-hidden /> WhatsApp
          </a>
        </Button>
      </div>

      {data.summary && data.summary.totalReferred > 0 ? (
        <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center text-xs">
          <div>
            <div className="text-base font-bold tabular-nums">{data.summary.totalReferred}</div>
            <div className="text-secondary">Referred</div>
          </div>
          <div>
            <div className="text-base font-bold tabular-nums">{data.summary.qualifiedReferrals}</div>
            <div className="text-secondary">Qualified</div>
          </div>
          <div>
            <div className="text-base font-bold tabular-nums">{formatINR(Math.round(data.summary.lifetimeEarnedPaise / 100))}</div>
            <div className="text-secondary">Earned</div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
