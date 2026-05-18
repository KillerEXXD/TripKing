/**
 * Referral helpers — link + WhatsApp share URL builders. Pure functions; no
 * business logic. The `?ref=` query param is what `verify-otp` reads on the
 * new-user path to attach `users.referred_by_user_id`.
 */
const PUBLIC_BASE_URL = 'https://tripkingapp.com';

export function buildReferralLink(code: string): string {
  return `${PUBLIC_BASE_URL}/?ref=${encodeURIComponent(code)}`;
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildReferralShareMessage(code: string): string {
  const link = buildReferralLink(code);
  return `Join me on TripKing — outstation cab marketplace for drivers and trip managers. Use my code ${code} when you sign up: ${link}`;
}
