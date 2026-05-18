import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VerificationChecklist } from '../VerificationChecklist';
import { AGENT_VERIFICATION_STEPS } from '../verificationSteps';
import type { VerificationSummary } from '@/types';

function renderChecklist(verification: VerificationSummary, steps?: typeof AGENT_VERIFICATION_STEPS) {
  return render(
    <MemoryRouter>
      <VerificationChecklist verification={verification} steps={steps} />
    </MemoryRouter>,
  );
}

describe('VerificationChecklist', () => {
  it('renders the 5-step driver checklist by default', () => {
    renderChecklist({ kycStatus: 'pending', steps: { details: 'done', documents: 'todo' }, stepsDone: 1, stepsTotal: 5 });
    expect(screen.getByText('Identity documents')).toBeInTheDocument();
    expect(screen.getByText('Add your vehicle')).toBeInTheDocument();
    expect(screen.getByText('Vehicle photos & papers')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('renders the agent 3-step checklist when passed AGENT_VERIFICATION_STEPS', () => {
    renderChecklist({ kycStatus: 'docs_submitted', steps: { details: 'done', documents: 'done', video_call: 'scheduled' }, stepsDone: 2, stepsTotal: 3 }, AGENT_VERIFICATION_STEPS);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(screen.queryByText('Add your vehicle')).toBeNull();
    expect(screen.getByText('Video verification').closest('a')).toHaveAttribute('href', '/app/verify/video-call');
    expect(screen.getByText('Identity documents').closest('a')).toHaveAttribute('href', '/app/verify/documents');
    expect(screen.getByText('scheduled')).toBeInTheDocument();
  });

  it('collapses to the "Verified" state once approved', () => {
    renderChecklist({ kycStatus: 'approved', steps: { details: 'done', documents: 'done', video_call: 'done' }, stepsDone: 3, stepsTotal: 3 }, AGENT_VERIFICATION_STEPS);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('surfaces the rejection reason on an action-needed step', () => {
    renderChecklist({ kycStatus: 'resubmit_required', steps: { details: 'done', documents: 'action_needed', video_call: 'todo' }, stepsDone: 1, stepsTotal: 3, kycRejectionReason: 'Aadhaar photo is blurry' }, AGENT_VERIFICATION_STEPS);
    expect(screen.getByText('action needed')).toBeInTheDocument();
    expect(screen.getByText(/Aadhaar photo is blurry/)).toBeInTheDocument();
  });
});
