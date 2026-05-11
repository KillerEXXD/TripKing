import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LanguageCode } from '@/types';

const STORAGE_KEY = 'drivermahal:lang';

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
  available: { code: LanguageCode; native: string; english: string }[];
}

const LANGUAGES: { code: LanguageCode; native: string; english: string }[] = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
];

/**
 * Tiny in-memory translation table for the prototype.
 * In production, this would be replaced with i18next + DB-backed loader
 * (cached in IndexedDB, populated via Translation Manager admin page).
 */
const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: {
    'splash.welcome': 'Welcome to Trip King',
    'splash.choose_language': 'Choose your language',
    'splash.continue': 'Continue',
    'home.post_vacancy': 'Post Vacancy',
    'home.find_trip': 'Find a Trip',
    'home.my_applications': 'My Applications',
    'tabs.home': 'Home',
    'tabs.trips': 'Trips',
    'tabs.my_trips': 'My trips',
    'tabs.alerts': 'Alerts',
    'tabs.profile': 'Profile',
  },
  ta: {
    'splash.welcome': 'Trip King-க்கு வரவேற்கிறோம்',
    'splash.choose_language': 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
    'splash.continue': 'தொடரவும்',
    'home.post_vacancy': 'காலியிடம் இடுகையிடவும்',
    'home.find_trip': 'பயணத்தைக் கண்டறிக',
    'home.my_applications': 'எனது விண்ணப்பங்கள்',
    'tabs.home': 'முகப்பு',
    'tabs.trips': 'பயணங்கள்',
    'tabs.my_trips': 'எனது பயணங்கள்',
    'tabs.alerts': 'எச்சரிக்கைகள்',
    'tabs.profile': 'சுயவிவரம்',
  },
  hi: {
    'splash.welcome': 'Trip King में आपका स्वागत है',
    'splash.choose_language': 'अपनी भाषा चुनें',
    'splash.continue': 'जारी रखें',
    'home.post_vacancy': 'खाली पद पोस्ट करें',
    'home.find_trip': 'यात्रा खोजें',
    'home.my_applications': 'मेरे आवेदन',
    'tabs.home': 'होम',
    'tabs.trips': 'यात्राएं',
    'tabs.my_trips': 'मेरी यात्राएं',
    'tabs.alerts': 'अलर्ट',
    'tabs.profile': 'प्रोफ़ाइल',
  },
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY);
    return (saved as LanguageCode) || 'en';
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((code: LanguageCode) => {
    localStorage.setItem(STORAGE_KEY, code);
    setLanguageState(code);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? fallback ?? key;
    },
    [language],
  );

  const value = useMemo(
    () => ({ language, setLanguage, t, available: LANGUAGES }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within <LanguageProvider>');
  return ctx;
}
