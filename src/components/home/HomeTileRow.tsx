import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Check, Copy, Gift, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useReferral, type ReferralRole } from '@/hooks/useReferral';
import { useAgentAnalytics, useDriverAnalytics } from '@/hooks/useAnalytics';
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

  return (
    <div className="grid grid-cols-3 gap-2">
      <EarningsTile role={role} />
      <AnalyticsTile role={role} />
      <ReferralTile code={referral.data?.code} link={referral.data?.link} />
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
        'flex min-w-0 flex-col gap-1 rounded-card border-l-4 p-3 transition-shadow hover:shadow-card',
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
        to="/my-earnings"
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
      to="/analytics"
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
        to="/analytics"
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
      to="/analytics"
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
  const primary = (
    <span className="flex items-center gap-1.5">
      <code className="truncate font-mono tracking-wider">{code ?? '—'}</code>
      {hasCode ? (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Referral link copied' : 'Copy referral link'}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-purple-accent hover:brightness-95 [&_svg]:size-3"
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </button>
      ) : null}
    </span>
  );

  return (
    <TileFrame
      accent="purple"
      to="/referrals"
      icon={<Gift />}
      label="Refer & earn"
      primary={primary}
      sub={hasCode ? undefined : 'Code generating…'}
      ariaLabel="Refer and earn"
    />
  );
}
