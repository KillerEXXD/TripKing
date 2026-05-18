import { Copy, MessageCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { useReferral, type ReferralRole } from '@/hooks/useReferral';

interface Props {
  role: ReferralRole;
  /** Display name of the current user — appears in the header chip. */
  name?: string;
}

async function copy(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Couldn't copy — long-press to copy manually");
  }
}

/**
 * Hero referral block on `/app/referrals` — mirrors the tour-prototype layout:
 *   - emerald-tinted hero card with role-coloured avatar + code chip
 *   - 3 share buttons (copy code, WhatsApp, native Share)
 *   - 2 "Invite a Driver / Invite an Agent" CTAs that open WhatsApp pre-filled
 *
 * The code itself comes from `useReferral(role)` which reads `referralCode`
 * off `/app/drivers/me` or `/app/agents/me` — no fallback / mock value.
 */
export function ReferralCodeBlock({ role, name }: Props) {
  const { data, isLoading, isError } = useReferral(role);

  if (isLoading) return <LoadingSkeleton className="h-44" />;
  if (isError || !data) return null;

  const inviteUrl = data.whatsappUrl;
  // Display the share URL exactly like the prototype — drop the protocol +
  // the `?ref=` query for readability; the full link is still what gets copied.
  const shortDisplay = data.link.replace(/^https?:\/\//, '').replace(/\?ref=.*/, `/r/${data.code}`);

  async function share() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Join me on TripKing', text: data!.shareMessage, url: data!.link });
        return;
      } catch {
        // user cancelled or share denied — fall through to copy
      }
    }
    void copy(data!.link, 'Link');
  }

  return (
    <section
      aria-label="Your referral code"
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50 p-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-12 flex-none items-center justify-center rounded-full bg-emerald-200 text-2xl" aria-hidden>
          {role === 'driver' ? '🚗' : '📋'}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            {role === 'driver' ? 'Driver' : 'Agent'}{name ? ` · ${name}` : ''}
          </div>
          <div className="text-sm font-semibold text-slate-900">Your referral code</div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-white px-3 py-2.5">
        <div className="font-mono text-2xl font-bold tracking-wider text-emerald-700">{data.code}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-500">{shortDisplay}</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => void copy(data.code, 'Code')}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Copy size={14} aria-hidden /> Copy
        </button>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-2 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <MessageCircle size={14} aria-hidden /> WhatsApp
        </a>
        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Share2 size={14} aria-hidden /> Share
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-emerald-300 hover:bg-emerald-50"
        >
          <div className="font-semibold text-slate-900">🚗 Invite a Driver</div>
          <div className="mt-0.5 text-slate-600">Earn from their completed trips.</div>
        </a>
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-sky-300 hover:bg-sky-50"
        >
          <div className="font-semibold text-slate-900">📋 Invite an Agent</div>
          <div className="mt-0.5 text-slate-600">Earn from trips they post.</div>
        </a>
      </div>
    </section>
  );
}

export default ReferralCodeBlock;
