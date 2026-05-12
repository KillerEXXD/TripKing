/** Shown in place of a form when the signed-in user isn't KYC-verified yet (post-trip / post-vacancy). */
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export interface KycGateNoticeProps {
  /** Short heading, e.g. "Get verified to post a trip". */
  heading: string;
  /** One-line explanation of what's still needed. */
  body?: string;
  className?: string;
}

export function KycGateNotice({ heading, body, className }: KycGateNoticeProps) {
  return (
    <Card className={`gap-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="text-base font-semibold">{heading}</div>
      </div>
      <p className="text-sm text-secondary">{body ?? 'You can browse straight away, but posting and applying need a verified account. The checklist on your profile walks you through it — documents, your vehicle, and a quick video call.'}</p>
      <Button variant="full" size="lg" asChild>
        <Link to="/profile#get-verified">Go to verification</Link>
      </Button>
    </Card>
  );
}

export default KycGateNotice;
