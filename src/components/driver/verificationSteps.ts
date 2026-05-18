/** Shared metadata for the driver "Get verified" checklist (title / why-we-need-it / target route). */
import type { DriverVerificationStepKey, VerificationSummary } from '@/types';

export interface VerificationStepMeta {
  key: DriverVerificationStepKey;
  title: string;
  why: string;
  /** target route; gets the driver's primary vehicle id (when one exists) for the photos step. */
  route: (primaryVehicleId?: string) => string;
}

export const DRIVER_VERIFICATION_STEPS: VerificationStepMeta[] = [
  { key: 'details', title: 'Your details', why: 'Your name and home city — done when you signed up. Tap to edit.', route: () => '/app/profile#edit'},
  {
    key: 'documents',
    title: 'Identity documents',
    why: 'Aadhaar (front & back), driving licence and a selfie — so we can confirm you are a real, licensed driver. Only admins see them.',
    route: () => '/app/verify/documents',
  },
  { key: 'vehicle', title: 'Add your vehicle', why: 'The make, model, year and fuel type of the car you will drive.', route: () => '/app/vehicles/new' },
  {
    key: 'vehicle_photos',
    title: 'Vehicle photos & papers',
    why: 'Photos of the car — front, back, both sides and the number plate — plus the RC book and insurance.',
    route: (vid) => (vid ? `/app/vehicles/${vid}/photos` : '/app/vehicles/new'),
  },
  { key: 'video_call', title: 'Video verification', why: 'A quick video call so an admin can match your face to your documents and check the car is roadworthy.', route: () => '/app/verify/video-call' },
];

/** The trip-manager (agent) verification checklist — Aadhaar + selfie + a video call, no vehicle/licence. */
export const AGENT_VERIFICATION_STEPS: VerificationStepMeta[] = [
  { key: 'details', title: 'Your details', why: 'Your name and business city — done when you signed up. Tap to edit.', route: () => '/app/profile#edit'},
  {
    key: 'documents',
    title: 'Identity documents',
    why: 'Aadhaar (front & back) and a selfie — so we can confirm who you are. Only admins see them.',
    route: () => '/app/verify/documents',
  },
  { key: 'video_call', title: 'Video verification', why: 'A quick video call so an admin can match your face to your documents.', route: () => '/app/verify/video-call' },
];

/** The next step the user should act on (the first `todo` / `action_needed`), or null if they're just waiting. */
export function nextActionableStep(v: VerificationSummary, steps: VerificationStepMeta[] = DRIVER_VERIFICATION_STEPS): VerificationStepMeta | null {
  for (const step of steps) {
    const s = v.steps[step.key];
    if (s === 'todo' || s === 'action_needed') return step;
  }
  return null;
}
