import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Check, Copy, Gift, Palette, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useReferral, type ReferralRole } from '@/hooks/useReferral';
import { useAgentAnalytics, useDriverAnalytics } from '@/hooks/useAnalytics';
import { useAuth } from '@/contexts/AuthContext';
import { cn, formatINR } from '@/lib/utils';

/**
 * Three compact dashboard tiles laid out 3-up on the home screen:
 *   Earnings · Analytics · Referral
 *
 * Each tile uses the redesign accent palette (green / blue / purple)
 * with a left-border accent + tinted background — the same SectionCard
 * pattern, sized down for a tight grid. Referral exposes the user's
 * referral code inline with a copy-to-clipboard button; the tile
 * itself remains a tap target that navigates to /referrals.
 *
 * Used by both DriverHomePage and AgentHomePage. The role drives:
 *   - which analytics hook fires (driver vs agent)
 *   - which route the Earnings tile points to (/my-earnings vs the
 *     agent's analytics page, which also surfaces fare totals)
 *   - the analytics tile's stat (earned / trips for the driver, posted
 *     / payout for the agent)
 */
export function HomeTileRow({ role }: { role: ReferralRole }) {
  const referral = useReferral(role);

  const { user } = useAuth();
  // Server-evaluated feature flag — true iff the user's phone is in
  // public.design_preview_allowlist (admin-managed at /administration/config →
  // "Design preview allowlist"). Hidden by default for everyone else.
  const showDesignPreviews = user?.featureFlags?.designPreviews === true;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <EarningsTile role={role} />
        <AnalyticsTile role={role} />
        <ReferralTile code={referral.data?.code} link={referral.data?.link} />
      </div>
      {showDesignPreviews ? <DesignPreviewsTile /> : null}
    </div>
  );
}

interface TileFrameProps {
  accent: 'green' | 'blue' | 'purple';
  to: string;
  /** Top-left icon (1-line, ~size-4). */
  icon: React.ReactNode;
  /** Top-right action slot — Copy button on the Referral tile; null elsewhere. */
  action?: React.ReactNode;
  label: string;
  /** Big bold value line. */
  primary: React.ReactNode;
  /** Optional second line under the value, muted. */
  sub?: React.ReactNode;
  ariaLabel?: string;
}

// Token-driven tile palette. Each accent pair (--color-*-accent +
// --color-*-accent-light) defined in src/index.css drives the border, label
// colour, and bg in one consistent step — a future re-theme retints all three
// at once.
const ACCENT: Record<TileFrameProps['accent'], { border: string; label: string; bg: string }> = {
  green:  { border: 'border-l-green-accent',  label: 'text-green-accent',  bg: 'bg-green-accent-light'  },
  blue:   { border: 'border-l-blue-accent',   label: 'text-blue-accent',   bg: 'bg-blue-accent-light'   },
  purple: { border: 'border-l-purple-accent', label: 'text-purple-accent', bg: 'bg-purple-accent-light' },
};

function TileFrame({ accent, to, icon, action, label, primary, sub, ariaLabel }: TileFrameProps) {
  const tone = ACCENT[accent];
  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? label}
      className={cn(
        // shadow-card gives the tile real "rectangle on page" depth — the
        // tinted bg alone blends into the page surface and the tile reads as
        // just a left-edge accent curve.
        'flex min-w-0 flex-col gap-1 rounded-card border border-l-4 border-black/5 p-3 shadow-card transition-shadow hover:shadow-md',
        tone.border,
        tone.bg,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className={cn('flex items-center justify-center [&_svg]:size-4', tone.label)} aria-hidden>
          {icon}
        </span>
        {action ? <span className="shrink-0">{action}</span> : null}
      </div>
      <div className={cn('text-section-label font-bold uppercase tracking-wider', tone.label)}>{label}</div>
      <div className="truncate text-base font-bold leading-tight text-foreground">{primary}</div>
      {sub ? <div className="truncate text-micro text-muted-foreground">{sub}</div> : null}
    </Link>
  );
}

/**
 * Earnings tile — driver routes to /my-earnings (their per-trip payout
 * history), agent routes to /analytics (their posted-trip fare rollup,
 * which is where "earnings" lives for trip managers).
 */
