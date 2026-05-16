import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';

export type InsufficientBalanceSide = 'driver' | 'agent';

interface Props {
  side: InsufficientBalanceSide;
  message?: string;
  onClose: () => void;
}

const COPY: Record<InsufficientBalanceSide, { title: string; body: string; ownAction: string }> = {
  driver: {
    title: 'Driver wallet is short',
    body: "Your wallet doesn't have enough to cover the driver-side platform fee. Top up before the trip can be completed.",
    ownAction: 'Top up my wallet',
  },
  agent: {
    title: 'Agent wallet is short',
    body: "The trip poster's wallet doesn't have enough to cover the agent-side platform fee. They need to top up before this trip can be completed.",
    ownAction: 'Open my wallet',
  },
};

/**
 * Stage 3 — shown when `POST /trips/:id/complete` returns 402 / `INSUFFICIENT_WALLET_BALANCE_*`.
 * Either side blocking means the trip can't complete (charges are atomic), but only the affected
 * user can fix their own side — we still link to /wallet so the viewer can check / top up.
 */
export function InsufficientBalanceModal({ side, message, onClose }: Props) {
  const copy = COPY[side];
  return (
    <Dialog.Root open onOpenChange={(o) => (o ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-4 shadow-xl"
          aria-describedby={undefined}
        >
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="flex items-center gap-2 text-lg font-bold">
              <AlertCircle className="size-5 text-amber-600" aria-hidden /> {copy.title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-secondary hover:text-foreground">
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-secondary">{message ?? copy.body}</Dialog.Description>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Dismiss</Button>
            <Button type="button" variant="full" size="sm" asChild>
              <Link to="/wallet" onClick={onClose}>{copy.ownAction}</Link>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
