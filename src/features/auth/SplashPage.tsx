import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LanguageCode } from '@/types';

export function SplashPage() {
  const { language, setLanguage, t, available } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-emerald-50 to-white">
      <img src="/logo-mark.svg" alt="" className="w-20 h-auto mb-4" />
      <h1 className="text-3xl font-bold tracking-tight mb-2">Trip King</h1>
      <p className="text-muted-foreground mb-12 text-center">{t('splash.welcome')}</p>

      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">
          {t('splash.choose_language')}
        </p>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {available.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code as LanguageCode)}
              className={cn(
                'p-4 rounded-xl border text-center transition-all',
                language === l.code
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-border hover:border-primary/40',
              )}
            >
              <div className="text-lg font-semibold">{l.native}</div>
              <div className="text-xs text-muted-foreground">{l.english}</div>
            </button>
          ))}
        </div>

        <Button size="lg" variant="full" onClick={() => navigate('/auth')}>
          {t('splash.continue')} →
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-8 text-center max-w-xs">
        Drivers · Trip Managers · Admins · India's marketplace for inter-city cab
        trips.
      </p>

      <button
        type="button"
        onClick={() => navigate('/passenger')}
        className="mt-3 text-xs text-emerald-700 hover:underline font-semibold"
      >
        Are you a passenger? Open Passenger Portal →
      </button>
    </div>
  );
}
