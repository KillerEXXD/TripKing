/**
 * Trip King — promo website copy (EN / Tamil / Hindi).
 *
 * Page-local marketing copy — intentionally NOT wired into the app's i18n /
 * translation DB (that's for product UI strings, not landing-page prose).
 * Mirrors the COPY-object pattern from src/pages/ForAgentsPage.tsx.
 *
 * Positioning matches /for-agents: Trip King is a WhatsApp-powered trip-
 * assignment & driver-management system, not a passenger taxi app. No
 * pricing/cost copy here by design — features and pain points only. Any
 * "rate/km − commission − GST + bata" mentions describe the in-app *trip
 * payout breakdown* feature, not what the platform charges.
 */

export type WebsiteLang = 'en' | 'ta' | 'hi';

export const LANGS: { code: WebsiteLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'hi', label: 'हिन्दी' },
];

export interface Step {
  n: string;
  /** Icon key — mapped to a lucide icon in the component. */
  icon: string;
  h: string;
  p: string;
  /** Screenshot file stem under /public/screenshots/<shot>.png (optional). */
  shot: string;
  shotLabel: string;
}

export interface PainItem {
  icon: string;
  text: string;
}

export interface Feature {
  icon: string;
  h: string;
  p: string;
  /** true → tile spans 2 columns on wide screens (bento layout) */
  wide?: boolean;
  /** true → emerald-accented lead tile */
  lead?: boolean;
}

export interface WebsiteCopy {
  meta: { title: string };
  nav: {
    howItWorks: string;
    forDrivers: string;
    forAgents: string;
    openApp: string;
  };
  hero: {
    kicker: string;
    h1: string;
    sub: string;
    ctaDriver: string;
    ctaAgent: string;
    ctaOpen: string;
    microcopy: string;
  };
  trust: { items: { icon: string; text: string }[] };
  problem: {
    title: string;
    driver: { title: string; items: PainItem[] };
    agent: { title: string; items: PainItem[] };
  };
  how: {
    title: string;
    sub: string;
    tabs: { driver: string; agent: string };
    driverSteps: Step[];
    agentSteps: Step[];
  };
  features: { title: string; sub: string; items: Feature[] };
  why: { title: string; rows: { a: string; b: string }[] };
  admin: { title: string; body: string; points: string[] };
  finalCta: {
    h: string;
    sub: string;
    ctaOpen: string;
    ctaWhatsapp: string;
    footnote: string;
  };
  footer: {
    tagline: string;
    passenger: string;
    langNote: string;
    rights: string;
  };
}

