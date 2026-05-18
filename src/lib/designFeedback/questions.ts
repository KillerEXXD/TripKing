/**
 * Canonical question set for the in-app design-feedback questionnaire.
 *
 * One source of truth — imported by the questionnaire UI (for rendering
 * inputs) AND by the results dashboard (for labelling tallies). The
 * question `key` strings are persisted in the `design_feedback.preferences`
 * jsonb payload, so renaming a key is a data migration. The `prompt` text
 * is presentation only and can be edited freely.
 */

export const SKIN_VERSIONS = ['v2', 'v3', 'v4', 'v5', 'v6', 'v7'] as const;
export type SkinVersion = typeof SKIN_VERSIONS[number];

export interface PreferenceQuestion {
  /** Stable key persisted in jsonb. Format: `<pageKey>.<n>` or `<pageKey>.ship`. */
  key: string;
  /** Reviewer-facing question text. */
  prompt: string;
  /** Tagged when this is the page's forced "would you ship?" question. */
  forcedShip?: boolean;
}

export interface PreferencePage {
  /** URL-safe page slug (matches `/administration/designs/feedback/page/:page`). */
  pageKey: string;
  /** Sub-path under /vN/ that the launch buttons open. Empty = home. */
  sub: string;
  /** Display name (matches AdminDesignsPage card list). */
  label: string;
  /** Short body shown above the questions to set context. */
  intro?: string;
  /** Ordered questions for this page. */
  questions: PreferenceQuestion[];
}

export const PREFERENCE_PAGES: readonly PreferencePage[] = [
  {
    pageKey: 'home',
    sub: '',
    label: 'Home (dashboard)',
    questions: [
      { key: 'home.q1', prompt: 'A new driver opens the app for the first time. Which version helps them figure out what to do within 5 seconds?' },
      { key: 'home.q2', prompt: 'An agent has 3 trips needing action right now. Which version surfaces that without scrolling?' },
      { key: 'home.q3', prompt: 'Which version would a 55-year-old driver with limited English understand fastest?' },
      { key: 'home.q4', prompt: 'Which version handles "I have nothing scheduled today" most gracefully (not empty / depressing)?' },
      { key: 'home.ship', prompt: 'Which version would you ship as Home to a new user?', forcedShip: true },
    ],
  },
  {
    pageKey: 'trips',
    sub: '/trips',
    label: 'Trips list',
    questions: [
      { key: 'trips.q1', prompt: 'A driver scans 10+ trips deciding which to apply for. Which lets them decide fastest?' },
      { key: 'trips.q2', prompt: 'The payout (₹) is the #1 thing a driver looks at. Which version makes it most prominent?' },
      { key: 'trips.q3', prompt: 'Driver with bad eyesight, in sunlight. Which is most readable?' },
      { key: 'trips.q4', prompt: 'Which version best handles 100+ trips at scale (vs prototype\'s 4)?' },
      { key: 'trips.ship', prompt: 'Which version would you ship as Trips list?', forcedShip: true },
    ],
  },
  {
    pageKey: 'trip-detail',
    sub: '/trips',
    label: 'Trip detail',
    intro: 'Tap a trip card on the Trips list to drill into trip detail.',
    questions: [
      { key: 'trip-detail.q1', prompt: 'Driver at pickup asking passenger for the OTP. Which version makes that OTP readable in 2 seconds?' },
      { key: 'trip-detail.q2', prompt: 'Critical info hierarchy: OTP > pickup time > payout. Which version protects that order best?' },
      { key: 'trip-detail.q3', prompt: 'If the passenger is late, the driver gets anxious. Which version\'s CTAs (Call / Cancel / Start) feel calmest?' },
      { key: 'trip-detail.ship', prompt: 'Which version would you ship as Trip detail?', forcedShip: true },
    ],
  },
  {
    pageKey: 'post-trip',
    sub: '/trips/new',
    label: 'Post trip (form)',
    questions: [
      { key: 'post-trip.q1', prompt: 'An agent posting 5 trips/day. Which version is fastest for power users?' },
      { key: 'post-trip.q2', prompt: 'A first-time poster. Which version teaches what each field means best?' },
      { key: 'post-trip.q3', prompt: 'Which version\'s form would recover from errors most gracefully?' },
      { key: 'post-trip.ship', prompt: 'Which version would you ship as Post trip?', forcedShip: true },
    ],
  },
  {
    pageKey: 'my-trips',
    sub: '/my-trips',
    label: 'My trips',
    questions: [
      { key: 'my-trips.q1', prompt: 'Driver checking "which trips am I on?". Which version is fastest?' },
      { key: 'my-trips.q2', prompt: 'Which version distinguishes statuses (waiting / confirmed / not picked) most clearly?' },
      { key: 'my-trips.ship', prompt: 'Which version would you ship as My trips?', forcedShip: true },
    ],
  },
  {
    pageKey: 'notifications',
    sub: '/notifications',
    label: 'Notifications',
    questions: [
      { key: 'notifications.q1', prompt: 'Which version makes urgent notifications stand out from routine ones?' },
      { key: 'notifications.q2', prompt: 'Which version handles a high-volume inbox (50+ items) without overwhelming?' },
      { key: 'notifications.ship', prompt: 'Which version would you ship as Notifications?', forcedShip: true },
    ],
  },
  {
    pageKey: 'referrals',
    sub: '/referrals',
    label: 'Referrals',
    questions: [
      { key: 'referrals.q1', prompt: 'Which version makes "earn money by referring a friend" feel inviting (not spammy)?' },
      { key: 'referrals.q2', prompt: 'Which version makes sharing the code easiest?' },
      { key: 'referrals.ship', prompt: 'Which version would you ship as Referrals?', forcedShip: true },
    ],
  },
  {
    pageKey: 'wallet',
    sub: '/wallet',
    label: 'Wallet',
    questions: [
      { key: 'wallet.q1', prompt: 'Driver checking "how much can I withdraw?". Which is clearest?' },
      { key: 'wallet.q2', prompt: 'Which version makes Add money / Take money out most distinct (so the user doesn\'t tap the wrong one)?' },
      { key: 'wallet.ship', prompt: 'Which version would you ship as Wallet?', forcedShip: true },
    ],
  },
  {
    pageKey: 'scenarios',
    sub: '/scenarios',
    label: 'Scenarios (priority cards)',
    questions: [
      { key: 'scenarios.q1', prompt: 'Which version surfaces "you have 3 selections to book in 18 min" most urgently (without being alarming)?' },
      { key: 'scenarios.q2', prompt: 'Which version handles "live trip in progress · driver on the road" with the right emotional tone?' },
      { key: 'scenarios.q3', prompt: 'Which version\'s live-tracking visualization (the inline route map) is clearest?' },
      { key: 'scenarios.ship', prompt: 'Which version would you ship for these priority cards?', forcedShip: true },
    ],
  },
] as const;

