import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/components/ui';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { apiClient } from '@/lib/api/client';
import { OTP_LENGTH } from '@/lib/constants';

/** Crown mark (matches the PWA icon / `public/logo-mark.svg`). */
function CrownMark({ className = 'size-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden role="img">
      <path
        d="M6 16l9 8 9-14 9 14 9-8-4 22H10L6 16z"
        fill="var(--color-primary)"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="16" r="3" fill="var(--color-primary)" />
      <circle cx="24" cy="10" r="3" fill="var(--color-primary)" />
      <circle cx="42" cy="16" r="3" fill="var(--color-primary)" />
    </svg>
  );
}

// E.164 country codes commonly used here; admin can extend the cities lookup but country codes are a small fixed set.
const COUNTRY_CODES = [
  { code: '+91', flag: 'IN' },
  { code: '+1', flag: 'US' },
  { code: '+44', flag: 'GB' },
  { code: '+971', flag: 'AE' },
  { code: '+65', flag: 'SG' },
];

function fromOf(state: unknown): string {
  return (state as { from?: string } | null)?.from ?? '/';
}
const onlyDigits = (s: string) => s.replace(/\D/g, '');

/**
 * `/app/signin` — phone-OTP sign-in (the equivalent of the prototype's `/auth`). Talks to the
 * `/auth` edge function. There's no real SMS provider yet (placeholder): any phone number is
 * accepted, the "send OTP" step is best-effort (it just advances to OTP entry), and the dev
 * code is always `123456`. When a real SMS provider lands we'll enforce delivery + validation.
 * On a plain sign-in we send the user to `/app/onboarding` (name → role → city → create profile);
 * if they were bounced here from a protected page, we honour that `from` instead.
 */
export function SignInPage() {
  const { isAuthenticated, isLoading, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [cc, setCc] = useState('+91');
  const [localPhone, setLocalPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  // Stale-token cleanup. Once auth has finished bootstrapping and the user landed here
  // unauthenticated, any leftover tokens in localStorage are dead (the session restore
  // already 401'd). Clear them eagerly so the next request doesn't trigger another
  // round-trip refresh-attempt-then-fail — the noise we saw on the /signin console
  // screenshot in incident 2026-05-16. Safe to run on a clean visit (no-op when no token).
  useEffect(() => {
    if (!isLoading && !isAuthenticated && apiClient.getAccessToken()) {
      apiClient.clearTokens();
    }
  }, [isLoading, isAuthenticated]);

  if (isAuthenticated) return <Navigate to={fromOf(location.state)} replace />;

  const phoneE164 = `${cc}${onlyDigits(localPhone)}`;
  // No real SMS provider yet — accept any non-empty number; the dev code is always 123456.
  const phoneValid = onlyDigits(localPhone).length > 0;

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    if (!phoneValid) return;
    setBusy(true);
    // Best-effort: nothing is actually sent in this build, so a failed/absent /auth/request-otp
    // shouldn't block sign-in — just move to OTP entry. (Real-SMS validation comes later.)
    try {
      await requestOtp(phoneE164);
    } catch {
      // ignore — proceed to OTP entry regardless
    }
    setStage('otp');
    setBusy(false);
    toast.success(`Enter the ${OTP_LENGTH}-digit code (demo: 123456)`);
  }
  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (otp.length < OTP_LENGTH) return;
    setBusy(true);
    try {
      const me = await verifyOtp(phoneE164, otp);
      const from = fromOf(location.state);
      // Admins never need driver/agent onboarding — skip straight to the role-aware home
      // so the RoleSwitcher + bottom nav render. Drivers/agents still pass through
      // /onboarding, which itself bails to / when a profile already exists (3a3e6db).
      const target = from !== '/' ? from : me.role === 'admin' ? '/' : '/app/onboarding';
      navigate(target, { replace: true });
    } catch {
      toast.error("That code didn't work — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="bg-gradient-to-b from-primary/10 to-transparent pb-2 pt-12">
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <CrownMark />
          <h1 className="text-2xl font-bold">TripKing</h1>
          <p className="max-w-xs text-sm text-secondary">One account — post trips, post your vacancy, and run the platform.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 px-6 py-6">
        <section className="w-full max-w-sm rounded-2xl border bg-card p-4 shadow-sm">
          {stage === 'phone' ? (
            <form onSubmit={onRequest} className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span aria-hidden>📱</span> Enter your mobile number
              </div>
              <div className="flex gap-2">
                <select
                  className="rounded-lg border border-input bg-background px-2 text-sm"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  aria-label="Country code"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.code}
                    </option>
                  ))}
                </select>
                <Input
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value)}
                  required
                  aria-label="Mobile number"
                />
              </div>
              <Button type="submit" variant="full" disabled={busy || !phoneValid}>
                {busy ? 'Sending…' : 'Send OTP'}
              </Button>
              <p className="text-xs text-secondary">
                Demo build — any mobile number is accepted and the {OTP_LENGTH}-digit code is always{' '}
                <strong>123456</strong>. (Real SMS verification comes later.)
              </p>
            </form>
          ) : (
            <form onSubmit={onVerify} className="space-y-3">
              <div className="text-sm">
                Enter the {OTP_LENGTH}-digit code sent to <strong>{phoneE164}</strong>
              </div>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={`${OTP_LENGTH}-digit code`}
                value={otp}
                onChange={(e) => setOtp(onlyDigits(e.target.value).slice(0, OTP_LENGTH))}
                required
                autoFocus
                aria-label="OTP code"
              />
              <Button type="submit" variant="full" disabled={busy || otp.length < OTP_LENGTH}>
                {busy ? 'Verifying…' : 'Verify & continue'}
              </Button>
              <button
                type="button"
                className="text-sm text-secondary underline"
                onClick={() => {
                  setStage('phone');
                  setOtp('');
                }}
              >
                Use a different number
              </button>
            </form>
          )}
        </section>
        <div className="w-full max-w-sm">
          <InstallAppCard />
        </div>
        <p className="text-xs text-secondary">Next: a quick setup — your name, whether you drive or post trips, and your city.</p>
      </div>
    </main>
  );
}

export default SignInPage;
