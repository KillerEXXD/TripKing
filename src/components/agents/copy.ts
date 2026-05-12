/**
 * Trip King — Agents landing page copy (English + Tamil).
 *
 * Page-local marketing copy (not the app's i18n DB). Mirrors the COPY-object
 * pattern used elsewhere. No pricing/cost copy by design — the page sells the
 * workflow, the features and the agent's daily pain points only.
 */

export type AgentLang = 'en' | 'ta';

export const AGENT_LANGS: { code: AgentLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
];

export interface CompareRow {
  a: string; // "WhatsApp only" / "Regular taxi apps"
  b: string; // "With Trip King"
}

export interface PainCard {
  icon: string;
  title: string;
  body: string;
}

export interface FeatureBlock {
  icon: string;
  title: string;
  body: string;
  /** small bullet list shown under the body */
  bullets?: string[];
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface AgentCopy {
  meta: { title: string; description: string };
  nav: { howItWorks: string; openApp: string };

  hero: {
    kicker: string;
    h1: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    waCardTitle: string;
    dashCardTitle: string;
    note: string;
  };

  keepWa: {
    h: string;
    body: string;
    leftLabel: string;
    rightLabel: string;
    rows: CompareRow[];
  };

  how: {
    h: string;
    sub: string;
    steps: { n: string; icon: string; h: string; p: string }[];
    lifecycleLabel: string;
    /** trip lifecycle pills */
    lifecycle: string[];
  };

  pains: { h: string; sub: string; cards: PainCard[] };

  features: { h: string; sub: string; blocks: FeatureBlock[] };

  amounts: {
    h: string;
    body: string;
    optionHead: string;
    seesHead: string;
    rows: { option: string; sees: string }[];
  };

  vsTaxi: { h: string; body: string; leftLabel: string; rightLabel: string; rows: CompareRow[] };
  vsWa: { h: string; body: string; leftLabel: string; rightLabel: string; rows: CompareRow[] };

  routes: { h: string; body: string; chips: string[] };

  analytics: {
    h: string;
    body: string;
    cardTitle: string;
    metrics: { label: string; value: string }[];
    bullets: string[];
  };

  network: {
    h: string;
    body: string;
    pools: string[];
    examples: string[];
  };

  union: { h: string; body: string; bullets: string[]; positioning: string };

  benefits: { h: string; cards: { icon: string; title: string; body: string }[] };

  faq: { h: string; items: FaqItem[] };

  finalCta: {
    h: string;
    sub: string;
    ctaPrimary: string;
    ctaWhatsapp: string;
    footnote: string;
  };

  /** the one-line takeaway used in the footer band */
  takeaway: string;
}

const WA_TRIP = (lines: string[]) => lines.join('\n');

const en: AgentCopy = {
  meta: {
    title: 'Trip King for Travel Agents',
    description:
      'Create intercity trips, share them to WhatsApp groups, receive applications from registered drivers, manage assignments, track trips, and organize your trusted driver network.',
  },
  nav: { howItWorks: 'How it works', openApp: 'Open Trip King' },

  hero: {
    kicker: 'For travel agents · trip managers · taxi operators',
    h1: 'Turn your WhatsApp driver groups into a smart trip assignment system.',
    sub: 'Create a trip once, share it to your WhatsApp groups, receive applications only from registered drivers, shortlist the best match, assign the trip, and track everything from one place.',
    ctaPrimary: 'Open Trip King',
    ctaSecondary: 'See how it works',
    waCardTitle: 'Your WhatsApp post',
    dashCardTitle: 'Your Trip King dashboard',
    note: 'No need to stop using WhatsApp. Start with one trip link, shared to your existing driver groups.',
  },

  keepWa: {
    h: 'Keep WhatsApp. Remove the chaos.',
    body: 'Your drivers are already in WhatsApp groups. Trip King does not replace those groups. It gives every trip a smart application link — so drivers apply in one organised place instead of calling, messaging and creating confusion.',
    leftLabel: 'WhatsApp only',
    rightLabel: 'With Trip King',
    rows: [
      { a: '50 random replies', b: 'One organised applicant list' },
      { a: 'Unknown driver details', b: 'Registered driver profile' },
      { a: 'Repeated calls', b: 'Shortlist first, call only selected drivers' },
      { a: 'Hard to know who is serious', b: 'Drivers apply with trip-specific intent' },
      { a: 'Old trips keep getting messages', b: 'Trip can be closed once assigned' },
      { a: 'No trip history', b: 'Every assignment is recorded' },
      { a: 'No driver reliability data', b: 'Ratings, cancellations, completed trips' },
      { a: 'Hard to manage multiple trips', b: 'One dashboard for all active trips' },
    ],
  },

  how: {
    h: 'How Trip King works for agents',
    sub: 'Five steps. You stay in control the whole way.',
    steps: [
      { n: '1', icon: 'file-plus', h: 'Create the trip', p: 'Pickup city, drop city, date, time, vehicle type, fare, commission, passenger instructions.' },
      { n: '2', icon: 'send', h: 'Share to WhatsApp', p: 'Trip King generates a clean trip link. Share it to your driver groups, union groups or private contacts.' },
      { n: '3', icon: 'users', h: 'Drivers apply', p: 'Only registered drivers can apply. You get structured applications — driver, vehicle, city, verification status.' },
      { n: '4', icon: 'list-checks', h: 'Shortlist & assign', p: 'Compare applicants, call only the serious ones, assign the trip, close the listing — others see it’s no longer open.' },
      { n: '5', icon: 'navigation', h: 'Track & manage', p: 'Driver confirmation, pickup, trip progress, completion, payment and commission status — from one dashboard.' },
    ],
    lifecycleLabel: 'The trip lifecycle',
    lifecycle: [
      'Draft', 'Shared', 'Applications received', 'Shortlisted', 'Assigned',
      'Driver started', 'Passenger picked up', 'In progress', 'Completed', 'Closed',
    ],
  },

  pains: {
    h: 'Built for the daily problems travel agents face',
    sub: 'Sound familiar?',
    cards: [
      { icon: 'message', title: 'Too many WhatsApp replies', body: 'Post one trip and get a flood of unstructured replies, calls and duplicate messages.' },
      { icon: 'shield-question', title: 'Unknown driver quality', body: '“Available” means nothing — you don’t know the vehicle, the location, the reliability or the cancellation history.' },
      { icon: 'file-x', title: 'No clean assignment record', body: 'After a trip is assigned there’s no record of who accepted, what commission was agreed and what vehicle was promised.' },
      { icon: 'history', title: 'Old trips keep circulating', body: 'Even after a trip is closed, drivers keep calling and applying.' },
      { icon: 'layers', title: 'Multiple trips are hard to manage', body: 'Handling many trips needs a dashboard — not hundreds of WhatsApp messages.' },
      { icon: 'scatter', title: 'Details scattered everywhere', body: 'Passenger pickup, driver details, payment info and trip progress are spread across chats and calls.' },
      { icon: 'eye-off', title: 'Customer amount needs privacy', body: 'You may not want the driver to see the full customer-paid amount — only the driver fare or the commission.' },
    ],
  },

  features: {
    h: 'Everything an agent needs — in one place',
    sub: 'The workflow, not just a list of drivers.',
    blocks: [
      {
        icon: 'send', title: 'WhatsApp trip sharing',
        body: 'Create a trip once and share the link to any WhatsApp group. Drivers click the link and apply through Trip King — applications come into one clean dashboard.',
        bullets: ['App generates a shareable trip link', 'Share to any group manually — you choose where', 'Registered drivers apply; new ones register first'],
      },
      {
        icon: 'badge-check', title: 'Registered, verified drivers only',
        body: 'No more random replies. Drivers apply with a real profile — vehicle, city, KYC status, ratings, completed trips, cancellation history.',
        bullets: ['Aadhaar + Voter ID + selfie + video-call KYC', 'Vehicle make / model / year / number', 'Verified badge, completed & cancelled trips, ratings'],
      },
      {
        icon: 'list-checks', title: 'Shortlist, assign, close',
        body: 'Compare applicants side by side. Call only the drivers you want. One tap assigns the trip; everyone else is auto-notified and the listing closes.',
        bullets: ['Filter by vehicle, city, proximity, rating, verified', 'Shortlist before you call', 'Assign one driver — others see it’s closed'],
      },
      {
        icon: 'layout-dashboard', title: 'One dashboard for every trip',
        body: 'Open trips, trips with applicants, assigned, in progress, completed, cancelled — all at a glance. Manage 5, 10 or 50 trips without losing track.',
        bullets: ['Per-trip applicant count', 'Assigned driver + pickup time + vehicle', 'Payment & commission status'],
      },
      {
        icon: 'navigation', title: 'Passenger pickup & trip progress',
        body: 'After you assign a driver, track the stages that matter: driver confirms, driver starts, passenger picked up, trip in progress, drop completed, payment done.',
        bullets: ['Driver confirmation & start updates', 'Passenger-picked-up & completion', 'Delay / cancellation updates, driver & agent notes'],
      },
      {
        icon: 'eye-off', title: 'Control what amount the driver sees',
        body: 'You decide the financial picture the driver gets — the full fare, the driver payout, the commission, a negotiable price, or hide the customer-paid amount completely.',
        bullets: ['Protect your customer pricing', 'Protect your margin', 'Switch the visibility per trip'],
      },
      {
        icon: 'star', title: 'Ratings & reliability history',
        body: 'A driver’s rating, completed trips, top tags and cancellation record travel with them — so you reuse the dependable ones and avoid the rest.',
        bullets: ['Star rating + review tags', 'Completed vs cancelled trips', 'Agent-side ratings too'],
      },
      {
        icon: 'route', title: 'Route-based driver matching',
        body: 'Drivers post availability by city and route. Matching trips reach the right drivers — including one-way and return trips in other cities.',
        bullets: ['Availability by route', 'One-way & return trip matching', 'Alerts ping matching drivers'],
      },
      {
        icon: 'bar-chart', title: 'Analytics for agents',
        body: 'See trip volume, fill rate, fastest routes, most reliable drivers, average response time and monthly performance.',
        bullets: ['Trips posted / filled / cancelled', 'Avg time to first application & to assignment', 'Top routes, best drivers, repeat drivers'],
      },
      {
        icon: 'address-book', title: 'Your own trusted driver pool',
        body: 'Don’t depend only on open groups. Build your private list — preferred drivers, blocked drivers, route-wise pools — your own driver CRM over time.',
        bullets: ['My drivers / preferred / blocked', 'Route-wise & vehicle-wise pools', 'Recently used & high-rated drivers'],
      },
    ],
  },

  amounts: {
    h: 'Control what amount the driver sees',
    body: 'Agents need to protect customer pricing and margins. Trip King lets you choose what financial details a driver sees on each trip.',
    optionHead: 'Visibility option',
    seesHead: 'What the driver sees',
    rows: [
      { option: 'Full amount visible', sees: 'Customer fare + driver payout + commission' },
      { option: 'Driver payout only', sees: 'Only the amount payable to the driver' },
      { option: 'Commission only', sees: 'The commission you require' },
      { option: 'Hidden customer fare', sees: 'The customer-paid amount stays private' },
      { option: 'Negotiable', sees: 'Driver can quote or discuss after applying' },
    ],
  },

  vsTaxi: {
    h: 'Not another taxi booking app',
    body: 'Trip King is not built mainly for passengers booking rides. It’s built for travel agents, trip managers, taxi owners and intercity drivers who already work through WhatsApp networks.',
    leftLabel: 'Regular taxi apps',
    rightLabel: 'Trip King',
    rows: [
      { a: 'Passenger books a cab', b: 'Agent posts a confirmed trip' },
      { a: 'Customer-facing', b: 'Agent- and driver-facing' },
      { a: 'App controls the booking', b: 'Agent controls the assignment' },
      { a: 'Driver accepts a platform ride', b: 'Driver applies for an agent’s trip' },
      { a: 'Focus on city / local rides', b: 'Focus on intercity / outstation trips' },
      { a: 'Limited agent workflow', b: 'Full trip-assignment workflow' },
      { a: 'No WhatsApp group integration', b: 'Built around WhatsApp sharing' },
      { a: 'No private driver pool', b: 'Agent manages their own drivers' },
      { a: 'No customer-fare masking', b: 'Agent controls amount visibility' },
      { a: 'Basic ride tracking', b: 'Multi-trip operational dashboard' },
    ],
  },

  vsWa: {
    h: 'Better than WhatsApp alone',
    body: 'WhatsApp is great for reach. It is not built for filtering drivers, tracking trips, managing many assignments or analysing your business.',
    leftLabel: 'WhatsApp groups',
    rightLabel: 'Trip King',
    rows: [
      { a: 'Good for broadcasting', b: 'Good for managing applications' },
      { a: 'Messages get lost', b: 'Trips have structured records' },
      { a: 'Anyone can reply', b: 'Only registered drivers apply' },
      { a: 'No filtering', b: 'Filter by vehicle, city, rating, verification' },
      { a: 'No trip status', b: 'Open, assigned, in-progress, completed' },
      { a: 'No analytics', b: 'Route, driver and trip analytics' },
      { a: 'No driver history', b: 'Completed / cancelled trip history' },
      { a: 'No amount control', b: 'Hide or show financial details as needed' },
    ],
  },

  routes: {
    h: 'Built for South India intercity routes',
    body: 'Designed for the routes you run every week.',
    chips: [
      'Chennai → Madurai', 'Chennai → Coimbatore', 'Chennai → Trichy',
      'Chennai → Bangalore', 'Chennai → Pondicherry', 'Chennai → Salem',
      'Chennai → Kerala', 'Coimbatore → Bangalore', 'Madurai → Chennai',
    ],
  },

  analytics: {
    h: 'Understand your trip business',
    body: 'See which routes perform best, which drivers are most reliable, how fast trips get filled, and how many trips you complete each month.',
    cardTitle: 'Your analytics — this month',
    metrics: [
      { label: 'Trips posted', value: '128' },
      { label: 'Trips assigned', value: '94' },
      { label: 'Fill rate', value: '73%' },
      { label: 'Avg first application', value: '8 min' },
      { label: 'Avg time to assignment', value: '22 min' },
      { label: 'Top route', value: 'Chennai → Madurai' },
    ],
    bullets: [
      'Trips posted, filled and cancelled',
      'Average time to first application and to assignment',
      'Most active routes, best-performing drivers, repeat drivers',
    ],
  },

  network: {
    h: 'Build and manage your own trusted driver pool',
    body: 'You don’t need to depend only on open groups. Build your private list of trusted, preferred and blocked drivers — and route-wise pools. Over time, Trip King becomes your own driver CRM.',
    pools: [
      'My Drivers', 'Preferred Drivers', 'Blocked Drivers', 'Route-wise Drivers',
      'Vehicle-wise Drivers', 'Recently Used', 'High-Rated', 'Verified',
    ],
    examples: [
      'Chennai Airport drivers', 'Chennai → Madurai drivers', 'Innova drivers',
      'Tempo Traveller drivers', 'Kerala route drivers', 'Night-trip drivers',
    ],
  },

  union: {
    h: 'Works with driver unions and WhatsApp groups',
    body: 'Many unions and local taxi networks already operate through WhatsApp groups. Trip King helps those groups become more organised — without replacing them.',
    bullets: [
      'Group-wise trip sharing & group-specific links',
      'Union-verified driver pool, admin-managed list',
      'Registered-driver-only applications — fewer fake profiles',
      'Better dispute history',
    ],
    positioning: 'WhatsApp stays the communication channel. Trip King becomes the control system.',
  },

  benefits: {
    h: 'Why agents use Trip King',
    cards: [
      { icon: 'clock', title: 'Save time', body: 'No more reading hundreds of WhatsApp replies for every trip.' },
      { icon: 'badge-check', title: 'Choose better drivers', body: 'Compare by vehicle, location, verification and history.' },
      { icon: 'shield', title: 'Fewer fake applicants', body: 'Only registered drivers can apply through the trip link.' },
      { icon: 'lock', title: 'Protect customer details', body: 'Share passenger info only after you assign the driver.' },
      { icon: 'eye-off', title: 'Protect pricing', body: 'Hide the customer-paid amount; show only the fare or commission you choose.' },
      { icon: 'layout-dashboard', title: 'Manage multiple trips', body: 'Track every trip status from one dashboard.' },
      { icon: 'history', title: 'Build driver history', body: 'Know who completed trips, who cancelled, who to trust again.' },
      { icon: 'briefcase', title: 'Run it professionally', body: 'Replace scattered WhatsApp coordination with a structured system.' },
    ],
  },

  faq: {
    h: 'Questions agents ask',
    items: [
      { q: 'Do I need to stop using my WhatsApp groups?', a: 'No. Trip King works with your WhatsApp groups. You create a trip link and share it to the same groups you already use.' },
      { q: 'Can any driver apply?', a: 'Only registered drivers can apply. You can also filter by verified drivers, vehicle type, city, rating and previous history.' },
      { q: 'Can I hide the amount paid by the customer?', a: 'Yes. You choose what the driver sees: full fare, driver payout, commission only, a negotiable amount, or a hidden customer fare.' },
      { q: 'Can I manage multiple trips?', a: 'Yes. Track all trips from one dashboard — open, assigned, in progress, completed, cancelled and closed.' },
      { q: 'Can I manage my own drivers?', a: 'Yes. Build your own trusted driver pool, preferred drivers, blocked drivers and route-wise driver groups.' },
      { q: 'Is this a taxi booking app?', a: 'No. Trip King is a trip-assignment and driver-management system for agents and intercity drivers — not a passenger ride-hailing app.' },
      { q: 'Can I share one trip to many WhatsApp groups?', a: 'Yes. Share the same trip link to any WhatsApp group manually. Drivers who click the link apply through Trip King.' },
      { q: 'What happens after a driver is assigned?', a: 'The trip is marked assigned or closed. Other drivers see that it’s no longer open and stop applying.' },
    ],
  },

  finalCta: {
    h: 'Start managing trips professionally.',
    sub: 'Start with one trip. Share it to your WhatsApp group. See how many registered drivers apply.',
    ctaPrimary: 'Open Trip King',
    ctaWhatsapp: 'WhatsApp us to get started',
    footnote: 'Built for Tamil Nadu travel agents.',
  },

  takeaway:
    'Trip King lets agents keep using WhatsApp groups — but manage trip applications, driver verification, assignment, tracking, amount visibility and analytics in one professional system.',
};

const ta: AgentCopy = {
  meta: {
    title: 'Trip King — டிராவல் ஏஜெண்ட்களுக்கு',
    description:
      'இடைநகர டிரிப்கள் உருவாக்குங்கள், வாட்ஸ்அப் குழுக்களில் பகிருங்கள், பதிவு செய்த டிரைவர்களிடமிருந்து விண்ணப்பங்கள் பெறுங்கள், ஒதுக்கீடுகளை நிர்வகியுங்கள், டிரிப்களைக் கண்காணியுங்கள், உங்கள் நம்பகமான டிரைவர் நெட்வொர்க்கை ஒழுங்கமைக்கவும்.',
  },
  nav: { howItWorks: 'எப்படி வேலை செய்கிறது', openApp: 'Trip King திறக்க' },

  hero: {
    kicker: 'டிராவல் ஏஜெண்ட்கள் · டிரிப் மேனேஜர்கள் · டாக்ஸி ஆபரேட்டர்கள்',
    h1: 'உங்கள் வாட்ஸ்அப் டிரைவர் குழுக்களை ஒரு ஸ்மார்ட் டிரிப் ஒதுக்கீட்டு அமைப்பாக மாற்றுங்கள்.',
    sub: 'ஒரு முறை டிரிப் உருவாக்குங்கள், வாட்ஸ்அப் குழுக்களில் பகிருங்கள், பதிவு செய்த டிரைவர்களிடமிருந்து மட்டுமே விண்ணப்பங்கள் பெறுங்கள், சிறந்தவரைத் தேர்ந்தெடுங்கள், டிரிப்பை ஒதுக்குங்கள், எல்லாவற்றையும் ஒரே இடத்தில் கண்காணியுங்கள்.',
    ctaPrimary: 'Trip King திறக்க',
    ctaSecondary: 'எப்படி வேலை செய்கிறது',
    waCardTitle: 'உங்கள் வாட்ஸ்அப் போஸ்ட்',
    dashCardTitle: 'உங்கள் Trip King டாஷ்போர்டு',
    note: 'வாட்ஸ்அப்பை விட்டுவிட வேண்டாம். ஒரு டிரிப் லிங்க்குடன் தொடங்குங்கள் — உங்கள் இருக்கும் டிரைவர் குழுக்களில் பகிருங்கள்.',
  },

  keepWa: {
    h: 'வாட்ஸ்அப்பை வைத்திருங்கள். குழப்பத்தை நீக்குங்கள்.',
    body: 'உங்கள் டிரைவர்கள் ஏற்கனவே வாட்ஸ்அப் குழுக்களில் உள்ளனர். Trip King அந்தக் குழுக்களை மாற்றவில்லை. ஒவ்வொரு டிரிப்புக்கும் ஒரு ஸ்மார்ட் விண்ணப்ப லிங்க் தருகிறது — கால், மெசேஜ், குழப்பத்துக்குப் பதிலாக டிரைவர்கள் ஒரே ஒழுங்கான இடத்தில் விண்ணப்பிக்கிறார்கள்.',
    leftLabel: 'வாட்ஸ்அப் மட்டும்',
    rightLabel: 'Trip King-உடன்',
    rows: [
      { a: '50 சீரற்ற பதில்கள்', b: 'ஒரே ஒழுங்கான விண்ணப்பதாரர் பட்டியல்' },
      { a: 'டிரைவர் விவரம் தெரியாது', b: 'பதிவு செய்த டிரைவர் ப்ரொஃபைல்' },
      { a: 'மீண்டும் மீண்டும் கால்கள்', b: 'முதலில் ஷார்ட்லிஸ்ட், பிறகு தேர்ந்தவருக்கு மட்டும் கால்' },
      { a: 'யார் சீரியஸ் என்று தெரியாது', b: 'டிரைவர்கள் டிரிப்-குறிப்பிட்ட நோக்கத்துடன் விண்ணப்பிக்கிறார்கள்' },
      { a: 'பழைய டிரிப்களுக்கு மெசேஜ் தொடர்கிறது', b: 'ஒதுக்கியதும் டிரிப்பை மூடலாம்' },
      { a: 'டிரிப் வரலாறு இல்லை', b: 'ஒவ்வொரு ஒதுக்கீடும் பதிவாகிறது' },
      { a: 'டிரைவர் நம்பகத்தன்மை தரவு இல்லை', b: 'ரேட்டிங், கேன்சல்கள், முடித்த டிரிப்கள்' },
      { a: 'பல டிரிப்களை நிர்வகிப்பது கடினம்', b: 'அனைத்து செயலில் உள்ள டிரிப்களுக்கும் ஒரே டாஷ்போர்டு' },
    ],
  },

  how: {
    h: 'ஏஜெண்ட்களுக்கு Trip King எப்படி வேலை செய்கிறது',
    sub: 'ஐந்து படிகள். முழு வழியிலும் நீங்கள் கட்டுப்பாட்டில்.',
    steps: [
      { n: '1', icon: 'file-plus', h: 'டிரிப்பை உருவாக்குங்கள்', p: 'பிக்கப் ஊர், டிராப் ஊர், தேதி, நேரம், கார் வகை, கட்டணம், கமிஷன், பயணி அறிவுறுத்தல்கள்.' },
      { n: '2', icon: 'send', h: 'வாட்ஸ்அப்பில் பகிருங்கள்', p: 'Trip King ஒரு சுத்தமான டிரிப் லிங்க் உருவாக்குகிறது. டிரைவர் குழுக்கள், யூனியன் குழுக்கள் அல்லது தனிப்பட்ட தொடர்புகளில் பகிருங்கள்.' },
      { n: '3', icon: 'users', h: 'டிரைவர்கள் விண்ணப்பிக்கிறார்கள்', p: 'பதிவு செய்த டிரைவர்கள் மட்டுமே விண்ணப்பிக்க முடியும். கட்டமைக்கப்பட்ட விண்ணப்பங்கள் — டிரைவர், வாகனம், ஊர், சரிபார்ப்பு நிலை.' },
      { n: '4', icon: 'list-checks', h: 'ஷார்ட்லிஸ்ட் & ஒதுக்குங்கள்', p: 'விண்ணப்பதாரர்களை ஒப்பிடுங்கள், சீரியஸானவர்களுக்கு மட்டும் கால் செய்யுங்கள், டிரிப்பை ஒதுக்குங்கள், பட்டியலை மூடுங்கள் — மற்றவர்கள் அது மூடியதைப் பார்க்கிறார்கள்.' },
      { n: '5', icon: 'navigation', h: 'கண்காணியுங்கள் & நிர்வகியுங்கள்', p: 'டிரைவர் உறுதி, பிக்கப், டிரிப் முன்னேற்றம், முடிவு, பணம் & கமிஷன் நிலை — ஒரே டாஷ்போர்டில்.' },
    ],
    lifecycleLabel: 'டிரிப் வாழ்க்கைச் சுழற்சி',
    lifecycle: [
      'வரைவு', 'பகிரப்பட்டது', 'விண்ணப்பங்கள் வந்தன', 'ஷார்ட்லிஸ்ட்', 'ஒதுக்கப்பட்டது',
      'டிரைவர் தொடங்கினார்', 'பயணி ஏற்றப்பட்டார்', 'நடைபெறுகிறது', 'முடிந்தது', 'மூடப்பட்டது',
    ],
  },

  pains: {
    h: 'ஏஜெண்ட்கள் தினமும் சந்திக்கும் பிரச்சினைகளுக்காக கட்டப்பட்டது',
    sub: 'இது உங்களுக்குப் பரிச்சயமா?',
    cards: [
      { icon: 'message', title: 'அதிக வாட்ஸ்அப் பதில்கள்', body: 'ஒரு டிரிப் போட்டால் கட்டமைப்பற்ற பதில்கள், கால்கள், டூப்ளிகேட் மெசேஜ்கள் வெள்ளம்.' },
      { icon: 'shield-question', title: 'டிரைவர் தரம் தெரியாது', body: '“கிடைக்கும்” என்பதற்கு அர்த்தமில்லை — வாகனம், இடம், நம்பகத்தன்மை, கேன்சல் வரலாறு தெரியாது.' },
      { icon: 'file-x', title: 'சுத்தமான ஒதுக்கீட்டு பதிவு இல்லை', body: 'டிரிப் ஒதுக்கிய பிறகு யார் ஒத்துக்கொண்டார், என்ன கமிஷன், என்ன வாகனம் என்று பதிவில்லை.' },
      { icon: 'history', title: 'பழைய டிரிப்கள் சுற்றிக்கொண்டே இருக்கும்', body: 'டிரிப் மூடிய பிறகும் டிரைவர்கள் கால் செய்து விண்ணப்பித்துக்கொண்டே இருக்கிறார்கள்.' },
      { icon: 'layers', title: 'பல டிரிப்களை நிர்வகிப்பது கடினம்', body: 'பல டிரிப்களைக் கையாள டாஷ்போர்டு தேவை — நூற்றுக்கணக்கான வாட்ஸ்அப் மெசேஜ்கள் அல்ல.' },
      { icon: 'scatter', title: 'விவரங்கள் எல்லா இடத்திலும் சிதறி', body: 'பயணி பிக்கப், டிரைவர் விவரம், பணத் தகவல், டிரிப் முன்னேற்றம் — சாட்களிலும் கால்களிலும் பரவியுள்ளன.' },
      { icon: 'eye-off', title: 'வாடிக்கையாளர் தொகைக்கு தனியுரிமை தேவை', body: 'வாடிக்கையாளர் கொடுத்த முழுத் தொகையை டிரைவர் பார்க்க நீங்கள் விரும்பாமல் இருக்கலாம் — டிரைவர் கட்டணம் அல்லது கமிஷன் மட்டும்.' },
    ],
  },

  features: {
    h: 'ஒரு ஏஜெண்டுக்குத் தேவையான எல்லாம் — ஒரே இடத்தில்',
    sub: 'டிரைவர் பட்டியல் மட்டுமல்ல — முழு வொர்க்ஃப்ளோ.',
    blocks: [
      {
        icon: 'send', title: 'வாட்ஸ்அப் டிரிப் பகிர்வு',
        body: 'ஒரு முறை டிரிப் உருவாக்கி எந்த வாட்ஸ்அப் குழுவிலும் லிங்க் பகிருங்கள். டிரைவர்கள் லிங்கைக் கிளிக் செய்து Trip King வழியாக விண்ணப்பிக்கிறார்கள் — விண்ணப்பங்கள் ஒரே சுத்தமான டாஷ்போர்டுக்கு வருகின்றன.',
        bullets: ['ஆப் பகிரக்கூடிய டிரிப் லிங்க் உருவாக்குகிறது', 'எந்தக் குழுவிலும் கைமுறையாகப் பகிருங்கள் — நீங்கள் தேர்வு செய்கிறீர்கள்', 'பதிவு செய்தவர்கள் விண்ணப்பிக்கிறார்கள்; புதியவர்கள் முதலில் பதிவு செய்கிறார்கள்'],
      },
      {
        icon: 'badge-check', title: 'பதிவு செய்த, சரிபார்க்கப்பட்ட டிரைவர்கள் மட்டும்',
        body: 'சீரற்ற பதில்கள் இல்லை. டிரைவர்கள் உண்மையான ப்ரொஃபைலுடன் விண்ணப்பிக்கிறார்கள் — வாகனம், ஊர், KYC நிலை, ரேட்டிங், முடித்த டிரிப்கள், கேன்சல் வரலாறு.',
        bullets: ['ஆதார் + வாக்காளர் ID + செல்ஃபி + வீடியோ அழைப்பு KYC', 'வாகனம் மேக் / மாடல் / வருடம் / எண்', 'வெரிஃபைட் பேட்ஜ், முடித்த & கேன்சல் டிரிப்கள், ரேட்டிங்'],
      },
      {
        icon: 'list-checks', title: 'ஷார்ட்லிஸ்ட், ஒதுக்குதல், மூடுதல்',
        body: 'விண்ணப்பதாரர்களை அருகருகே ஒப்பிடுங்கள். விரும்பும் டிரைவர்களுக்கு மட்டும் கால். ஒரு டேப்பில் டிரிப் ஒதுக்கப்படுகிறது; மற்றவர்களுக்கு தானாக அறிவிப்பு, பட்டியல் மூடுகிறது.',
        bullets: ['வாகனம், ஊர், அருகாமை, ரேட்டிங், வெரிஃபைட் வடிகட்டல்', 'கால் செய்வதற்கு முன் ஷார்ட்லிஸ்ட்', 'ஒரு டிரைவரை ஒதுக்குங்கள் — மற்றவர்கள் அது மூடியதைப் பார்க்கிறார்கள்'],
      },
      {
        icon: 'layout-dashboard', title: 'ஒவ்வொரு டிரிப்புக்கும் ஒரே டாஷ்போர்டு',
        body: 'திறந்த டிரிப்கள், விண்ணப்பதாரர் உள்ளவை, ஒதுக்கப்பட்டவை, நடைபெறுபவை, முடிந்தவை, கேன்சல் ஆனவை — ஒரே பார்வையில். 5, 10 அல்லது 50 டிரிப்களை இழக்காமல் நிர்வகியுங்கள்.',
        bullets: ['ஒரு டிரிப்புக்கு விண்ணப்பதாரர் எண்ணிக்கை', 'ஒதுக்கப்பட்ட டிரைவர் + பிக்கப் நேரம் + வாகனம்', 'பணம் & கமிஷன் நிலை'],
      },
      {
        icon: 'navigation', title: 'பயணி பிக்கப் & டிரிப் முன்னேற்றம்',
        body: 'டிரைவரை ஒதுக்கிய பிறகு முக்கியமான கட்டங்களைக் கண்காணியுங்கள்: டிரைவர் உறுதி, டிரைவர் தொடக்கம், பயணி ஏற்றப்பட்டார், டிரிப் நடைபெறுகிறது, டிராப் முடிந்தது, பணம் முடிந்தது.',
        bullets: ['டிரைவர் உறுதி & தொடக்க அப்டேட்கள்', 'பயணி-ஏற்றப்பட்டார் & முடிவு', 'தாமதம் / கேன்சல் அப்டேட்கள், டிரைவர் & ஏஜெண்ட் குறிப்புகள்'],
      },
      {
        icon: 'eye-off', title: 'டிரைவர் பார்க்கும் தொகையைக் கட்டுப்படுத்துங்கள்',
        body: 'டிரைவருக்கு என்ன நிதிப் படம் காட்டப்படுகிறது என்பதை நீங்கள் தீர்மானிக்கிறீர்கள் — முழு கட்டணம், டிரைவர் பேஅவுட், கமிஷன், பேச்சுவார்த்தை விலை, அல்லது வாடிக்கையாளர் தொகையை முழுவதுமாக மறைக்கவும்.',
        bullets: ['உங்கள் வாடிக்கையாளர் விலையைப் பாதுகாக்கவும்', 'உங்கள் மார்ஜினைப் பாதுகாக்கவும்', 'ஒவ்வொரு டிரிப்புக்கும் தெரிவுநிலையை மாற்றவும்'],
      },
      {
        icon: 'star', title: 'ரேட்டிங் & நம்பகத்தன்மை வரலாறு',
        body: 'டிரைவரின் ரேட்டிங், முடித்த டிரிப்கள், டாப் டேக்ஸ், கேன்சல் பதிவு அவருடன் வருகின்றன — நம்பகமானவர்களை மீண்டும் பயன்படுத்துங்கள், மற்றவர்களைத் தவிருங்கள்.',
        bullets: ['ஸ்டார் ரேட்டிங் + ரிவியூ டேக்ஸ்', 'முடித்த vs கேன்சல் டிரிப்கள்', 'ஏஜெண்ட் தரப்பு ரேட்டிங்களும்'],
      },
      {
        icon: 'route', title: 'வழி அடிப்படையிலான டிரைவர் பொருத்தம்',
        body: 'டிரைவர்கள் ஊர் & வழியின்படி கிடைப்பைப் பதிகிறார்கள். பொருந்தும் டிரிப்கள் சரியான டிரைவர்களை அடைகின்றன — மற்ற ஊர்களில் ஒன்-வே & திரும்பும் டிரிப்கள் உட்பட.',
        bullets: ['வழியின்படி கிடைப்பு', 'ஒன்-வே & திரும்பும் டிரிப் பொருத்தம்', 'அலெர்ட்கள் பொருந்தும் டிரைவர்களை அடைகின்றன'],
      },
      {
        icon: 'bar-chart', title: 'ஏஜெண்ட்களுக்கான அனலிட்டிக்ஸ்',
        body: 'டிரிப் அளவு, ஃபில் ரேட், வேகமான வழிகள், மிக நம்பகமான டிரைவர்கள், சராசரி பதில் நேரம், மாதாந்திர செயல்திறன் — பாருங்கள்.',
        bullets: ['போட்ட / நிரப்பிய / கேன்சல் ஆன டிரிப்கள்', 'முதல் விண்ணப்பத்துக்கும் ஒதுக்கீட்டுக்கும் சராசரி நேரம்', 'டாப் வழிகள், சிறந்த டிரைவர்கள், மீண்டும் வரும் டிரைவர்கள்'],
      },
      {
        icon: 'address-book', title: 'உங்கள் சொந்த நம்பகமான டிரைவர் பூல்',
        body: 'திறந்த குழுக்களை மட்டும் நம்ப வேண்டாம். உங்கள் தனிப்பட்ட பட்டியலை உருவாக்குங்கள் — விருப்பமான டிரைவர்கள், தடுக்கப்பட்டவர்கள், வழியின்படி பூல்கள் — காலப்போக்கில் உங்கள் சொந்த டிரைவர் CRM.',
        bullets: ['என் டிரைவர்கள் / விருப்பமானவர்கள் / தடுக்கப்பட்டவர்கள்', 'வழியின்படி & வாகனத்தின்படி பூல்கள்', 'சமீபத்தில் பயன்படுத்தியவர்கள் & அதிக-ரேட்டிங் டிரைவர்கள்'],
      },
    ],
  },

  amounts: {
    h: 'டிரைவர் பார்க்கும் தொகையைக் கட்டுப்படுத்துங்கள்',
    body: 'ஏஜெண்ட்கள் வாடிக்கையாளர் விலையையும் மார்ஜினையும் பாதுகாக்க வேண்டும். ஒவ்வொரு டிரிப்பிலும் டிரைவர் என்ன நிதி விவரங்களைப் பார்க்கிறார் என்பதை Trip King-இல் தேர்வு செய்யலாம்.',
    optionHead: 'தெரிவுநிலை விருப்பம்',
    seesHead: 'டிரைவர் பார்ப்பது',
    rows: [
      { option: 'முழுத் தொகை தெரியும்', sees: 'வாடிக்கையாளர் கட்டணம் + டிரைவர் பேஅவுட் + கமிஷன்' },
      { option: 'டிரைவர் பேஅவுட் மட்டும்', sees: 'டிரைவருக்குச் செலுத்தும் தொகை மட்டும்' },
      { option: 'கமிஷன் மட்டும்', sees: 'நீங்கள் கேட்கும் கமிஷன்' },
      { option: 'வாடிக்கையாளர் கட்டணம் மறைக்கப்பட்டது', sees: 'வாடிக்கையாளர் கொடுத்த தொகை தனிப்பட்டதாக இருக்கும்' },
      { option: 'பேச்சுவார்த்தை', sees: 'விண்ணப்பித்த பிறகு டிரைவர் விலை சொல்லலாம் / பேசலாம்' },
    ],
  },

  vsTaxi: {
    h: 'இது இன்னொரு டாக்ஸி புக்கிங் ஆப் அல்ல',
    body: 'Trip King முக்கியமாக பயணிகள் ரைடு புக் செய்வதற்காக கட்டப்படவில்லை. ஏற்கனவே வாட்ஸ்அப் நெட்வொர்க்குகளில் வேலை செய்யும் டிராவல் ஏஜெண்ட்கள், டிரிப் மேனேஜர்கள், டாக்ஸி உரிமையாளர்கள், இடைநகர டிரைவர்களுக்காக கட்டப்பட்டது.',
    leftLabel: 'வழக்கமான டாக்ஸி ஆப்கள்',
    rightLabel: 'Trip King',
    rows: [
      { a: 'பயணி ஒரு கேப் புக் செய்கிறார்', b: 'ஏஜெண்ட் ஒரு உறுதியான டிரிப்பை போடுகிறார்' },
      { a: 'வாடிக்கையாளர் நோக்கி', b: 'ஏஜெண்ட் & டிரைவர் நோக்கி' },
      { a: 'ஆப் புக்கிங்கைக் கட்டுப்படுத்துகிறது', b: 'ஏஜெண்ட் ஒதுக்கீட்டைக் கட்டுப்படுத்துகிறார்' },
      { a: 'டிரைவர் ஒரு பிளாட்ஃபார்ம் ரைடை ஏற்கிறார்', b: 'டிரைவர் ஒரு ஏஜெண்டின் டிரிப்புக்கு விண்ணப்பிக்கிறார்' },
      { a: 'நகர / உள்ளூர் ரைடுகளில் கவனம்', b: 'இடைநகர / அவுட்ஸ்டேஷன் டிரிப்களில் கவனம்' },
      { a: 'வரம்பான ஏஜெண்ட் வொர்க்ஃப்ளோ', b: 'முழு டிரிப்-ஒதுக்கீட்டு வொர்க்ஃப்ளோ' },
      { a: 'வாட்ஸ்அப் குழு ஒருங்கிணைப்பு இல்லை', b: 'வாட்ஸ்அப் பகிர்வைச் சுற்றி கட்டப்பட்டது' },
      { a: 'தனிப்பட்ட டிரைவர் பூல் இல்லை', b: 'ஏஜெண்ட் தனது சொந்த டிரைவர்களை நிர்வகிக்கிறார்' },
      { a: 'வாடிக்கையாளர்-கட்டண மறைப்பு இல்லை', b: 'ஏஜெண்ட் தொகை தெரிவுநிலையைக் கட்டுப்படுத்துகிறார்' },
      { a: 'அடிப்படை ரைடு கண்காணிப்பு', b: 'பல-டிரிப் ஆபரேஷனல் டாஷ்போர்டு' },
    ],
  },

  vsWa: {
    h: 'வாட்ஸ்அப்பை மட்டும் விட சிறந்தது',
    body: 'வாட்ஸ்அப் ரீச்சுக்கு சிறந்தது. ஆனால் டிரைவர்களை வடிகட்ட, டிரிப்களைக் கண்காணிக்க, பல ஒதுக்கீடுகளை நிர்வகிக்க, உங்கள் வணிகத்தை பகுப்பாய்வு செய்ய அது கட்டப்படவில்லை.',
    leftLabel: 'வாட்ஸ்அப் குழுக்கள்',
    rightLabel: 'Trip King',
    rows: [
      { a: 'பிராட்காஸ்டுக்கு நல்லது', b: 'விண்ணப்பங்களை நிர்வகிக்க நல்லது' },
      { a: 'மெசேஜ்கள் தொலைந்துவிடும்', b: 'டிரிப்களுக்கு கட்டமைக்கப்பட்ட பதிவுகள்' },
      { a: 'யார் வேண்டுமானாலும் பதில் சொல்லலாம்', b: 'பதிவு செய்த டிரைவர்கள் மட்டுமே விண்ணப்பிக்கிறார்கள்' },
      { a: 'வடிகட்டல் இல்லை', b: 'வாகனம், ஊர், ரேட்டிங், சரிபார்ப்பு வடிகட்டல்' },
      { a: 'டிரிப் நிலை இல்லை', b: 'திறந்தது, ஒதுக்கப்பட்டது, நடைபெறுகிறது, முடிந்தது' },
      { a: 'அனலிட்டிக்ஸ் இல்லை', b: 'வழி, டிரைவர், டிரிப் அனலிட்டிக்ஸ்' },
      { a: 'டிரைவர் வரலாறு இல்லை', b: 'முடித்த / கேன்சல் டிரிப் வரலாறு' },
      { a: 'தொகைக் கட்டுப்பாடு இல்லை', b: 'தேவைக்கேற்ப நிதி விவரங்களை மறைக்க / காட்ட' },
    ],
  },

  routes: {
    h: 'தென்னிந்திய இடைநகர வழிகளுக்காக கட்டப்பட்டது',
    body: 'நீங்கள் ஒவ்வொரு வாரமும் ஓடும் வழிகளுக்காக வடிவமைக்கப்பட்டது.',
    chips: [
      'சென்னை → மதுரை', 'சென்னை → கோயம்புத்தூர்', 'சென்னை → திருச்சி',
      'சென்னை → பெங்களூரு', 'சென்னை → பாண்டிச்சேரி', 'சென்னை → சேலம்',
      'சென்னை → கேரளா', 'கோயம்புத்தூர் → பெங்களூரு', 'மதுரை → சென்னை',
    ],
  },

  analytics: {
    h: 'உங்கள் டிரிப் வணிகத்தைப் புரிந்துகொள்ளுங்கள்',
    body: 'எந்த வழிகள் சிறப்பாக செயல்படுகின்றன, எந்த டிரைவர்கள் மிக நம்பகமானவர்கள், டிரிப்கள் எவ்வளவு வேகமாக நிரம்புகின்றன, மாதம் எத்தனை டிரிப்களை முடிக்கிறீர்கள் — பாருங்கள்.',
    cardTitle: 'உங்கள் அனலிட்டிக்ஸ் — இந்த மாதம்',
    metrics: [
      { label: 'போட்ட டிரிப்கள்', value: '128' },
      { label: 'ஒதுக்கப்பட்ட டிரிப்கள்', value: '94' },
      { label: 'ஃபில் ரேட்', value: '73%' },
      { label: 'சராசரி முதல் விண்ணப்பம்', value: '8 நிமி' },
      { label: 'ஒதுக்கீட்டுக்கு சராசரி நேரம்', value: '22 நிமி' },
      { label: 'டாப் வழி', value: 'சென்னை → மதுரை' },
    ],
    bullets: [
      'போட்ட, நிரப்பிய, கேன்சல் ஆன டிரிப்கள்',
      'முதல் விண்ணப்பத்துக்கும் ஒதுக்கீட்டுக்கும் சராசரி நேரம்',
      'மிகச் செயலில் உள்ள வழிகள், சிறந்த டிரைவர்கள், மீண்டும் வரும் டிரைவர்கள்',
    ],
  },

  network: {
    h: 'உங்கள் சொந்த நம்பகமான டிரைவர் பூலை உருவாக்கி நிர்வகியுங்கள்',
    body: 'திறந்த குழுக்களை மட்டும் நம்ப வேண்டியதில்லை. நம்பகமான, விருப்பமான, தடுக்கப்பட்ட டிரைவர்களின் தனிப்பட்ட பட்டியலை — வழியின்படி பூல்களை — உருவாக்குங்கள். காலப்போக்கில் Trip King உங்கள் சொந்த டிரைவர் CRM ஆகிறது.',
    pools: [
      'என் டிரைவர்கள்', 'விருப்பமான டிரைவர்கள்', 'தடுக்கப்பட்ட டிரைவர்கள்', 'வழியின்படி டிரைவர்கள்',
      'வாகனத்தின்படி டிரைவர்கள்', 'சமீபத்தில் பயன்படுத்தியவை', 'அதிக-ரேட்டிங்', 'வெரிஃபைட்',
    ],
    examples: [
      'சென்னை விமான நிலைய டிரைவர்கள்', 'சென்னை → மதுரை டிரைவர்கள்', 'இன்னோவா டிரைவர்கள்',
      'டெம்போ டிராவலர் டிரைவர்கள்', 'கேரளா வழி டிரைவர்கள்', 'இரவு-டிரிப் டிரைவர்கள்',
    ],
  },

  union: {
    h: 'டிரைவர் யூனியன்கள் & வாட்ஸ்அப் குழுக்களுடன் வேலை செய்கிறது',
    body: 'பல யூனியன்களும் உள்ளூர் டாக்ஸி நெட்வொர்க்குகளும் ஏற்கனவே வாட்ஸ்அப் குழுக்கள் வழியாக இயங்குகின்றன. Trip King அந்தக் குழுக்களை மாற்றாமல் இன்னும் ஒழுங்காக ஆக்குகிறது.',
    bullets: [
      'குழுவின்படி டிரிப் பகிர்வு & குழு-குறிப்பிட்ட லிங்க்கள்',
      'யூனியன்-வெரிஃபைட் டிரைவர் பூல், அட்மின்-நிர்வகிக்கப்படும் பட்டியல்',
      'பதிவு செய்த டிரைவர்கள் மட்டும் விண்ணப்பம் — குறைவான போலி ப்ரொஃபைல்கள்',
      'சிறந்த தகராறு வரலாறு',
    ],
    positioning: 'வாட்ஸ்அப் தொடர்பு சேனலாகவே இருக்கும். Trip King கட்டுப்பாட்டு அமைப்பாகிறது.',
  },

  benefits: {
    h: 'ஏஜெண்ட்கள் ஏன் Trip King-ஐப் பயன்படுத்துகிறார்கள்',
    cards: [
      { icon: 'clock', title: 'நேரம் சேமியுங்கள்', body: 'ஒவ்வொரு டிரிப்புக்கும் நூற்றுக்கணக்கான வாட்ஸ்அப் பதில்களைப் படிக்க வேண்டியதில்லை.' },
      { icon: 'badge-check', title: 'சிறந்த டிரைவர்களைத் தேர்ந்தெடுங்கள்', body: 'வாகனம், இடம், சரிபார்ப்பு, வரலாறு படி ஒப்பிடுங்கள்.' },
      { icon: 'shield', title: 'குறைவான போலி விண்ணப்பதாரர்கள்', body: 'டிரிப் லிங்க் வழியாக பதிவு செய்த டிரைவர்கள் மட்டுமே விண்ணப்பிக்க முடியும்.' },
      { icon: 'lock', title: 'வாடிக்கையாளர் விவரங்களைப் பாதுகாக்கவும்', body: 'டிரைவரை ஒதுக்கிய பிறகே பயணி தகவலைப் பகிருங்கள்.' },
      { icon: 'eye-off', title: 'விலையைப் பாதுகாக்கவும்', body: 'வாடிக்கையாளர் தொகையை மறைக்கவும்; நீங்கள் தேர்ந்த கட்டணம் / கமிஷன் மட்டும் காட்டவும்.' },
      { icon: 'layout-dashboard', title: 'பல டிரிப்களை நிர்வகியுங்கள்', body: 'ஒரே டாஷ்போர்டில் ஒவ்வொரு டிரிப் நிலையையும் கண்காணியுங்கள்.' },
      { icon: 'history', title: 'டிரைவர் வரலாற்றை உருவாக்குங்கள்', body: 'யார் டிரிப்களை முடித்தார், யார் கேன்சல் செய்தார், யாரை மீண்டும் நம்பலாம் — தெரிந்துகொள்ளுங்கள்.' },
      { icon: 'briefcase', title: 'தொழில்முறையாக நடத்துங்கள்', body: 'சிதறிய வாட்ஸ்அப் ஒருங்கிணைப்பை ஒரு கட்டமைக்கப்பட்ட அமைப்பால் மாற்றுங்கள்.' },
    ],
  },

  faq: {
    h: 'ஏஜெண்ட்கள் கேட்கும் கேள்விகள்',
    items: [
      { q: 'என் வாட்ஸ்அப் குழுக்களை நிறுத்த வேண்டுமா?', a: 'இல்லை. Trip King உங்கள் வாட்ஸ்அப் குழுக்களுடன் வேலை செய்கிறது. ஒரு டிரிப் லிங்க் உருவாக்கி நீங்கள் ஏற்கனவே பயன்படுத்தும் அதே குழுக்களில் பகிருங்கள்.' },
      { q: 'யார் வேண்டுமானாலும் விண்ணப்பிக்கலாமா?', a: 'பதிவு செய்த டிரைவர்கள் மட்டுமே விண்ணப்பிக்க முடியும். வெரிஃபைட் டிரைவர்கள், வாகன வகை, ஊர், ரேட்டிங், முந்தைய வரலாறு படியும் வடிகட்டலாம்.' },
      { q: 'வாடிக்கையாளர் கொடுத்த தொகையை மறைக்க முடியுமா?', a: 'ஆம். டிரைவர் என்ன பார்க்கிறார் என்பதை நீங்கள் தேர்வு செய்கிறீர்கள்: முழு கட்டணம், டிரைவர் பேஅவுட், கமிஷன் மட்டும், பேச்சுவார்த்தை தொகை, அல்லது மறைக்கப்பட்ட வாடிக்கையாளர் கட்டணம்.' },
      { q: 'பல டிரிப்களை நிர்வகிக்க முடியுமா?', a: 'ஆம். ஒரே டாஷ்போர்டில் எல்லா டிரிப்களையும் கண்காணியுங்கள் — திறந்தது, ஒதுக்கப்பட்டது, நடைபெறுகிறது, முடிந்தது, கேன்சல், மூடப்பட்டது.' },
      { q: 'என் சொந்த டிரைவர்களை நிர்வகிக்க முடியுமா?', a: 'ஆம். உங்கள் சொந்த நம்பகமான டிரைவர் பூல், விருப்பமான டிரைவர்கள், தடுக்கப்பட்ட டிரைவர்கள், வழியின்படி டிரைவர் குழுக்களை உருவாக்குங்கள்.' },
      { q: 'இது ஒரு டாக்ஸி புக்கிங் ஆப்பா?', a: 'இல்லை. Trip King ஏஜெண்ட்கள் & இடைநகர டிரைவர்களுக்கான ஒரு டிரிப்-ஒதுக்கீடு & டிரைவர்-நிர்வாக அமைப்பு — பயணி ரைடு-ஹெய்லிங் ஆப் அல்ல.' },
      { q: 'ஒரு டிரிப்பை பல வாட்ஸ்அப் குழுக்களில் பகிரலாமா?', a: 'ஆம். அதே டிரிப் லிங்கை எந்த வாட்ஸ்அப் குழுவிலும் கைமுறையாகப் பகிருங்கள். லிங்கைக் கிளிக் செய்யும் டிரைவர்கள் Trip King வழியாக விண்ணப்பிக்கிறார்கள்.' },
      { q: 'டிரைவர் ஒதுக்கப்பட்ட பிறகு என்ன நடக்கும்?', a: 'டிரிப் ஒதுக்கப்பட்டது அல்லது மூடப்பட்டது எனக் குறிக்கப்படுகிறது. மற்ற டிரைவர்கள் அது இனி திறந்திருக்கவில்லை என்று பார்த்து விண்ணப்பிப்பதை நிறுத்துகிறார்கள்.' },
    ],
  },

  finalCta: {
    h: 'டிரிப்களை தொழில்முறையாக நிர்வகிக்க ஆரம்பியுங்கள்.',
    sub: 'ஒரு டிரிப்புடன் தொடங்குங்கள். உங்கள் வாட்ஸ்அப் குழுவில் பகிருங்கள். எத்தனை பதிவு செய்த டிரைவர்கள் விண்ணப்பிக்கிறார்கள் எனப் பாருங்கள்.',
    ctaPrimary: 'Trip King திறக்க',
    ctaWhatsapp: 'தொடங்க வாட்ஸ்அப் செய்யுங்கள்',
    footnote: 'தமிழ்நாடு டிராவல் ஏஜெண்ட்களுக்காக உருவாக்கப்பட்டது.',
  },

  takeaway:
    'Trip King ஏஜெண்ட்களை வாட்ஸ்அப் குழுக்களைத் தொடர்ந்து பயன்படுத்த அனுமதிக்கிறது — ஆனால் டிரிப் விண்ணப்பங்கள், டிரைவர் சரிபார்ப்பு, ஒதுக்கீடு, கண்காணிப்பு, தொகை தெரிவுநிலை, அனலிட்டிக்ஸ் அனைத்தையும் ஒரே தொழில்முறை அமைப்பில் நிர்வகிக்கிறது.',
};

export const AGENT_COPY: Record<AgentLang, AgentCopy> = { en, ta };

/** Sample WhatsApp trip post shown in the hero card (matches the in-app share). */
export function sampleWhatsAppPost(lang: AgentLang): string {
  return lang === 'ta'
    ? WA_TRIP([
        '🚕 டிரிப் கிடைக்கிறது',
        '',
        'சென்னை விமான நிலையம் → மதுரை',
        'பிக்கப்: நாளை காலை 5:00',
        'வாகனம்: இன்னோவா · AC',
        'கமிஷன்: ₹1,000',
        '',
        'Trip King வழியாக விண்ணப்பிக்கவும்:',
        '[டிரிப் லிங்க்]',
      ])
    : WA_TRIP([
        '🚕 Trip available',
        '',
        'Chennai Airport → Madurai',
        'Pickup: Tomorrow 5:00 AM',
        'Vehicle: Innova · AC',
        'Commission: ₹1,000',
        '',
        'Apply through Trip King:',
        '[Trip link]',
      ]);
}

/** WhatsApp number for "get started" CTA (digits only, with country code). */
export const WHATSAPP_NUMBER = '910000000000';