/**
 * SUS — System Usability Scale (Brooke, 1986). Asked once per design.
 * 5-point Likert: 1 = Strongly disagree → 5 = Strongly agree.
 * `polarity` drives scoring: positive items use (score - 1), negative use (5 - score).
 * Sum × 2.5 → 0–100 (see sus.ts).
 */
export interface SusQuestion {
  index: number;       // 1-based; matches Brooke's published ordering
  prompt: string;
  polarity: 'positive' | 'negative';
}

export const SUS_QUESTIONS: readonly SusQuestion[] = [
  { index: 1,  polarity: 'positive', prompt: 'I think that I would like to use this design frequently.' },
  { index: 2,  polarity: 'negative', prompt: 'I found this design unnecessarily complex.' },
  { index: 3,  polarity: 'positive', prompt: 'I thought this design was easy to use.' },
  { index: 4,  polarity: 'negative', prompt: 'I think I would need the support of a technical person to use this design.' },
  { index: 5,  polarity: 'positive', prompt: 'I found the various functions in this design were well integrated.' },
  { index: 6,  polarity: 'negative', prompt: 'I thought there was too much inconsistency in this design.' },
  { index: 7,  polarity: 'positive', prompt: 'I would imagine that most people would learn to use this design very quickly.' },
  { index: 8,  polarity: 'negative', prompt: 'I found this design very cumbersome to use.' },
  { index: 9,  polarity: 'positive', prompt: 'I felt very confident using this design.' },
  { index: 10, polarity: 'negative', prompt: 'I needed to learn a lot of things before I could get going with this design.' },
] as const;

export interface CrossPageQuestion {
  key: string;
  prompt: string;
  /** 'pick-version' → reviewer picks one of v2..v7. 'text' → free text only. */
  kind: 'pick-version' | 'text';
}

export const CROSS_PAGE_QUESTIONS: readonly CrossPageQuestion[] = [
  { key: 'brand_fit',   kind: 'pick-version', prompt: 'Brand fit — does any one design feel like "TripKing the product"? Which?' },
  { key: 'consistency', kind: 'pick-version', prompt: 'Consistency — which design feels most cohesive across all 9 pages?' },
  { key: 'trust_most',  kind: 'pick-version', prompt: 'Trust — which design would you most trust with your phone number and money?' },
  { key: 'trust_least', kind: 'pick-version', prompt: 'Trust — and which one would you trust least?' },
  { key: 'india_fit',   kind: 'pick-version', prompt: 'Cultural fit — which feels most like an Indian fleet app (vs a generic global app)?' },
  { key: 'forced_ship', kind: 'pick-version', prompt: 'Forced ship — if you had to ship ONE direction today, knowing this is final, which would you pick?' },
  { key: 'notes',       kind: 'text',         prompt: 'Anything else worth saying?' },
] as const;

/** Pretty labels for each version — used by the results dashboard. */
export const VERSION_LABELS: Record<SkinVersion, string> = {
  v2: 'v2 Operator Console',
  v3: 'v3 Field Companion',
  v4: 'v4 Pipeline Board',
  v5: 'v5 Editorial',
  v6: 'v6 Bharat-Native',
  v7: 'v7 Simple Mode',
};
