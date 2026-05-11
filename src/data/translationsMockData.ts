/**
 * Sample translation keys + values for the Translation Manager edit screen.
 *
 * In production these come from the `translation_keys` + `translations`
 * tables. The prototype keeps a small but representative slice (12 keys
 * across 4 namespaces) to demonstrate the editor UX without flooding
 * the page with fixtures.
 */

export type LanguageCode = 'en' | 'ta' | 'hi';

export interface TranslationKey {
  id: string;
  key: string;
  namespace: 'driver_app' | 'manager_app' | 'admin_app' | 'email' | 'sms';
  description: string;
  variables?: string[];
  /** English source text (always 100% present). */
  defaultText: string;
}

export const mockTranslationKeys: TranslationKey[] = [
  {
    id: 'k-1',
    key: 'screen.home.post_vacancy_cta',
    namespace: 'driver_app',
    description: 'Big primary button on driver home',
    defaultText: 'Post Vacancy',
  },
  {
    id: 'k-2',
    key: 'screen.home.welcome_back',
    namespace: 'driver_app',
    description: 'Header greeting',
    defaultText: 'Welcome back',
  },
  {
    id: 'k-3',
    key: 'screen.trip.apply_cta',
    namespace: 'driver_app',
    description: 'CTA on trip detail page',
    defaultText: 'Apply for this trip',
  },
  {
    id: 'k-4',
    key: 'screen.trip.applied_status',
    namespace: 'driver_app',
    description: 'After driver applies',
    defaultText: "You've applied — waiting for the trip manager",
  },
  {
    id: 'k-5',
    key: 'screen.vacancy.your_post',
    namespace: 'driver_app',
    description: 'Pill on the user\'s own card in the vacancies feed',
    defaultText: 'Your post',
  },
  {
    id: 'k-6',
    key: 'manager.find_driver',
    namespace: 'manager_app',
    description: 'Heading on the find-driver screen',
    defaultText: 'Find Driver',
  },
  {
    id: 'k-7',
    key: 'manager.applicants_count',
    namespace: 'manager_app',
    description: 'Plural-aware applicant counter',
    variables: ['count'],
    defaultText: '{{count}} applicants',
  },
  {
    id: 'k-8',
    key: 'manager.cancel_trip_cta',
    namespace: 'manager_app',
    description: 'Cancel posted trip button',
    defaultText: 'Cancel posted trip',
  },
  {
    id: 'k-9',
    key: 'kyc.video_call_scheduled',
    namespace: 'driver_app',
    description: 'Hint shown after subject schedules video call',
    variables: ['time'],
    defaultText: 'Video call scheduled for {{time}}',
  },
  {
    id: 'k-10',
    key: 'sms.trip_assigned',
    namespace: 'sms',
    description: 'SMS sent to driver when assigned a trip',
    variables: ['from', 'to', 'time'],
    defaultText: 'You have been chosen for {{from}} → {{to}} pickup at {{time}}.',
  },
  {
    id: 'k-11',
    key: 'sms.kyc_approved',
    namespace: 'sms',
    description: 'KYC approval SMS',
    defaultText: 'Welcome to Trip King! Your KYC is approved. Open the app to start.',
  },
  {
    id: 'k-12',
    key: 'email.weekly_summary.subject',
    namespace: 'email',
    description: 'Weekly earnings summary email subject',
    variables: ['amount'],
    defaultText: 'Your Trip King earnings this week: ₹{{amount}}',
  },
];

/**
 * Initial seeded translations for the demo. English is always complete
 * (auto-mirrors defaultText). Tamil ~97% (1 missing), Hindi ~87% (2 missing,
 * 1 needs_review). Numbers loosely reflect the percentages shown on the
 * Translation Manager card.
 */
export const seedTranslations: Record<
  LanguageCode,
  Record<string, { value: string; status?: 'draft' | 'published' | 'needs_review' }>
> = {
  en: Object.fromEntries(
    mockTranslationKeys.map((k) => [k.id, { value: k.defaultText, status: 'published' }]),
  ),
  ta: {
    'k-1': { value: 'காலியிடம் இடுகை', status: 'published' },
    'k-2': { value: 'வரவேற்கிறோம்', status: 'published' },
    'k-3': { value: 'இந்த பயணத்திற்கு விண்ணப்பிக்கவும்', status: 'published' },
    'k-4': { value: 'நீங்கள் விண்ணப்பித்துள்ளீர்கள் — பயண மேலாளரின் முடிவுக்காக காத்திருக்கிறோம்', status: 'published' },
    'k-5': { value: 'உங்கள் இடுகை', status: 'published' },
    'k-6': { value: 'ஓட்டுநரைக் கண்டறிக', status: 'published' },
    'k-7': { value: '{{count}} விண்ணப்பதாரர்கள்', status: 'published' },
    'k-8': { value: 'பதிவுசெய்த பயணத்தை ரத்துசெய்', status: 'published' },
    'k-9': { value: 'வீடியோ அழைப்பு {{time}}-க்கு திட்டமிடப்பட்டுள்ளது', status: 'needs_review' },
    'k-10': { value: '{{from}} → {{to}} பயணத்திற்கு நீங்கள் தேர்ந்தெடுக்கப்பட்டுள்ளீர்கள், {{time}} மணிக்கு பிக்-அப்.', status: 'published' },
    'k-11': { value: 'டிரைவர்மஹால்-க்கு வரவேற்கிறோம்! உங்கள் KYC அங்கீகரிக்கப்பட்டது. தொடங்க பயன்பாட்டைத் திறக்கவும்.', status: 'published' },
    // k-12 missing
  },
  hi: {
    'k-1': { value: 'खाली पद पोस्ट करें', status: 'published' },
    'k-2': { value: 'आपका स्वागत है', status: 'published' },
    'k-3': { value: 'इस यात्रा के लिए आवेदन करें', status: 'published' },
    'k-4': { value: 'आपने आवेदन कर दिया — ट्रिप मैनेजर के निर्णय की प्रतीक्षा है', status: 'published' },
    'k-5': { value: 'आपकी पोस्ट', status: 'published' },
    'k-6': { value: 'ड्राइवर खोजें', status: 'published' },
    'k-7': { value: '{{count}} आवेदक', status: 'needs_review' },
    'k-8': { value: 'पोस्ट की गई यात्रा रद्द करें', status: 'published' },
    // k-9 missing
    'k-10': { value: 'आपको {{from}} → {{to}} यात्रा के लिए चुना गया है, पिकअप {{time}} पर।', status: 'published' },
    'k-11': { value: 'Trip King में आपका स्वागत है! आपका KYC स्वीकृत है। शुरू करने के लिए ऐप खोलें।', status: 'published' },
    // k-12 missing
  },
};

export const SUPPORTED_LANGUAGES: { code: LanguageCode; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
];
