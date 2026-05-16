/**
 * The "Get verified" checklist — the canonical view of the verification steps, shown on /profile.
 * Reads the server-computed `verification` block; each row links to its own screen. Pass `steps` to
 * render the driver checklist (5 steps, the default) or the agent one (`AGENT_VERIFICATION_STEPS`, 3).
 */
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Circle, Clock3, ShieldCheck, TriangleAlert } from 'lucide-react';
import { StatusBanner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { VerificationStepStatus, VerificationSummary } from '@/types';
import { DRIVER_VERIFICATION_STEPS, type VerificationStepMeta } from './verificationSteps';

function StepIcon({ status }: { status: VerificationStepStatus }) {
  if (status === 'done') return <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden />;
  if (status === 'action_needed') return <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />;
  if (status === 'scheduled') return <Clock3 className="size-5 shrink-0 text-blue-600" aria-hidden />;
  return <Circle className="size-5 shrink-0 text-gray-300" aria-hidden />;
}

export interface VerificationChecklistProps {
  verification: VerificationSummary;
  /** the checklist steps to render — `DRIVER_VERIFICATION_STEPS` (default) or `AGENT_VERIFICATION_STEPS`. */
  steps?: VerificationStepMeta[];
  /** the driver's primary (or first) vehicle id, used for the "Vehicle photos" step (driver checklist only). */
  primaryVehicleId?: string;
  className?: string;
}

export function VerificationChecklist({ verification, steps = DRIVER_VERIFICATION_STEPS, primaryVehicleId, className }: VerificationChecklistProps) {
  const { kycStatus, stepsDone, stepsTotal, kycRejectionReason } = verification;

  if (kycStatus === 'approved') {
    return (
      <StatusBanner tone="success" icon={<ShieldCheck />} title="Verified — you can apply to and post trips." className={className} />
    );
  }

  return (
    <section className={cn('space-y-2 rounded-xl border bg-white p-4', className)} aria-labelledby="getverified-h">
      <header className="flex items-center justify-between gap-2">
        <h2 id="getverified-h" className="text-sm font-semibold">Get verified to start earning</h2>
        <span className="text-xs font-semibold text-secondary">{stepsDone}/{stepsTotal} done</span>
      </header>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={stepsDone} aria-valuemin={0} aria-valuemax={stepsTotal}>
        <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${stepsTotal ? Math.round((stepsDone / stepsTotal) * 100) : 0}%` }} />
      </div>

      {kycStatus === 'rejected' && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Your verification was rejected{kycRejectionReason ? `: ${kycRejectionReason}` : '.'} Please contact support.
        </p>
      )}

      <ul className="divide-y">
        {steps.map((step) => {
          const status = verification.steps[step.key] ?? 'todo';
          const to = step.route(primaryVehicleId);
          return (
            <li key={step.key}>
              <Link to={to} className="flex items-start gap-3 py-2.5 transition-colors hover:bg-muted/40">
                <StepIcon status={status} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {step.title}
                    {status === 'scheduled' && <span className="rounded-full bg-blue-100 px-1.5 text-[10px] font-semibold text-blue-700">scheduled</span>}
                    {status === 'action_needed' && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">action needed</span>}
                  </span>
                  <span className="block text-xs text-secondary">{step.why}</span>
                  {status === 'action_needed' && kycRejectionReason && <span className="mt-0.5 block text-xs font-medium text-amber-700">“{kycRejectionReason}”</span>}
                </span>
                <ChevronRight className="size-4 shrink-0 self-center text-gray-300" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default VerificationChecklist;