const en: WebsiteCopy = {
  meta: { title: 'Trip King — India’s marketplace for inter-city cab trips' },
  nav: {
    howItWorks: 'How it works',
    forDrivers: 'For drivers',
    forAgents: 'For agents',
    openApp: 'Open app',
  },
  hero: {
    kicker: 'Drivers · Trip managers · Verified · Tamil Nadu',
    h1: 'Inter-city cab trips, finally organised.',
    sub: 'Agents post a trip and share it to their WhatsApp groups — verified drivers apply, you pick the best one and track it live. Drivers find real intercity work without spamming groups. No more chasing, no more chaos.',
    ctaDriver: 'I’m a driver',
    ctaAgent: 'I’m a travel agent',
    ctaOpen: 'Open Trip King',
    microcopy: 'KYC-verified · Live tracking · Works in 3 languages',
  },
  trust: {
    items: [
      { icon: 'send', text: 'Share trips to WhatsApp' },
      { icon: 'shield', text: 'KYC-verified drivers' },
      { icon: 'navigation', text: 'Live trip tracking' },
      { icon: 'languages', text: 'English · தமிழ் · हिन्दी' },
    ],
  },
  problem: {
    title: 'Sound familiar?',
    driver: {
      title: 'If you’re a driver',
      items: [
        { icon: 'message', text: 'You spam ten WhatsApp groups looking for a trip — and still drive empty half the time.' },
        { icon: 'wallet', text: 'You finish the trip, then argue about the bata and the commission.' },
        { icon: 'badge', text: 'You did 200 clean trips — but a new agent has no way to know that.' },
        { icon: 'ghost', text: 'A trip gets “confirmed”, then cancelled an hour before pickup. Your day is gone.' },
      ],
    },
    agent: {
      title: 'If you’re a travel agent',
      items: [
        { icon: 'phone', text: 'You post one trip in ten WhatsApp groups and get 50 unstructured replies and calls.' },
        { icon: 'ghost', text: 'A driver confirms… then ghosts. You lose the customer and look bad.' },
        { icon: 'shield-question', text: 'No idea if a driver is reliable until the customer complains.' },
        { icon: 'map-pin', text: '“Where’s my car?” the customer asks — and you have to call the driver to find out.' },
      ],
    },
  },
  how: {
    title: 'How Trip King works',
    sub: 'Same platform, two sides. Pick yours.',
    tabs: { driver: 'For drivers', agent: 'For travel agents' },
    driverSteps: [
      { n: '1', icon: 'shield-check', h: 'Sign up & get verified', p: 'Phone OTP, then a quick KYC — Aadhaar, Voter ID, selfie, a short video call. Once an admin approves you, you’re in.', shot: 'driver-kyc', shotLabel: 'KYC verification' },
      { n: '2', icon: 'map-pinned', h: 'Post your availability', p: 'Your city, the cities you’ll go to, the dates you’re free. Agents and matching alerts see it instantly.', shot: 'post-vacancy', shotLabel: 'Post availability' },
      { n: '3', icon: 'hand-coins', h: 'Apply to trips — see the real payout', p: 'Browse trips near you — or open a trip link an agent shared in your WhatsApp group. Every trip shows the breakdown up front: rate per km, minus commission, minus GST, plus your bata.', shot: 'trip-detail', shotLabel: 'Trip payout breakdown' },
      { n: '4', icon: 'navigation', h: 'Drive — start OTP, live tracking, get rated', p: 'Passenger enters the start OTP, you capture the odometer photo, the trip goes live. End OTP closes it. The passenger rates you — and that rating travels with you.', shot: 'assigned-trip', shotLabel: 'Live trip + OTP' },
    ],
    agentSteps: [
      { n: '1', icon: 'file-plus', h: 'Post a trip in 30 seconds', p: 'From, to, when, car type, seats, AC. Add the rate per km, your commission %, GST and bata. Done.', shot: 'post-trip', shotLabel: 'Post a trip' },
      { n: '2', icon: 'send', h: 'Share it to WhatsApp', p: 'Trip King gives you a clean trip link. Share it to your driver groups, union groups or private contacts — you choose where. You keep using WhatsApp; the chaos goes away.', shot: 'share-trip', shotLabel: 'Share the trip link' },
      { n: '3', icon: 'star', h: 'Verified drivers apply', p: 'Only registered drivers can apply. See each applicant’s rating, trips completed, vehicle, top tags and KYC status — side by side, in one list.', shot: 'applicants', shotLabel: 'Driver applicants + ratings' },
      { n: '4', icon: 'check-circle', h: 'Pick the one you trust', p: 'One tap assigns the driver. Everyone else is auto-rejected and notified — and the trip closes, so drivers stop calling. The passenger gets a clean confirmation card.', shot: 'assign-driver', shotLabel: 'Assign driver' },
      { n: '5', icon: 'navigation', h: 'Track it live — and keep the record', p: 'Where the car is, time to reach, on-time / delayed. Answer the customer instantly. Every trip is kept with route, fare, bata, driver and timestamps. The passenger rates the driver. No more disputes.', shot: 'tracking', shotLabel: 'Live tracking + ETA' },
    ],
  },
  features: {
    title: 'Built for how cab trips actually work',
    sub: 'The details that decide whether a trip goes well — handled.',
    items: [
      { icon: 'send', h: 'Share trips to WhatsApp', p: 'Create a trip once, get a clean trip link, and share it to any WhatsApp driver group. Drivers click and apply through Trip King — applications land in one organised dashboard.', wide: true, lead: true },
      { icon: 'star', h: 'Ratings that travel', p: 'A driver’s rating, completed trips and top tags follow them from one agent to the next. Good work compounds.' },
      { icon: 'shield-check', h: 'KYC verification', p: 'Aadhaar, Voter ID, selfie and a video call — checked by an admin before anyone can transact.' },
      { icon: 'navigation', h: 'Live tracking & ETA', p: 'The agent (and the passenger) can see where the car is and when it’ll arrive — on-time or delayed.' },
      { icon: 'key-round', h: 'Trip-start & end OTP', p: 'The passenger’s OTP starts the trip; another ends it. Odometer photos at both ends. The distance is real.' },
      { icon: 'hand-coins', h: 'Transparent payout breakdown', p: 'Rate/km − commission − GST + bata, shown to the driver before they apply. No “we’ll settle later”.', wide: true },
      { icon: 'bell-ring', h: 'Job alerts & city matching', p: 'Drivers set alerts by route. New matching trips ping them — including one-way and return trips in other cities.' },
      { icon: 'ticket', h: 'Passenger portal', p: 'No app needed for the passenger — they look up the trip with a 6-digit code and see live status.' },
      { icon: 'languages', h: 'English · தமிழ் · हिन्दी', p: 'The whole app — and this site — work in all three. Switch any time.' },
    ],
  },
  why: {
    title: 'Why Trip King',
    rows: [
      { a: 'vs WhatsApp groups', b: 'Verified drivers come to you, already KYC-checked, in one applicant list. Every trip is recorded — route, fare, bata, timestamps. Live tracking. The trip closes once assigned. No scrolling, no “who took it?”.' },
      { a: 'Not another taxi app', b: 'Trip King isn’t for passengers booking rides. Agents post confirmed trips; verified drivers apply. You control the assignment — and what amount the driver sees.' },
      { a: 'vs Savaari / Ola Outstation', b: 'You keep your customer. Trip King is your tool — not a middleman that takes your booking and your margin.' },
    ],
  },
  admin: {
    title: 'Why the applicants are worth trusting',
    body: 'Every driver and every trip manager is reviewed by an admin before they can post or apply — that’s the whole point of the verification layer.',
    points: [
      'Aadhaar + Voter ID + selfie + a live video call, checked by a human.',
      'Vehicle eligibility — car type, age and document expiry — tracked.',
      'Reviews are moderated; abusive ones don’t stick.',
    ],
  },
  finalCta: {
    h: 'Get started — today.',
    sub: 'Agents: post a trip and share it to your WhatsApp group. Drivers: post your availability. It takes a minute.',
    ctaOpen: 'Open Trip King',
    ctaWhatsapp: 'WhatsApp us for access',
    footnote: 'Built for Tamil Nadu travel agents & drivers.',
  },
  footer: {
    tagline: 'India’s marketplace for inter-city cab trips.',
    passenger: 'Are you a passenger? Open the Passenger Portal →',
    langNote: 'Available in English, தமிழ் and हिन्दी.',
    rights: 'All rights reserved.',
  },
};

