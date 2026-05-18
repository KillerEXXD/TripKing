/**
 * The "Get verified" home banner — a compact progress card shown at the top of the driver home
 * while `kyc_status !== 'approved'`. Links to whichever step the driver should do next.
 */
import { Link } from 'react-router-dom';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VerificationSummary } from '@/types';
import { DRIVER_VERIFICATION_STEPS, nextActionableStep, type VerificationStepMeta } from './verificationSteps';

export interface GetVerifiedBannerProps {
  verification: VerificationSummary;
  /** the checklist steps — `DRIVER_VERIFICATION_STEPS` (default) or `AGENT_VERIFICATION_STEPS`. */
  steps?: VerificationStepMeta[];
  className?: string;
}

export function GetVerifiedBanner({ verification, steps = DRIVER_VERIFICATION_STEPS, className }: GetVerifiedBannerProps) {
  if (verification.kycStatus === 'approved') return null;
  const { stepsDone, stepsTotal } = verification;
  const next = nextActionableStep(verification, steps);
  const waiting =
    !next && verification.kycStatus === 'video_pending'
      ? 'Your video call is scheduled — sit tight.'
      : !next
        ? 'Your documents are with our team for review.'
        : null;
  const to = '/app/profile#get-verified';
  const pct = stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0;

  return (
    <Link to={to} className={cn('block rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 transition-colors hover:bg-emerald-50', className)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-emerald-900">Get verified to start earning</div>
          <div className="truncate text-xs text-emerald-800/80">{waiting ?? (next ? `Next: ${next.title}` : 'Almost there')}</div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-emerald-700" aria-hidden />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100">
          <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[11px] font-semibold text-emerald-800">{stepsDone}/{stepsTotal}</span>
      </div>
    </Link>
  );
}

export default GetVerifiedBanner;
