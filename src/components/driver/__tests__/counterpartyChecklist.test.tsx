import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CounterpartyChecklist } from '../CounterpartyChecklist';
import { AGENT_VERIFICATION_STEPS } from '../verificationSteps';
import type { VerificationSummary } from '@/types';

function r(v: VerificationSummary, steps?: typeof AGENT_VERIFICATION_STEPS) {
  return render(<CounterpartyChecklist verification={v} steps={steps} />);
}

describe('CounterpartyChecklist', () => {
  it('renders all 5 driver steps with status icons by default', () => {
    r({ kycStatus: 'pending', steps: { details: 'done', documents: 'todo', vehicle: 'todo', vehicle_photos: 'todo', video_call: 'todo' }, stepsDone: 1, stepsTotal: 5 });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('1/5 done')).toBeInTheDocument();
  });

  it('renders the 3-step agent checklist when given AGENT_VERIFICATION_STEPS', () => {
    r({ kycStatus: 'docs_submitted', steps: { details: 'done', documents: 'done', video_call: 'scheduled' }, stepsDone: 2, stepsTotal: 3 }, AGENT_VERIFICATION_STEPS);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('shows an "action needed" pill when a step is action_needed', () => {
    r({ kycStatus: 'resubmit_required', steps: { details: 'done', documents: 'action_needed', video_call: 'todo' }, stepsDone: 1, stepsTotal: 3 }, AGENT_VERIFICATION_STEPS);
    expect(screen.getByText('action needed')).toBeInTheDocument();
  });

  it('collapses to a single "Verified" banner once approved', () => {
    r({ kycStatus: 'approved', steps: { details: 'done', documents: 'done', video_call: 'done' }, stepsDone: 3, stepsTotal: 3 }, AGENT_VERIFICATION_STEPS);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('progress bar reflects stepsDone/stepsTotal', () => {
    r({ kycStatus: 'docs_submitted', steps: { details: 'done', documents: 'done', vehicle: 'todo', vehicle_photos: 'todo', video_call: 'todo' }, stepsDone: 2, stepsTotal: 5 });
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('2');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
  });
});