const ta: WebsiteCopy = {
  meta: { title: 'Trip King — இடைநகர கேப் டிரிப்களுக்கான இந்தியாவின் சந்தை' },
  nav: {
    howItWorks: 'எப்படி வேலை செய்கிறது',
    forDrivers: 'டிரைவர்களுக்கு',
    forAgents: 'ஏஜெண்ட்களுக்கு',
    openApp: 'ஆப் திறக்க',
  },
  hero: {
    kicker: 'டிரைவர்கள் · டிரிப் மேனேஜர்கள் · சரிபார்க்கப்பட்டது · தமிழ்நாடு',
    h1: 'இடைநகர கேப் டிரிப்கள் — இறுதியாக ஒழுங்காக.',
    sub: 'ஏஜெண்ட்கள் ஒரு டிரிப் போட்டு வாட்ஸ்அப் குழுக்களில் பகிருகிறார்கள் — சரிபார்க்கப்பட்ட டிரைவர்கள் விண்ணப்பிக்கிறார்கள், சிறந்தவரைத் தேர்வு செய்து நேரடியாகக் கண்காணியுங்கள். டிரைவர்கள் குழுக்களில் ஸ்பேம் செய்யாமல் உண்மையான இடைநகர வேலை பெறுகிறார்கள். துரத்துவதும் இல்லை, குழப்பமும் இல்லை.',
    ctaDriver: 'நான் ஒரு டிரைவர்',
    ctaAgent: 'நான் ஒரு டிராவல் ஏஜெண்ட்',
    ctaOpen: 'Trip King திறக்க',
    microcopy: 'KYC சரிபார்ப்பு · நேரடி கண்காணிப்பு · 3 மொழிகளில்',
  },
  trust: {
    items: [
      { icon: 'send', text: 'வாட்ஸ்அப்பில் டிரிப் பகிர்வு' },
      { icon: 'shield', text: 'சரிபார்க்கப்பட்ட டிரைவர்கள்' },
      { icon: 'navigation', text: 'நேரடி டிரிப் கண்காணிப்பு' },
      { icon: 'languages', text: 'English · தமிழ் · हिन्दी' },
    ],
  },
  problem: {
    title: 'இது உங்களுக்குப் பரிச்சயமா?',
    driver: {
      title: 'நீங்கள் ஒரு டிரைவராக இருந்தால்',
      items: [
        { icon: 'message', text: 'டிரிப் தேடி பத்து வாட்ஸ்அப் குழுக்களில் மெசேஜ் போடுகிறீர்கள் — இன்னும் பாதி நேரம் காலி காரோடு ஓட்டுகிறீர்கள்.' },
        { icon: 'wallet', text: 'டிரிப் முடிந்த பிறகு பத்தா, கமிஷன் பற்றி வாக்குவாதம்.' },
        { icon: 'badge', text: '200 நல்ல டிரிப்கள் செய்தீர்கள் — ஆனால் புதிய ஏஜெண்டுக்கு அது தெரியாது.' },
        { icon: 'ghost', text: 'டிரிப் “உறுதி” ஆகி, பிக்கப்புக்கு ஒரு மணி நேரம் முன் ரத்து. உங்கள் நாள் வீண்.' },
      ],
    },
    agent: {
      title: 'நீங்கள் ஒரு டிராவல் ஏஜெண்டாக இருந்தால்',
      items: [
        { icon: 'phone', text: 'ஒரு டிரிப்பை பத்து வாட்ஸ்அப் குழுக்களில் போட்டால் 50 கட்டமைப்பற்ற பதில்களும் கால்களும் வருகின்றன.' },
        { icon: 'ghost', text: 'டிரைவர் ஒத்துக்கொண்டு… பிறகு காணாமல் போகிறார். வாடிக்கையாளரை இழக்கிறீர்கள், மானம் போகிறது.' },
        { icon: 'shield-question', text: 'வாடிக்கையாளர் புகார் சொல்லும் வரை டிரைவர் நம்பகமானவரா என்று தெரியாது.' },
        { icon: 'map-pin', text: '“என் கார் எங்கே?” என வாடிக்கையாளர் கேட்கிறார் — பதில் சொல்ல டிரைவரை அழைக்க வேண்டியிருக்கிறது.' },
      ],
    },
  },
  how: {
    title: 'Trip King எப்படி வேலை செய்கிறது',
    sub: 'ஒரே தளம், இரண்டு பக்கங்கள். உங்களுடையதைத் தேர்வு செய்யுங்கள்.',
    tabs: { driver: 'டிரைவர்களுக்கு', agent: 'டிராவல் ஏஜெண்ட்களுக்கு' },
    driverSteps: [
      { n: '1', icon: 'shield-check', h: 'பதிவு செய்து சரிபார்க்கப்படுங்கள்', p: 'போன் OTP, பிறகு விரைவான KYC — ஆதார், வாக்காளர் அடையாளம், செல்ஃபி, ஒரு குறுகிய வீடியோ அழைப்பு. அட்மின் ஒப்புதல் அளித்தவுடன் தயார்.', shot: 'driver-kyc', shotLabel: 'KYC சரிபார்ப்பு' },
      { n: '2', icon: 'map-pinned', h: 'உங்கள் கிடைப்பைப் பதிவு செய்யுங்கள்', p: 'உங்கள் ஊர், நீங்கள் செல்லும் ஊர்கள், காலியாக இருக்கும் தேதிகள். ஏஜெண்ட்களும் பொருந்தும் அலெர்ட்களும் உடனே பார்க்கிறார்கள்.', shot: 'post-vacancy', shotLabel: 'கிடைப்பைப் பதிவு செய்யுங்கள்' },
      { n: '3', icon: 'hand-coins', h: 'டிரிப்புக்கு விண்ணப்பியுங்கள் — உண்மையான பேஅவுட் பாருங்கள்', p: 'அருகிலுள்ள டிரிப்களைப் பாருங்கள் — அல்லது ஒரு ஏஜெண்ட் உங்கள் வாட்ஸ்அப் குழுவில் பகிர்ந்த டிரிப் லிங்கைத் திறங்கள். ஒவ்வொரு டிரிப்பும் முன்கூட்டியே விவரம் காட்டுகிறது: கி.மீ. கட்டணம், கமிஷன் கழித்து, GST கழித்து, உங்கள் பத்தா கூட்டி.', shot: 'trip-detail', shotLabel: 'டிரிப் பேஅவுட் விவரம்' },
      { n: '4', icon: 'navigation', h: 'ஓட்டுங்கள் — ஸ்டார்ட் OTP, நேரடி கண்காணிப்பு, ரேட்டிங்', p: 'பயணி ஸ்டார்ட் OTP-ஐ உள்ளிடுகிறார், நீங்கள் ஓடோமீட்டர் புகைப்படம் எடுக்கிறீர்கள், டிரிப் தொடங்குகிறது. எண்ட் OTP முடிக்கிறது. பயணி உங்களை மதிப்பிடுகிறார் — அந்த ரேட்டிங் உங்களுடன் வருகிறது.', shot: 'assigned-trip', shotLabel: 'நேரடி டிரிப் + OTP' },
    ],
    agentSteps: [
      { n: '1', icon: 'file-plus', h: '30 விநாடியில் டிரிப் போடுங்கள்', p: 'எங்கிருந்து, எங்கே, எப்போது, கார் வகை, இருக்கைகள், AC. கி.மீ. கட்டணம், உங்கள் கமிஷன் %, GST, பத்தா சேர்க்கவும். முடிந்தது.', shot: 'post-trip', shotLabel: 'டிரிப் போடுங்கள்' },
      { n: '2', icon: 'send', h: 'வாட்ஸ்அப்பில் பகிருங்கள்', p: 'Trip King ஒரு சுத்தமான டிரிப் லிங்க் தருகிறது. டிரைவர் குழுக்கள், யூனியன் குழுக்கள் அல்லது தனிப்பட்ட தொடர்புகளில் பகிருங்கள் — நீங்கள் தேர்வு செய்கிறீர்கள். வாட்ஸ்அப்பைத் தொடர்ந்து பயன்படுத்துங்கள்; குழப்பம் போகிறது.', shot: 'share-trip', shotLabel: 'டிரிப் லிங்கைப் பகிருங்கள்' },
      { n: '3', icon: 'star', h: 'சரிபார்க்கப்பட்ட டிரைவர்கள் விண்ணப்பிக்கிறார்கள்', p: 'பதிவு செய்த டிரைவர்கள் மட்டுமே விண்ணப்பிக்க முடியும். ஒவ்வொரு விண்ணப்பதாரரின் ரேட்டிங், முடித்த டிரிப்கள், வாகனம், டாப் டேக்ஸ், KYC நிலை — ஒரே பட்டியலில் அருகருகே.', shot: 'applicants', shotLabel: 'டிரைவர் விண்ணப்பதாரர்கள் + ரேட்டிங்' },
      { n: '4', icon: 'check-circle', h: 'நீங்கள் நம்புபவரைத் தேர்வு செய்யுங்கள்', p: 'ஒரு டேப்பில் டிரைவர் ஒதுக்கப்படுகிறார். மற்றவர்கள் தானாக நிராகரிக்கப்பட்டு அறிவிக்கப்படுகிறார்கள் — டிரிப் மூடுகிறது, டிரைவர்கள் கால் செய்வதை நிறுத்துகிறார்கள். பயணிக்கு சுத்தமான கன்ஃபர்மேஷன் கார்டு.', shot: 'assign-driver', shotLabel: 'டிரைவரை ஒதுக்குங்கள்' },
      { n: '5', icon: 'navigation', h: 'நேரடியாகக் கண்காணியுங்கள் — பதிவும் வைத்திருங்கள்', p: 'கார் எங்கே, அடைய எவ்வளவு நேரம், சரியான நேரத்திலா / தாமதமா. வாடிக்கையாளருக்கு உடனே பதில். ஒவ்வொரு டிரிப்பும் வழி, கட்டணம், பத்தா, டிரைவர், நேரங்களுடன் பதிவாகிறது. பயணி டிரைவரை மதிப்பிடுகிறார். இனி தகராறு இல்லை.', shot: 'tracking', shotLabel: 'நேரடி கண்காணிப்பு + ETA' },
    ],
  },
  features: {
    title: 'கேப் டிரிப்கள் உண்மையில் எப்படி வேலை செய்கின்றனவோ அதற்காகக் கட்டப்பட்டது',
    sub: 'டிரிப் நன்றாக நடக்குமா இல்லையா என்பதைத் தீர்மானிக்கும் விவரங்கள் — கையாளப்பட்டன.',
    items: [
      { icon: 'send', h: 'வாட்ஸ்அப்பில் டிரிப் பகிர்வு', p: 'ஒரு முறை டிரிப் உருவாக்குங்கள், ஒரு சுத்தமான டிரிப் லிங்க் பெறுங்கள், எந்த வாட்ஸ்அப் குழுவிலும் பகிருங்கள். டிரைவர்கள் கிளிக் செய்து Trip King வழியாக விண்ணப்பிக்கிறார்கள் — விண்ணப்பங்கள் ஒரே ஒழுங்கான டாஷ்போர்டுக்கு வருகின்றன.', wide: true, lead: true },
      { icon: 'star', h: 'உங்களுடன் வரும் ரேட்டிங்', p: 'டிரைவரின் ரேட்டிங், முடித்த டிரிப்கள், டாப் டேக்ஸ் ஒரு ஏஜெண்டிலிருந்து அடுத்தவருக்குப் பின்தொடர்கின்றன. நல்ல வேலை சேர்கிறது.' },
      { icon: 'shield-check', h: 'KYC சரிபார்ப்பு', p: 'ஆதார், வாக்காளர் அடையாளம், செல்ஃபி, வீடியோ அழைப்பு — யாரும் பரிவர்த்தனை செய்வதற்கு முன் அட்மின் சரிபார்க்கிறார்.' },
      { icon: 'navigation', h: 'நேரடி கண்காணிப்பு & ETA', p: 'ஏஜெண்ட் (மற்றும் பயணி) கார் எங்கே, எப்போது வரும் என்று பார்க்கலாம் — சரியான நேரத்திலா தாமதமா.' },
      { icon: 'key-round', h: 'டிரிப்-ஸ்டார்ட் & எண்ட் OTP', p: 'பயணியின் OTP டிரிப்பைத் தொடங்குகிறது; இன்னொன்று முடிக்கிறது. இரு பக்கமும் ஓடோமீட்டர் புகைப்படங்கள். தூரம் உண்மையானது.' },
      { icon: 'hand-coins', h: 'வெளிப்படையான பேஅவுட் விவரம்', p: 'கி.மீ./கட்டணம் − கமிஷன் − GST + பத்தா, டிரைவர் விண்ணப்பிப்பதற்கு முன் காட்டப்படுகிறது. “பிறகு செட்டில் செய்வோம்” இல்லை.', wide: true },
      { icon: 'bell-ring', h: 'ஜாப் அலெர்ட்கள் & ஊர் பொருத்தம்', p: 'டிரைவர்கள் வழியின்படி அலெர்ட்களை அமைக்கிறார்கள். பொருந்தும் புதிய டிரிப்கள் அவர்களுக்கு ஒலிக்கின்றன — மற்ற ஊர்களில் ஒன்-வே மற்றும் திரும்பும் டிரிப்கள் உட்பட.' },
      { icon: 'ticket', h: 'பயணி போர்ட்டல்', p: 'பயணிக்கு ஆப் தேவையில்லை — 6-இலக்க குறியீட்டால் டிரிப்பைப் பார்த்து நேரடி நிலையைப் பார்க்கிறார்.' },
      { icon: 'languages', h: 'English · தமிழ் · हिन्दी', p: 'முழு ஆப்பும் — இந்த தளமும் — மூன்றிலும் வேலை செய்கின்றன. எப்போது வேண்டுமானாலும் மாற்றலாம்.' },
    ],
  },
  why: {
    title: 'ஏன் Trip King',
    rows: [
      { a: 'வாட்ஸ்அப் குழுக்களை விட', b: 'சரிபார்க்கப்பட்ட டிரைவர்கள் உங்களை அணுகுகிறார்கள், ஏற்கனவே KYC சரிபார்க்கப்பட்டவர்கள், ஒரே பட்டியலில். ஒவ்வொரு டிரிப்பும் பதிவாகிறது — வழி, கட்டணம், பத்தா, நேரம். நேரடி கண்காணிப்பு. ஒதுக்கியதும் டிரிப் மூடுகிறது. ஸ்க்ரோல் இல்லை, “யார் எடுத்தது?” இல்லை.' },
      { a: 'இது இன்னொரு டாக்ஸி ஆப் அல்ல', b: 'Trip King பயணிகள் ரைடு புக் செய்வதற்கு அல்ல. ஏஜெண்ட்கள் உறுதியான டிரிப்களை போடுகிறார்கள்; சரிபார்க்கப்பட்ட டிரைவர்கள் விண்ணப்பிக்கிறார்கள். ஒதுக்கீட்டையும் — டிரைவர் பார்க்கும் தொகையையும் — நீங்கள் கட்டுப்படுத்துகிறீர்கள்.' },
      { a: 'Savaari / Ola Outstation-ஐ விட', b: 'உங்கள் வாடிக்கையாளர் உங்களிடமே. Trip King உங்கள் கருவி — உங்கள் புக்கிங்கையும் மார்ஜினையும் எடுக்கும் இடைத்தரகர் அல்ல.' },
    ],
  },
  admin: {
    title: 'விண்ணப்பதாரர்களை ஏன் நம்பலாம்',
    body: 'ஒவ்வொரு டிரைவரும் ஒவ்வொரு டிரிப் மேனேஜரும் போடுவதற்கு அல்லது விண்ணப்பிப்பதற்கு முன் அட்மின் சரிபார்க்கிறார் — அதுதான் சரிபார்ப்பு அடுக்கின் நோக்கம்.',
    points: [
      'ஆதார் + வாக்காளர் அடையாளம் + செல்ஃபி + நேரடி வீடியோ அழைப்பு, ஒரு மனிதரால் சரிபார்க்கப்படுகிறது.',
      'வாகன தகுதி — கார் வகை, வயது, ஆவண காலாவதி — கண்காணிக்கப்படுகிறது.',
      'மதிப்பீடுகள் மிதமாக்கப்படுகின்றன; தவறானவை நிற்காது.',
    ],
  },
  finalCta: {
    h: 'இன்றே தொடங்குங்கள்.',
    sub: 'ஏஜெண்ட்கள்: ஒரு டிரிப் போட்டு உங்கள் வாட்ஸ்அப் குழுவில் பகிருங்கள். டிரைவர்கள்: உங்கள் கிடைப்பைப் போடுங்கள். ஒரு நிமிடம்தான்.',
    ctaOpen: 'Trip King திறக்க',
    ctaWhatsapp: 'அணுகலுக்கு வாட்ஸ்அப் செய்யுங்கள்',
    footnote: 'தமிழ்நாடு டிராவல் ஏஜெண்ட்கள் & டிரைவர்களுக்காக உருவாக்கப்பட்டது.',
  },
  footer: {
    tagline: 'இடைநகர கேப் டிரிப்களுக்கான இந்தியாவின் சந்தை.',
    passenger: 'நீங்கள் ஒரு பயணியா? பயணி போர்ட்டலைத் திறக்கவும் →',
    langNote: 'English, தமிழ், हिन्दी ஆகியவற்றில் கிடைக்கிறது.',
    rights: 'அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.',
  },
};

