import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Briefcase, Car } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cityHooks } from '@/hooks/useAdminConfig';
import { useCreateMyAgentProfile, useCreateMyDriverProfile, useMyAgent, useMyDriver } from '@/hooks/useDrivers';
import { Button, Card, Input } from '@/components/ui';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import { cn } from '@/lib/utils';

type ProfileRole = 'driver' | 'trip_manager';
type Step = 'intro' | 'role' | 'profile';

interface IntroCard {
  emoji: string;
  title: string;
  body: string;
}

// A driver mostly takes trips — and occasionally posts one they can't run.
const DRIVER_CARDS: IntroCard[] = [
  { emoji: '🔔', title: 'Trips come to you', body: 'Trips from your city show up in your feed automatically. No more scrolling through WhatsApp groups looking for work.' },
  { emoji: '👆', title: 'Apply in one tap', body: "Every trip shows the route, distance, and exactly what you'll take home — fare plus your bata. Tap Apply. No typing." },
  { emoji: '🚗', title: 'Drive & get paid', body: "When the agent picks you, start the trip with the passenger's OTP, finish it, and your payout (with bata) is queued — every time." },
  {
    emoji: '🛡️',
    title: 'Get verified to start earning',
    body: 'Browse straight away — but to apply you’ll need to verify: upload your Aadhaar, licence and a selfie, add your car (with photos, RC & insurance), and do a quick video call. There’s a checklist on your profile that walks you through it.',
  },
  { emoji: '📤', title: "Got a trip you can't take?", body: 'Post it for another driver — we pre-fill the route, time and fare. You become the agent for that one ride.' },
  { emoji: '🎁', title: 'Earn ₹50 per trip when you invite drivers', body: 'Share your referral code from the home screen — once a driver you invite gets verified and starts running paid trips, you earn ₹50 per eligible trip until you hit your tier cap.' },
];

// An agent only posts and shepherds trips — they never drive.
const AGENT_CARDS: IntroCard[] = [
  { emoji: '➕', title: 'Post a trip in two steps', body: "Route & time, then price — that's it. Then share it to WhatsApp or Telegram in one tap so drivers see it instantly." },
  { emoji: '🛡️', title: 'Get verified to start posting', body: 'To post trips you’ll first verify your account — upload your Aadhaar and a selfie, then do a quick video call. Your profile has a checklist for it.' },
  { emoji: '👥', title: 'Drivers come to you', body: 'Applicants land with their rating, recent trips and any counter-quote. Pick the one you trust — no group chasing.' },
  { emoji: '🔑', title: 'Track it to the finish', body: 'Assign a driver and an OTP is generated for the passenger. Watch the trip move open → assigned → in progress → done.' },
  { emoji: '🎁', title: 'Earn ₹50 per trip when you invite agents & drivers', body: 'Share your referral code from the home screen — once they get verified and start running paid trips, you earn ₹50 per eligible trip until you hit your tier cap.' },
];

function pickRole(role: string | undefined): ProfileRole | null {
  return role === 'driver' || role === 'trip_manager' ? role : null;
}

