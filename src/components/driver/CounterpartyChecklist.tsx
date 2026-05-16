/**
 * Read-only summary of someone-else's verification checklist — the counterparty on a trip.
 * Shown to a poster after they assign a driver (so they can see the driver's done/todo
 * steps), and to an assigned driver about the poster who hired them. Like
 * `<VerificationChecklist>` but without the per-step links (the viewer can't act on
 * someone else's steps) and without exposing any document URLs.
 */
import { CheckCircle2, Circle, Clock3, ShieldCheck, TriangleAlert } from 'lucide-react';
import { StatusBanner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { VerificationStepStatus, VerificationSummary } from '@/types';
import type { VerificationStepMeta } from './verificationSteps';
import { DRIVER_VERIFICATION_STEPS } from './verificationSteps';

function StepIcon({ status }: { status: VerificationStepStatus }) {
  if (status === 'done') return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />;
  if (status === 'action_needed') return <TriangleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />;
  if (status === 'scheduled') return <Clock3 className="size-4 shrink-0 text-blue-600" aria-hidden />;
  return <Circle className="size-4 shrink-0 text-gray-300" aria-hidden />;
}

export interface CounterpartyChecklistProps {
  verification: VerificationSummary;
  /** `DRIVER_VERIFICATION_STEPS` (default) or `AGENT_VERIFICATION_STEPS`. */
  steps?: VerificationStepMeta[];
  className?: string;
}

export function CounterpartyChecklist({ verification, steps = DRIVER_VERIFICATION_STEPS, className }: CounterpartyChecklistProps) {
  const { kycStatus, stepsDone, stepsTotal } = verification;

  if (kycStatus === 'approved') {
    return (
      <StatusBanner tone="success" icon={<ShieldCheck />} title="Verified — all checks complete." className={className} />
    );
  }

  return (
    <div className={cn('space-y-2 rounded-lg border bg-white p-3', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Verification</span>
        <span className="font-semibold text-secondary">{stepsDone}/{stepsTotal} done</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={stepsDone} aria-valuemin={0} aria-valuemax={stepsTotal}>
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0}%` }} />
      </div>
      <ul className="space-y-1.5">
        {steps.map((step) => {
          const status = verification.steps[step.key] ?? 'todo';
          return (
            <li key={step.key} className="flex items-center gap-2 text-xs">
              <StepIcon status={status} />
              <span className="truncate">{step.title}</span>
              {status === 'scheduled' && <span className="ml-auto rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700">scheduled</span>}
              {status === 'action_needed' && <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">action needed</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default CounterpartyChecklist;
