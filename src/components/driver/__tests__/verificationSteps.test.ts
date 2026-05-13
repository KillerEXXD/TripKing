import { describe, it, expect } from 'vitest';
import { AGENT_VERIFICATION_STEPS, DRIVER_VERIFICATION_STEPS, nextActionableStep } from '../verificationSteps';
import type { VerificationSummary } from '@/types';

function v(steps: VerificationSummary['steps']): VerificationSummary {
  const done = Object.values(steps).filter((s) => s === 'done').length;
  return { kycStatus: 'docs_submitted', steps, stepsDone: done, stepsTotal: Object.keys(steps).length };
}

describe('verificationSteps', () => {
  it('the driver checklist has the 5 steps in order, routing each to its screen', () => {
    expect(DRIVER_VERIFICATION_STEPS.map((s) => s.key)).toEqual(['details', 'documents', 'vehicle', 'vehicle_photos', 'video_call']);
    expect(DRIVER_VERIFICATION_STEPS[1].route(undefined)).toBe('/verify/documents');
    expect(DRIVER_VERIFICATION_STEPS[3].route('veh-1')).toBe('/vehicles/veh-1/photos');
    expect(DRIVER_VERIFICATION_STEPS[3].route(undefined)).toBe('/vehicles/new');
  });

  it('the agent checklist is the 3-step variant — details, documents, video_call (no vehicle/licence)', () => {
    expect(AGENT_VERIFICATION_STEPS.map((s) => s.key)).toEqual(['details', 'documents', 'video_call']);
    expect(AGENT_VERIFICATION_STEPS.map((s) => s.route(undefined))).toEqual(['/profile#edit', '/verify/documents', '/verify/video-call']);
  });

  it('nextActionableStep defaults to the driver checklist', () => {
    expect(nextActionableStep(v({ details: 'done', documents: 'todo' }))?.key).toBe('documents');
    expect(nextActionableStep(v({ details: 'done', documents: 'done', vehicle: 'todo' }))?.key).toBe('vehicle');
  });

  it('nextActionableStep walks the supplied checklist and skips done/scheduled steps', () => {
    expect(nextActionableStep(v({ details: 'done', documents: 'todo', video_call: 'todo' }), AGENT_VERIFICATION_STEPS)?.key).toBe('documents');
    expect(nextActionableStep(v({ details: 'done', documents: 'action_needed', video_call: 'todo' }), AGENT_VERIFICATION_STEPS)?.key).toBe('documents');
    expect(nextActionableStep(v({ details: 'done', documents: 'done', video_call: 'scheduled' }), AGENT_VERIFICATION_STEPS)).toBeNull();
    expect(nextActionableStep(v({ details: 'done', documents: 'done', video_call: 'done' }), AGENT_VERIFICATION_STEPS)).toBeNull();
  });
});
