/**
 * Visual mock cards for the Agents landing page — a WhatsApp trip post, the
 * agent dashboard summary, a comparison table, the trip-lifecycle pills, an
 * analytics card and a sample driver-applicant card. Pure presentational.
 */
import { Check, X, MessageCircle, Star, BadgeCheck, Car } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CompareRow } from './copy';

// ── WhatsApp trip post ──────────────────────────────────────────────────────

export function WhatsAppPostCard({ title, text }: { title: string; text: string }) {
  const lines = text.split('\n');
  return (
    <div className="w-full max-w-[300px]">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <MessageCircle className="size-3.5 text-emerald-600" />
        {title}
      </div>
      {/* phone-ish chat surface */}
      <div className="rounded-2xl bg-[#e5ddd5] p-3 shadow-sm ring-1 ring-black/5">
        {/* message bubble */}
        <div className="relative ml-auto max-w-[92%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[13px] leading-relaxed text-gray-800 shadow-sm">
          {lines.map((ln, i) =>
            ln === '' ? (
              <div key={i} className="h-2" />
            ) : ln.startsWith('[') ? (
              <div key={i} className="font-semibold text-emerald-700 underline">
                {ln}
              </div>
            ) : (
              <div key={i} className={i === 0 ? 'font-semibold' : undefined}>
                {ln}
              </div>
            ),
          )}
          <div className="mt-1 text-right text-[10px] text-gray-500">9:24 AM ✓✓</div>
        </div>
      </div>
    </div>
  );
}

// ── Agent dashboard summary ─────────────────────────────────────────────────

interface DashRow {
  label: string;
  tone?: 'default' | 'good' | 'accent' | 'done';
}

export function DashboardCard({ title, rows }: { title: string; rows: DashRow[] }) {
  return (
    <div className="w-full max-w-[300px]">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <span className="size-3.5 rounded-[3px] bg-emerald-600" />
        {title}
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <ul className="divide-y divide-gray-100">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-2.5 py-2 text-sm">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  r.tone === 'good' && 'bg-emerald-500',
                  r.tone === 'accent' && 'bg-amber-500',
                  r.tone === 'done' && 'bg-gray-900',
                  (!r.tone || r.tone === 'default') && 'bg-gray-300',
                )}
              />
              <span className={cn('text-gray-700', r.tone === 'done' && 'font-semibold text-gray-900')}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Comparison table ────────────────────────────────────────────────────────

export function CompareTable({
  leftLabel,
  rightLabel,
  rows,
}: {
  leftLabel: string;
  rightLabel: string;
  rows: CompareRow[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <div className="bg-gray-50 px-5 py-3 text-sm font-bold text-gray-500">{leftLabel}</div>
        <div className="bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800">{rightLabel}</div>
      </div>
      <ul>
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-1 border-t border-gray-100 sm:grid-cols-2">
            <div className="flex items-start gap-2 px-5 py-3 text-sm text-gray-500">
              <X className="mt-0.5 size-4 shrink-0 text-gray-300" />
              <span>{r.a}</span>
            </div>
            <div className="flex items-start gap-2 bg-emerald-50/40 px-5 py-3 text-sm text-gray-800">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <span>{r.b}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Trip lifecycle pills ────────────────────────────────────────────────────

export function LifecyclePills({ label, steps }: { label: string; steps: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium',
                i === steps.length - 1
                  ? 'bg-gray-900 text-white'
                  : i >= steps.length - 3
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-600',
              )}
            >
              {s}
            </span>
            {i < steps.length - 1 && <span className="text-gray-300">→</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Analytics card ──────────────────────────────────────────────────────────

export function AnalyticsCard({
  title,
  metrics,
}: {
  title: string;
  metrics: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-2xl bg-white p-4 ring-1 ring-gray-100">
            <div className="text-lg font-extrabold text-gray-900">{m.value}</div>
            <div className="mt-0.5 text-xs text-gray-500">{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sample driver-applicant card ────────────────────────────────────────────

export function DriverApplicantMini({
  name,
  rating,
  trips,
  vehicle,
  verified = true,
}: {
  name: string;
  rating: string;
  trips: string;
  vehicle: string;
  verified?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
        {name.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-gray-900">{name}</span>
          {verified && <BadgeCheck className="size-3.5 shrink-0 text-emerald-600" />}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-0.5">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {rating}
          </span>
          <span>· {trips} trips</span>
          <span className="inline-flex items-center gap-0.5">
            · <Car className="size-3" /> {vehicle}
          </span>
        </div>
      </div>
    </div>
  );
}