function EarningsTile({ role }: { role: ReferralRole }) {
  const driver = useDriverAnalytics();
  const agent = useAgentAnalytics();
  if (role === 'driver') {
    const a = driver.data;
    return (
      <TileFrame
        accent="green"
        to="/app/my-earnings"
        icon={<Wallet />}
        label="Earnings"
        primary={a ? formatINR(a.earningsTotal) : '—'}
        sub={a ? `${a.tripsCompleted} trip${a.tripsCompleted === 1 ? '' : 's'}` : 'Tap to view'}
      />
    );
  }
  const a = agent.data;
  return (
    <TileFrame
      accent="green"
      to="/app/analytics"
      icon={<Wallet />}
      label="Earnings"
      primary={a ? formatINR(a.driverPayoutCompletedTotal) : '—'}
      sub={a ? `${a.tripsPosted} posted` : 'Tap to view'}
    />
  );
}

/**
 * Analytics tile — both roles route to /analytics, but the headline
 * stat differs: trips completed for drivers, trips posted for agents.
 */
function AnalyticsTile({ role }: { role: ReferralRole }) {
  const driver = useDriverAnalytics();
  const agent = useAgentAnalytics();
  if (role === 'driver') {
    const a = driver.data;
    return (
      <TileFrame
        accent="blue"
        to="/app/analytics"
        icon={<BarChart3 />}
        label="Analytics"
        primary={a ? String(a.tripsCompleted) : '—'}
        sub="Trips · trends"
      />
    );
  }
  const a = agent.data;
  return (
    <TileFrame
      accent="blue"
      to="/app/analytics"
      icon={<BarChart3 />}
      label="Analytics"
      primary={a ? String(a.tripsPosted) : '—'}
      sub="Trips · trends"
    />
  );
}

/**
 * Referral tile — surfaces the user's referral code inline with a
 * copy-to-clipboard button. The button stops propagation so tapping it
 * doesn't also navigate into /referrals (which the tile itself does
 * when the user taps anywhere else on the surface).
 */
function ReferralTile({ code, link }: { code?: string; link?: string }) {
  const [copied, setCopied] = useState(false);
  const hasCode = !!code;

  async function onCopy(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!hasCode) return;
    try {
      // Prefer copying the share link (more useful than the bare code in a
      // WhatsApp paste); fall back to the code when the link hasn't been
      // built yet (offline / first render).
      await navigator.clipboard.writeText(link ?? code!);
      setCopied(true);
      toast.success('Referral link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — long-press the code to copy manually");
    }
  }

  // Copy button sits inline next to the code so the referral tile reads as
  // {code} {Copy} on one row — easier to scan than a top-corner action.
  // The code is shrunk to text-sm + no extra tracking so 8-char codes like
  // "TKEJFZAB" fit in the 1/3-width tile without ellipsis truncation.
  const primary = (
    <span className="flex items-center gap-1">
      <code className="min-w-0 truncate font-mono text-sm leading-none">{code ?? '—'}</code>
      {hasCode ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Referral link copied' : 'Copy referral link'}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-surface text-purple-accent hover:brightness-95 [&_svg]:size-3"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </button>
      ) : null}
    </span>
  );

  return (
    <TileFrame
      accent="purple"
      to="/app/referrals"
      icon={<Gift />}
      label="Refer & earn"
      primary={primary}
      sub={hasCode ? undefined : 'Code generating…'}
      ariaLabel="Refer and earn"
    />
  );
}

/**
 * Full-width tile, shown ONLY to phones in `public.design_preview_allowlist`. Lets allowed
 * teammates jump straight to the design tour site to leave feedback on in-flight redesigns.
 * Toggle on/off per phone at /administration/config → "Design preview allowlist".
 *
 * Renders OUTSIDE the 3-up grid so the layout doesn't shift to a 4-up for the small
 * subset of users who see this. Amber accent keeps it visually distinct from the
 * primary green/blue/purple production tiles.
 */
function DesignPreviewsTile() {
  return (
    <Link
      to="/app/administration/designs"
      aria-label="Open design previews"
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-card border border-l-4 border-black/5 p-3 shadow-card transition-shadow hover:shadow-md',
        'border-l-amber-500 bg-amber-50',
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Palette className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Design previews</div>
        <div className="truncate text-sm font-medium text-foreground">Review the new designs &amp; leave feedback</div>
      </div>
      <span className="shrink-0 text-xs font-medium text-amber-700">Open →</span>
    </Link>
  );
}
