import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { InstallAppCard } from '@/components/common/InstallAppCard';
import { toast } from 'sonner';

/** Demo OTP — accepted for any number. */
const DEMO_OTP = '12345';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+65', label: '🇸🇬 +65' },
];

type Step = 'phone' | 'otp' | 'name';

/**
 * Phone-registration flow (replaces the old role picker).
 *
 *   phone (country code + number) → OTP (demo: 12345) → first/last name
 *
 * On success the account is persisted via `useAuthStore` and the user
 * lands on the single home hub (`/home`) with access to every flow —
 * driver, trip manager and admin. If an account already exists on this
 * device we skip straight to `/home`.
 */
export function AuthPage() {
  const navigate = useNavigate();
  const account = useAuthStore((s) => s.account);
  const register = useAuthStore((s) => s.register);

  const [step, setStep] = useState<Step>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  if (account) return <Navigate to="/home" replace />;

  const digits = (s: string) => s.replace(/\D/g, '');
  const phoneDigits = digits(phone);
  const phoneValid = phoneDigits.length >= 7 && phoneDigits.length <= 12;

  const sendOtp = () => {
    if (!phoneValid) return;
    setStep('otp');
    setOtp('');
    setOtpError(false);
    toast.success(`OTP sent to ${countryCode} ${phoneDigits}`, {
      description: `Demo code: ${DEMO_OTP}`,
    });
  };

  const verifyOtp = () => {
    if (otp !== DEMO_OTP) {
      setOtpError(true);
      setOtp('');
      return;
    }
    setStep('name');
  };

  const finish = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    register({
      countryCode,
      phone: phoneDigits,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    });
    toast.success(`Welcome, ${firstName.trim()}!`);
    navigate('/welcome', { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-emerald-50 to-white">
      <img src="/logo-mark.svg" alt="" className="w-16 h-auto mb-3" />
      <h1 className="text-2xl font-bold tracking-tight mb-1">Trip King</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        One account — post trips, post your vacancy, and administer the platform.
      </p>

      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 py-6">
          {step === 'phone' && (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Phone className="size-4 text-emerald-600" /> Enter your mobile number
              </div>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="h-11 rounded-lg border border-input bg-background px-2 text-sm shrink-0"
                  aria-label="Country code"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                />
              </div>
              <Button
                variant="full"
                size="lg"
                className="w-full"
                disabled={!phoneValid}
                onClick={sendOtp}
              >
                Send OTP
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                We'll send a 5-digit code. This is a prototype — the code is
                always <span className="font-mono font-semibold">{DEMO_OTP}</span>.
              </p>
            </>
          )}

          {step === 'otp' && (
            <>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="size-3" /> Change number
              </button>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-emerald-600" /> Enter the 5-digit code
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Sent to {countryCode} {phoneDigits}
              </p>
              <Input
                inputMode="numeric"
                autoFocus
                maxLength={5}
                placeholder="•••••"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, 5));
                  setOtpError(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && otp.length === 5 && verifyOtp()}
                className="text-center text-2xl tracking-[0.5em] font-mono"
              />
              {otpError && (
                <p className="text-xs text-destructive">
                  That code didn't match. The demo code is{' '}
                  <span className="font-mono font-semibold">{DEMO_OTP}</span>.
                </p>
              )}
              <Button
                variant="full"
                size="lg"
                className="w-full"
                disabled={otp.length !== 5}
                onClick={verifyOtp}
              >
                Verify
              </Button>
            </>
          )}

          {step === 'name' && (
            <>
              <div className="text-sm font-semibold">Almost there — your name</div>
              <p className="text-xs text-muted-foreground -mt-1">
                This is shown on the trips you post and to drivers you assign.
              </p>
              <Input
                autoFocus
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && finish()}
              />
              <Button
                variant="full"
                size="lg"
                className="w-full"
                disabled={!firstName.trim() || !lastName.trim()}
                onClick={finish}
              >
                Create account & continue
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="w-full max-w-sm mt-4">
        <InstallAppCard />
      </div>

      <button
        type="button"
        onClick={() => navigate('/passenger')}
        className="mt-5 text-xs text-emerald-700 hover:underline font-semibold"
      >
        Are you a passenger? Open Passenger Portal →
      </button>
    </div>
  );
}
