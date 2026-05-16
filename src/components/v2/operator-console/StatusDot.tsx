import type { TripStatus } from '@/types';

type Tone = 'active' | 'needs-action' | 'blocked' | 'idle';

function toneFor(status: TripStatus): Tone {
  switch (status) {
    case 'in_progress':
    case 'accepted':
    case 'selected':
      return 'active';
    case 'has_applicants':
    case 'open':
      return 'needs-action';
    case 'cancelled':
      return 'blocked';
    default:
      return 'idle';
  }
}

const TONE_CLASS: Record<Tone, string> = {
  active: 'bg-emerald-500',
  'needs-action': 'bg-amber-500',
  blocked: 'bg-rose-500',
  idle: 'bg-zinc-300',
};

const TONE_LABEL: Record<Tone, string> = {
  active: 'Active',
  'needs-action': 'Needs action',
  blocked: 'Blocked',
  idle: 'Idle',
};

export function StatusDot({ status }: { status: TripStatus }) {
  const tone = toneFor(status);
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${TONE_CLASS[tone]}`}
      role="img"
      aria-label={TONE_LABEL[tone]}
    />
  );
}

export default StatusDot;
