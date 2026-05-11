import { useState } from 'react';
import { iconFor } from './icons';
import { cn } from '@/lib/utils';

/**
 * A phone frame for the promo site.
 *
 * If `public/screenshots/<shot>.png` exists it's shown; otherwise a polished,
 * on-brand placeholder renders so the site looks finished today and silently
 * upgrades when real screenshots are dropped in. Generalised from the
 * `PhoneShot` helper in src/pages/ForAgentsPage.tsx.
 */
export function PhoneMockup({
  shot,
  label,
  icon = 'navigation',
  className,
  size = 'md',
}: {
  /** screenshot file stem under /public/screenshots/<shot>.png */
  shot: string;
  label: string;
  /** icon key (see ./icons) for the placeholder */
  icon?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [hasImg, setHasImg] = useState(true);
  const Icon = iconFor(icon);
  const widthClass =
    size === 'lg' ? 'max-w-[300px]' : size === 'sm' ? 'max-w-[210px]' : 'max-w-[260px]';

  return (
    <div className={cn('mx-auto w-full', widthClass, className)}>
      <div className="rounded-[2.2rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden ring-1 ring-black/5">
        {/* notch */}
        <div className="relative">
          <div className="absolute left-1/2 top-1.5 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-gray-900" />
          <div className="aspect-[9/19.5] bg-gradient-to-b from-emerald-50 via-white to-white relative">
            {hasImg ? (
              <img
                src={`/screenshots/${shot}.png`}
                alt={label}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setHasImg(false)}
              />
            ) : (
              <PlaceholderScreen Icon={Icon} label={label} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderScreen({
  Icon,
  label,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="absolute inset-0 flex flex-col">
      {/* status bar */}
      <div className="h-7 shrink-0" />
      {/* app header bar */}
      <div className="px-4 pt-1 pb-3 flex items-center gap-2">
        <span className="size-7 rounded-lg bg-emerald-600/90 flex items-center justify-center">
          <Icon className="size-3.5 text-white" />
        </span>
        <span className="text-[11px] font-bold text-gray-900">Trip King</span>
      </div>
      {/* hero label card */}
      <div className="mx-3 rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 p-3.5">
        <div className="flex items-center gap-2">
          <span className="size-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <Icon className="size-4 text-emerald-600" />
          </span>
          <div className="flex-1">
            <div className="text-[11px] font-semibold text-gray-800 leading-tight">{label}</div>
            <div className="text-[9px] text-gray-400">Trip King</div>
          </div>
        </div>
      </div>
      {/* skeleton list */}
      <div className="px-3 mt-3 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl bg-white shadow-sm ring-1 ring-gray-100 p-2.5">
            <div className="h-2 w-2/3 rounded bg-gray-200" />
            <div className="mt-1.5 h-2 w-1/3 rounded bg-gray-100" />
            <div className="mt-2 flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-amber-200" />
              <div className="h-1.5 w-10 rounded bg-gray-100" />
              <span className="ml-auto h-2.5 w-12 rounded-full bg-emerald-100" />
            </div>
          </div>
        ))}
      </div>
      {/* bottom CTA */}
      <div className="mt-auto px-3 pb-4">
        <div className="h-8 rounded-full bg-emerald-600/90 flex items-center justify-center">
          <div className="h-1.5 w-16 rounded bg-white/70" />
        </div>
      </div>
    </div>
  );
}

export default PhoneMockup;
