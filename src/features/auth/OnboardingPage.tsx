import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CARDS = [
  {
    emoji: '🔔',
    title: 'Trips come to you',
    body: 'Trips from your city show up in your feed automatically. No more scrolling through WhatsApp groups looking for work.',
  },
  {
    emoji: '👆',
    title: 'Apply in one tap',
    body: "Every trip shows the route, distance, and exactly what you'll take home — fare minus commission & GST, plus your bata. Tap Apply. No typing.",
  },
  {
    emoji: '🚗',
    title: 'Drive & get paid',
    body: 'When the manager picks you, start the trip with the passenger’s OTP, finish it, and your payout (with bata) is queued — every time.',
  },
];

/**
 * One-time "how it works" intro, shown right after phone registration.
 * Skippable. Returning devices never see it again (gated on
 * `account.onboardedAt`).
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const account = useAuthStore((s) => s.account);
  const markOnboarded = useAuthStore((s) => s.markOnboarded);
  const [i, setI] = useState(0);

  if (!account || account.onboardedAt) return <Navigate to="/home" replace />;

  const last = i === CARDS.length - 1;
  const finish = () => {
    markOnboarded();
    navigate('/home', { replace: true });
  };
  const card = CARDS[i]!;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 to-white px-6">
      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={finish}
          className="text-sm text-muted-foreground hover:text-foreground font-medium"
        >
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto w-full">
        <div className="text-6xl mb-6">{card.emoji}</div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">{card.title}</h1>
        <p className="text-muted-foreground leading-relaxed">{card.body}</p>
      </div>

      <div className="max-w-sm mx-auto w-full pb-10 space-y-5">
        <div className="flex items-center justify-center gap-2">
          {CARDS.map((_, idx) => (
            <span
              key={idx}
              className={cn(
                'h-2 rounded-full transition-all',
                idx === i ? 'w-6 bg-primary' : 'w-2 bg-gray-300',
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {i > 0 && (
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setI((v) => v - 1)}>
              Back
            </Button>
          )}
          <Button
            variant="full"
            size="lg"
            className="flex-1"
            onClick={() => (last ? finish() : setI((v) => v + 1))}
          >
            {last ? 'Get started' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
