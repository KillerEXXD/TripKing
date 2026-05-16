import { useState } from 'react';
import { ChevronDown, FileText, HelpCircle } from 'lucide-react';
import { Card } from '@/components/ui';

// Spec §21 — User-Facing Referral Terms (verbatim).
const TERMS: string[] = [
  'Referral rewards are not paid for signup alone.',
  "Referred users must become verified through TripKing's existing verification process.",
  'Promotional credits must be exhausted before referral earnings begin.',
  'Referral earnings are generated only from eligible real-money platform fees.',
  'Platform fees paid using Promotional Credits do not generate referral rewards.',
  'Platform fees paid using Earnings Transfer Credit do not generate referral rewards.',
  'Referral earnings are paid ₹50 per eligible paid completed trip until cap is reached.',
  "Referral cap depends on the referrer's tier.",
  'Earnings may be pending during the hold period.',
  'Earnings may be reversed for fraud, dispute, or policy violation.',
  'Promotional credits are not withdrawable.',
  'Transferred earnings are not withdrawable after transfer to your trip wallet.',
  'Monthly withdrawal limits apply.',
  'The platform may review, delay, or reject suspicious payouts.',
];

interface FAQ {
  q: string;
  a: string;
}
const FAQS: FAQ[] = [
  { q: 'How do I invite someone?', a: 'Share your referral code or link from the "Your referral code" card on home. They sign up with the link and you’re automatically credited as the referrer.' },
  { q: 'When do I start earning?', a: 'Once a referral verifies, finishes their launch credits, and runs an eligible paid trip with a real-money platform fee, you earn ₹50 per eligible trip until your tier cap.' },
  { q: 'What is the cap?', a: 'Each referral has a per-pair cap based on your tier (Tier 1 starts at ₹2,500). Once a referral hits their cap, that pair stops generating rewards — invite more people to keep earning.' },
  { q: 'Why didn’t I earn on a trip?', a: "Either the trip was paid from your referral's promo credit / earnings-transfer credit (those don't qualify), or the referred user isn't verified yet, or the cap is reached." },
  { q: 'Pending vs released?', a: 'New accruals start as pending and become released once the hold period passes. Only released earnings can be withdrawn or transferred.' },
  { q: 'Withdraw or transfer — what’s the difference?', a: 'Withdraw sends ₹ to your UPI. Transfer moves it into your trip wallet to pay platform fees — convenient, but it can’t be withdrawn later or generate further referral rewards.' },
  { q: 'Limits and rejections?', a: 'Monthly withdrawal limits apply, and we may delay or reject payouts that look suspicious for safety.' },
];

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</span>
        <ChevronDown className={`size-4 text-secondary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? <div className="text-sm">{children}</div> : null}
    </Card>
  );
}

/** Stage 10 — collapsible Terms (spec §21) + FAQ on the /referrals page. */
export function ReferralTermsAndFAQ() {
  return (
    <div className="space-y-2">
      <Section icon={<FileText className="size-4 text-secondary" aria-hidden />} title="Referral terms">
        <ol className="list-decimal space-y-1 pl-5 text-secondary">
          {TERMS.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
      </Section>
      <Section icon={<HelpCircle className="size-4 text-secondary" aria-hidden />} title="Frequently asked questions">
        <dl className="space-y-3">
          {FAQS.map((f, i) => (
            <div key={i}>
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-0.5 text-secondary">{f.a}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
