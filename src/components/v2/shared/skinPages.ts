/**
 * Canonical list of pages each prototype skin implements. Shared by:
 *   - AdminDesignsPage (the Pages tab + the Design-tab sub-route list)
 *   - SkinSwitcher (when ?nav=design, the chip rail renders page chips)
 *
 * Order is the navigation order shown in both places. Short `chipLabel` keeps
 * the SkinSwitcher rail within reach on a 430px viewport; longer `cardLabel`
 * fits AdminDesignsPage's wider rows.
 *
 * Trip detail (`/trips/:id`) is intentionally omitted — there's no real ID
 * to point at; users reach it by tapping a trip in the Trips list.
 */
export interface SkinPage {
  /** Sub-path appended to /vN. Empty string = home. */
  sub: string;
  /** Short label for the SkinSwitcher chip rail. */
  chipLabel: string;
  /** Full label for the AdminDesignsPage Pages tab + Design-tab sub-route lists. */
  cardLabel: string;
}

export const SKIN_PAGES: readonly SkinPage[] = [
  { sub: '',               chipLabel: 'Home',     cardLabel: 'Home (dashboard)' },
  { sub: '/trips',         chipLabel: 'Trips',    cardLabel: 'Trips list' },
  { sub: '/trips/new',     chipLabel: 'Post',     cardLabel: 'Post trip (form)' },
  { sub: '/profile',       chipLabel: 'Profile',  cardLabel: 'Profile' },
  { sub: '/my-trips',      chipLabel: 'My trips', cardLabel: 'My trips' },
  { sub: '/notifications', chipLabel: 'Alerts',   cardLabel: 'Notifications' },
  { sub: '/referrals',     chipLabel: 'Refer',    cardLabel: 'Referrals' },
  { sub: '/wallet',        chipLabel: 'Wallet',   cardLabel: 'Wallet' },
  { sub: '/scenarios',     chipLabel: 'Examples', cardLabel: 'Home cards + live tracking' },
] as const;