/**
 * Post-sign-in onboarding / KYC. `verify-otp` only creates the `users` row; this
 * screen turns it into a driver or agent via `POST /drivers` (the cross-lane
 * contract). Flow: role-keyed "how it works" carousel → confirm role → name +
 * home/business city → create profile (KYC starts `pending`). Drivers add their
 * vehicle from Profile afterwards.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [role, setRole] = useState<ProfileRole>(pickRole(user?.role) ?? 'driver');
  const [step, setStep] = useState<Step>('intro');
  const [slide, setSlide] = useState(0);
  const [fullName, setFullName] = useState(user?.displayName ?? '');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [cityId, setCityId] = useState('');

  const citiesQuery = cityHooks.useList();
  const createDriver = useCreateMyDriverProfile();
  const createAgent = useCreateMyAgentProfile();
  // Returning user with a profile already? Bail to home — SignInPage routes everyone
  // here after OTP, so a fresh login on an existing account would otherwise land here.
  const myDriver = useMyDriver();
  const myAgent = useMyAgent();
  useEffect(() => {
    if (myDriver.data || myAgent.data) navigate('/', { replace: true });
  }, [myDriver.data, myAgent.data, navigate]);
  const submitting = createDriver.isPending || createAgent.isPending;
  const submitFailed = createDriver.isError || createAgent.isError;

  const goHome = () => navigate('/', { replace: true });

  const isAgent = role === 'trip_manager';
  const cards = isAgent ? AGENT_CARDS : DRIVER_CARDS;
  const card = cards[Math.min(slide, cards.length - 1)]!;
  const lastSlide = slide === cards.length - 1;
  const canSubmit = fullName.trim().length > 0 && cityId.length > 0 && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (fullName.trim().length === 0 || cityId.length === 0) return;
    try {
      if (isAgent) {
        await createAgent.mutateAsync({
          fullName: fullName.trim(),
          businessCityId: cityId,
          email: email.trim() || undefined,
          businessName: businessName.trim() || undefined,
        });
      } else {
        await createDriver.mutateAsync({ fullName: fullName.trim(), homeCityId: cityId, email: email.trim() || undefined });
      }
      toast.success('Profile created — your details are pending verification.');
      goHome();
    } catch {
      toast.error("Couldn't create your profile — try again.");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 to-transparent px-6">
      <div className="flex justify-end pt-4">
        {step === 'intro' ? (
          <button type="button" onClick={() => setStep('role')} className="text-sm font-medium text-secondary hover:text-foreground">
            Skip
          </button>
        ) : null}
      </div>

      {step === 'intro' ? (
        <>
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center text-center">
            <div className="mb-6 text-6xl" aria-hidden>
              {card.emoji}
            </div>
            <h1 className="mb-3 text-2xl font-bold tracking-tight">{card.title}</h1>
            <p className="leading-relaxed text-secondary">{card.body}</p>
          </div>
          <div className="mx-auto w-full max-w-sm space-y-5 pb-10">
            <div className="flex items-center justify-center gap-2" aria-hidden>
              {cards.map((_, idx) => (
                <span key={idx} className={cn('h-2 rounded-full transition-all', idx === slide ? 'w-6 bg-primary' : 'w-2 bg-black/20')} />
              ))}
            </div>
            <div className="flex items-center gap-3">
              {slide > 0 ? (
                <Button variant="outline" size="lg" className="flex-1" onClick={() => setSlide((v) => v - 1)}>
                  Back
                </Button>
              ) : null}
              <Button variant="full" size="lg" className="flex-1" onClick={() => (lastSlide ? setStep('role') : setSlide((v) => v + 1))}>
                {lastSlide ? 'Get started' : 'Next'}
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {step === 'role' ? (
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 pb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">How will you use TripKing?</h1>
            <p className="mt-1 text-sm text-secondary">Pick the one that fits — you can ask an admin to change it later.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setRole('driver');
              setStep('profile');
            }}
            className={cn(
              'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors hover:bg-muted',
              role === 'driver' ? 'border-primary' : 'border-input',
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Car className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">I&apos;m a Driver</span>
              <span className="block text-sm text-secondary">I find and run trips</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRole('trip_manager');
              setStep('profile');
            }}
            className={cn(
              'flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors hover:bg-muted',
              role === 'trip_manager' ? 'border-primary' : 'border-input',
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Briefcase className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-semibold">I&apos;m an Agent (Trip Manager)</span>
              <span className="block text-sm text-secondary">I post trips and assign drivers</span>
            </span>
          </button>
          <button type="button" onClick={() => setStep('intro')} className="text-sm text-secondary underline">
            Back
          </button>
        </div>
      ) : null}

      {step === 'profile' ? (
        <div className="mx-auto w-full max-w-sm flex-1 py-4">
          <h1 className="mb-1 text-2xl font-bold tracking-tight">{isAgent ? 'Set up your agent profile' : 'Set up your driver profile'}</h1>
          <p className="mb-4 text-sm text-secondary">Your details go to our team for verification — you can keep using the app while that&apos;s pending.</p>

          {citiesQuery.isPending ? (
            <LoadingSkeleton rows={4} />
          ) : citiesQuery.isError ? (
            <ErrorState title="Couldn't load cities" message="We need the city list to finish setup." onRetry={() => void citiesQuery.refetch()} />
          ) : (citiesQuery.data ?? []).length === 0 ? (
            <EmptyState title="No cities available yet" message="An admin needs to add cities before profiles can be created." />
          ) : (
            <Card>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="ob-name" className="text-sm font-medium">
                    Full name
                  </label>
                  <Input id="ob-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" required autoFocus />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ob-city" className="text-sm font-medium">
                    {isAgent ? 'Business city' : 'Home city'}
                  </label>
                  <select
                    id="ob-city"
                    value={cityId}
                    onChange={(e) => setCityId(e.target.value)}
                    required
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
                  >
                    <option value="" disabled>
                      Select a city
                    </option>
                    {(citiesQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.state ? `, ${c.state}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {isAgent ? (
                  <div className="space-y-1">
                    <label htmlFor="ob-business" className="text-sm font-medium">
                      Business name <span className="font-normal text-secondary">(optional)</span>
                    </label>
                    <Input id="ob-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Sai Travels" />
                  </div>
                ) : null}
                <div className="space-y-1">
                  <label htmlFor="ob-email" className="text-sm font-medium">
                    Email <span className="font-normal text-secondary">(optional)</span>
                  </label>
                  <Input id="ob-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>

                {submitFailed ? <p className="text-sm text-red-700">Couldn&apos;t create your profile — please try again.</p> : null}

                <Button type="submit" variant="full" size="lg" disabled={!canSubmit}>
                  {submitting ? 'Creating…' : 'Create my profile'}
                </Button>
                {!isAgent ? <p className="text-center text-xs text-secondary">Next: add your vehicle from your profile.</p> : null}
              </form>
            </Card>
          )}

          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" onClick={() => setStep('role')} className="text-secondary underline">
              Back
            </button>
            <button type="button" onClick={goHome} className="text-secondary underline">
              Skip for now
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default OnboardingPage;
