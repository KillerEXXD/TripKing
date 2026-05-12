import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Card, Input } from '@/components/ui';
import { OTP_LENGTH } from '@/lib/constants';

function fromOf(state: unknown): string {
  return (state as { from?: string } | null)?.from ?? '/';
}

/** Phone-OTP sign in. The full onboarding/KYC flow (per the prototype) lands later. */
export function SignInPage() {
  const { isAuthenticated, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) return <Navigate to={fromOf(location.state)} replace />;

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestOtp(phone.trim());
      setStage('otp');
      toast.success('OTP sent');
    } catch {
      toast.error("Couldn't send the OTP — check the number and try again");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await verifyOtp(phone.trim(), otp.trim());
      navigate(fromOf(location.state), { replace: true });
    } catch {
      toast.error("That code didn't work — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-bold">Sign in to TripKing</h1>
        {stage === 'phone' ? (
          <form onSubmit={onRequest} className="space-y-3">
            <Input
              inputMode="tel"
              autoComplete="tel"
              placeholder="Phone (e.g. +91 99999 99999)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Button type="submit" variant="full" disabled={busy || phone.trim().length < 6}>
              {busy ? 'Sending…' : 'Send OTP'}
            </Button>
          </form>
        ) : (
          <form onSubmit={onVerify} className="space-y-3">
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={`${OTP_LENGTH}-digit code`}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
              required
            />
            <Button type="submit" variant="full" disabled={busy || otp.trim().length < OTP_LENGTH}>
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
      </Card>
    </main>
  );
}

export default SignInPage;
