import { describe, expect, it } from 'vitest';
import { buildReferralLink, buildReferralShareMessage, buildWhatsAppShareUrl } from '@/lib/referral';

describe('referral helpers', () => {
  it('buildReferralLink encodes the code as ?ref=', () => {
    expect(buildReferralLink('ABC12345')).toBe('https://trip-king.vercel.app/?ref=ABC12345');
  });

  it('buildWhatsAppShareUrl percent-encodes the message', () => {
    const url = buildWhatsAppShareUrl('hello world & friends');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).toContain('hello%20world%20%26%20friends');
  });

  it('buildReferralShareMessage embeds code + link', () => {
    const msg = buildReferralShareMessage('XYZ99');
    expect(msg).toContain('XYZ99');
    expect(msg).toContain('https://trip-king.vercel.app/?ref=XYZ99');
  });
});