const hi: WebsiteCopy = {
  meta: { title: 'Trip King — इंटर-सिटी कैब ट्रिप के लिए भारत का मार्केटप्लेस' },
  nav: {
    howItWorks: 'यह कैसे काम करता है',
    forDrivers: 'ड्राइवरों के लिए',
    forAgents: 'एजेंटों के लिए',
    openApp: 'ऐप खोलें',
  },
  hero: {
    kicker: 'ड्राइवर · ट्रिप मैनेजर · सत्यापित · तमिलनाडु',
    h1: 'इंटर-सिटी कैब ट्रिप — आख़िरकार व्यवस्थित।',
    sub: 'एजेंट एक ट्रिप पोस्ट करके अपने WhatsApp ग्रुप में शेयर करते हैं — सत्यापित ड्राइवर आवेदन करते हैं, आप सबसे अच्छा चुनकर लाइव ट्रैक करते हैं। ड्राइवर ग्रुप में स्पैम किए बिना असली इंटर-सिटी काम पाते हैं। न पीछा करना, न अफरा-तफरी।',
    ctaDriver: 'मैं एक ड्राइवर हूँ',
    ctaAgent: 'मैं एक ट्रैवल एजेंट हूँ',
    ctaOpen: 'Trip King खोलें',
    microcopy: 'KYC सत्यापित · लाइव ट्रैकिंग · 3 भाषाओं में',
  },
  trust: {
    items: [
      { icon: 'send', text: 'WhatsApp पर ट्रिप शेयर करें' },
      { icon: 'shield', text: 'सत्यापित ड्राइवर' },
      { icon: 'navigation', text: 'लाइव ट्रिप ट्रैकिंग' },
      { icon: 'languages', text: 'English · தமிழ் · हिन्दी' },
    ],
  },
  problem: {
    title: 'जाना-पहचाना लगता है?',
    driver: {
      title: 'अगर आप एक ड्राइवर हैं',
      items: [
        { icon: 'message', text: 'ट्रिप ढूँढने के लिए दस WhatsApp ग्रुप में मैसेज करते हैं — फिर भी आधा समय खाली गाड़ी चलाते हैं।' },
        { icon: 'wallet', text: 'ट्रिप ख़त्म करने के बाद बाटा और कमीशन को लेकर बहस।' },
        { icon: 'badge', text: 'आपने 200 अच्छी ट्रिप कीं — पर नए एजेंट को यह पता ही नहीं चलता।' },
        { icon: 'ghost', text: 'ट्रिप “कन्फ़र्म” होती है, फिर पिकअप से एक घंटा पहले रद्द। आपका दिन बर्बाद।' },
      ],
    },
    agent: {
      title: 'अगर आप एक ट्रैवल एजेंट हैं',
      items: [
        { icon: 'phone', text: 'एक ट्रिप दस WhatsApp ग्रुप में पोस्ट करते हैं और 50 बेतरतीब जवाब और कॉल आते हैं।' },
        { icon: 'ghost', text: 'ड्राइवर हाँ कहता है… फिर ग़ायब। ग्राहक चला जाता है और आपकी बदनामी होती है।' },
        { icon: 'shield-question', text: 'जब तक ग्राहक शिकायत न करे, पता ही नहीं चलता कि ड्राइवर भरोसेमंद है या नहीं।' },
        { icon: 'map-pin', text: '“मेरी गाड़ी कहाँ है?” ग्राहक पूछता है — और पता करने के लिए आपको ड्राइवर को फ़ोन करना पड़ता है।' },
      ],
    },
  },
  how: {
    title: 'Trip King कैसे काम करता है',
    sub: 'एक ही प्लेटफ़ॉर्म, दो पक्ष। अपना चुनें।',
    tabs: { driver: 'ड्राइवरों के लिए', agent: 'ट्रैवल एजेंटों के लिए' },
    driverSteps: [
      { n: '1', icon: 'shield-check', h: 'साइन अप करें और सत्यापित हों', p: 'फ़ोन OTP, फिर एक तेज़ KYC — आधार, वोटर ID, सेल्फ़ी, एक छोटी वीडियो कॉल। एडमिन की मंज़ूरी के बाद आप तैयार हैं।', shot: 'driver-kyc', shotLabel: 'KYC सत्यापन' },
      { n: '2', icon: 'map-pinned', h: 'अपनी उपलब्धता पोस्ट करें', p: 'आपका शहर, जिन शहरों में जाएँगे, जिन तारीख़ों में खाली हैं। एजेंट और मैचिंग अलर्ट तुरंत देख लेते हैं।', shot: 'post-vacancy', shotLabel: 'उपलब्धता पोस्ट करें' },
      { n: '3', icon: 'hand-coins', h: 'ट्रिप के लिए आवेदन करें — असली पेआउट देखें', p: 'पास की ट्रिप ब्राउज़ करें — या किसी एजेंट द्वारा आपके WhatsApp ग्रुप में शेयर किया ट्रिप लिंक खोलें। हर ट्रिप पहले से ही ब्रेकडाउन दिखाती है: प्रति किमी रेट, कमीशन घटाकर, GST घटाकर, आपका बाटा जोड़कर।', shot: 'trip-detail', shotLabel: 'ट्रिप पेआउट ब्रेकडाउन' },
      { n: '4', icon: 'navigation', h: 'चलाएँ — स्टार्ट OTP, लाइव ट्रैकिंग, रेटिंग', p: 'यात्री स्टार्ट OTP डालता है, आप ओडोमीटर फ़ोटो लेते हैं, ट्रिप शुरू। एंड OTP इसे बंद करता है। यात्री आपको रेटिंग देता है — और वह रेटिंग आपके साथ चलती है।', shot: 'assigned-trip', shotLabel: 'लाइव ट्रिप + OTP' },
    ],
    agentSteps: [
      { n: '1', icon: 'file-plus', h: '30 सेकंड में ट्रिप पोस्ट करें', p: 'कहाँ से, कहाँ, कब, कार का प्रकार, सीटें, AC। प्रति किमी रेट, अपना कमीशन %, GST और बाटा जोड़ें। हो गया।', shot: 'post-trip', shotLabel: 'ट्रिप पोस्ट करें' },
      { n: '2', icon: 'send', h: 'WhatsApp पर शेयर करें', p: 'Trip King आपको एक साफ़ ट्रिप लिंक देता है। इसे अपने ड्राइवर ग्रुप, यूनियन ग्रुप या निजी कॉन्टैक्ट में शेयर करें — आप तय करें कहाँ। WhatsApp चलता रहे; अफरा-तफरी ख़त्म।', shot: 'share-trip', shotLabel: 'ट्रिप लिंक शेयर करें' },
      { n: '3', icon: 'star', h: 'सत्यापित ड्राइवर आवेदन करते हैं', p: 'सिर्फ़ रजिस्टर्ड ड्राइवर आवेदन कर सकते हैं। हर आवेदक की रेटिंग, पूरी की गई ट्रिप, गाड़ी, टॉप टैग और KYC स्थिति — एक ही लिस्ट में साथ-साथ।', shot: 'applicants', shotLabel: 'ड्राइवर आवेदक + रेटिंग' },
      { n: '4', icon: 'check-circle', h: 'जिस पर भरोसा हो उसे चुनें', p: 'एक टैप में ड्राइवर असाइन। बाक़ी सब अपने आप रिजेक्ट और सूचित — और ट्रिप बंद, ड्राइवर कॉल करना बंद कर देते हैं। यात्री को साफ़ कन्फ़र्मेशन कार्ड।', shot: 'assign-driver', shotLabel: 'ड्राइवर असाइन करें' },
      { n: '5', icon: 'navigation', h: 'लाइव ट्रैक करें — और रिकॉर्ड रखें', p: 'गाड़ी कहाँ है, पहुँचने में कितना समय, समय पर / देरी। ग्राहक को तुरंत जवाब। हर ट्रिप रूट, किराया, बाटा, ड्राइवर और टाइमस्टैम्प के साथ रखी जाती है। यात्री ड्राइवर को रेटिंग देता है। अब कोई विवाद नहीं।', shot: 'tracking', shotLabel: 'लाइव ट्रैकिंग + ETA' },
    ],
  },
  features: {
    title: 'इस तरह बनाया गया जैसे कैब ट्रिप असल में चलती हैं',
    sub: 'जो बातें तय करती हैं कि ट्रिप अच्छी जाएगी या नहीं — संभाल ली गईं।',
    items: [
      { icon: 'send', h: 'WhatsApp पर ट्रिप शेयर करें', p: 'एक बार ट्रिप बनाएँ, एक साफ़ ट्रिप लिंक पाएँ, और किसी भी WhatsApp ड्राइवर ग्रुप में शेयर करें। ड्राइवर क्लिक करके Trip King से आवेदन करते हैं — आवेदन एक व्यवस्थित डैशबोर्ड में आते हैं।', wide: true, lead: true },
      { icon: 'star', h: 'रेटिंग जो साथ चले', p: 'ड्राइवर की रेटिंग, पूरी की गई ट्रिप और टॉप टैग एक एजेंट से दूसरे तक उसके साथ जाते हैं। अच्छा काम जुड़ता जाता है।' },
      { icon: 'shield-check', h: 'KYC सत्यापन', p: 'आधार, वोटर ID, सेल्फ़ी और एक वीडियो कॉल — किसी के लेन-देन से पहले एडमिन द्वारा जाँचा गया।' },
      { icon: 'navigation', h: 'लाइव ट्रैकिंग और ETA', p: 'एजेंट (और यात्री) देख सकते हैं कि गाड़ी कहाँ है और कब पहुँचेगी — समय पर या देरी से।' },
      { icon: 'key-round', h: 'ट्रिप-स्टार्ट और एंड OTP', p: 'यात्री का OTP ट्रिप शुरू करता है; दूसरा ख़त्म। दोनों सिरों पर ओडोमीटर फ़ोटो। दूरी असली है।' },
      { icon: 'hand-coins', h: 'पारदर्शी पेआउट ब्रेकडाउन', p: 'रेट/किमी − कमीशन − GST + बाटा, ड्राइवर के आवेदन करने से पहले दिखाया जाता है। कोई “बाद में सेटल कर लेंगे” नहीं।', wide: true },
      { icon: 'bell-ring', h: 'जॉब अलर्ट और शहर मैचिंग', p: 'ड्राइवर रूट के हिसाब से अलर्ट सेट करते हैं। मैच होती नई ट्रिप उन्हें पिंग करती हैं — दूसरे शहरों में वन-वे और रिटर्न ट्रिप समेत।' },
      { icon: 'ticket', h: 'यात्री पोर्टल', p: 'यात्री को ऐप की ज़रूरत नहीं — वह 6-अंकों के कोड से ट्रिप देखता है और लाइव स्थिति देखता है।' },
      { icon: 'languages', h: 'English · தமிழ் · हिन्दी', p: 'पूरा ऐप — और यह साइट — तीनों में काम करते हैं। कभी भी बदलें।' },
    ],
  },
  why: {
    title: 'Trip King क्यों',
    rows: [
      { a: 'WhatsApp ग्रुप के मुक़ाबले', b: 'सत्यापित ड्राइवर आपके पास आते हैं, पहले से KYC-जाँचे हुए, एक आवेदक लिस्ट में। हर ट्रिप रिकॉर्ड होती है — रूट, किराया, बाटा, टाइमस्टैम्प। लाइव ट्रैकिंग। असाइन होते ही ट्रिप बंद। न स्क्रॉल, न “किसने ले लिया?”।' },
      { a: 'यह कोई और टैक्सी ऐप नहीं', b: 'Trip King यात्रियों के राइड बुक करने के लिए नहीं है। एजेंट कन्फ़र्म्ड ट्रिप पोस्ट करते हैं; सत्यापित ड्राइवर आवेदन करते हैं। असाइनमेंट — और ड्राइवर क्या रकम देखे — आप नियंत्रित करते हैं।' },
      { a: 'Savaari / Ola Outstation के मुक़ाबले', b: 'आपका ग्राहक आपके पास रहता है। Trip King आपका टूल है — ऐसा बिचौलिया नहीं जो आपकी बुकिंग और मार्जिन ले ले।' },
    ],
  },
  admin: {
    title: 'आवेदकों पर भरोसा क्यों करें',
    body: 'हर ड्राइवर और हर ट्रिप मैनेजर पोस्ट या आवेदन करने से पहले एडमिन द्वारा जाँचा जाता है — सत्यापन परत का यही पूरा मक़सद है।',
    points: [
      'आधार + वोटर ID + सेल्फ़ी + एक लाइव वीडियो कॉल, इंसान द्वारा जाँची गई।',
      'गाड़ी की पात्रता — कार का प्रकार, उम्र और दस्तावेज़ की समाप्ति — ट्रैक की जाती है।',
      'समीक्षाएँ मॉडरेट होती हैं; अपमानजनक टिकती नहीं।',
    ],
  },
  finalCta: {
    h: 'आज ही शुरू करें।',
    sub: 'एजेंट: एक ट्रिप पोस्ट करके अपने WhatsApp ग्रुप में शेयर करें। ड्राइवर: अपनी उपलब्धता पोस्ट करें। एक मिनट लगता है।',
    ctaOpen: 'Trip King खोलें',
    ctaWhatsapp: 'एक्सेस के लिए WhatsApp करें',
    footnote: 'तमिलनाडु के ट्रैवल एजेंटों और ड्राइवरों के लिए बनाया गया।',
  },
  footer: {
    tagline: 'इंटर-सिटी कैब ट्रिप के लिए भारत का मार्केटप्लेस।',
    passenger: 'क्या आप यात्री हैं? पैसेंजर पोर्टल खोलें →',
    langNote: 'English, தமிழ் और हिन्दी में उपलब्ध।',
    rights: 'सर्वाधिकार सुरक्षित।',
  },
};

export const WEBSITE_COPY: Record<WebsiteLang, WebsiteCopy> = { en, ta, hi };

/** WhatsApp number for "request access" (digits only, with country code). */
export const WHATSAPP_NUMBER = '910000000000';
