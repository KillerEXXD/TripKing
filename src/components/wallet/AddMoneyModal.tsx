import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { useInitiateTopup, useVerifyTopup } from '@/hooks/useCashWallet';
import { formatINR } from '@/lib/utils';

const PRESETS_RUPEES = [100, 500, 1000, 2000, 5000];
const MIN_RUPEES = 50;
const MAX_RUPEES = 50_000;

interface Props {
  onClose: () => void;
}

/**
 * Stage 2 — Add money modal. Razorpay Checkout integration is stubbed: when the
 * backend returns `stubbed: true` (no Razorpay credentials in env), we call
 * /verify directly with just the topup_id. Once Razorpay is wired the same flow
 * loads the Checkout SDK with `razorpay_key_id` + `order_id`.
 */
export function AddMoneyModal({ onClose }: Props) {
  const [rupees, setRupees] = useState<number>(500);
  const initiate = useInitiateTopup();
  const verify = useVerifyTopup();
  const busy = initiate.isPending || verify.isPending;

  const isValid = rupees >= MIN_RUPEES && rupees <= MAX_RUPEES;

  async function onConfirm() {
    if (!isValid) return;
    try {
      const init = await initiate.mutateAsync({ amountPaise: rupees * 100 });
      const result = await verify.mutateAsync({ topupId: init.topupId });
      if (result.alreadyCredited) {
        toast.info('Already credited');
      } else {
        toast.success(`Added ${formatINR(rupees)} to your wallet`);
      }
      onClose();
    } catch {
      // global mutation funnel toasts the error
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (o ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-4 shadow-xl"
          aria-describedby={undefined}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Add money</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-secondary hover:text-foreground">
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium">
              Amount (₹)
              <input
                type="number"
                inputMode="numeric"
                min={MIN_RUPEES}
                max={MAX_RUPEES}
                value={rupees}
                onChange={(e) => setRupees(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              {PRESETS_RUPEES.map((p) => (
                <Button key={p} type="button" variant={rupees === p ? 'default' : 'outline'} size="sm" onClick={() => setRupees(p)}>
                  {formatINR(p)}
                </Button>
              ))}
            </div>

            {!isValid ? (
              <p className="text-xs text-destructive">Enter an amount between {formatINR(MIN_RUPEES)} and {formatINR(MAX_RUPEES)}.</p>
            ) : null}

            <Button type="button" variant="full" onClick={() => void onConfirm()} disabled={!isValid || busy}>
              {busy ? 'Processing…' : `Add ${formatINR(rupees || 0)}`}
            </Button>

            <p className="text-center text-[11px] text-secondary">UPI / card top-ups via Razorpay coming soon — for now top-ups credit instantly.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
