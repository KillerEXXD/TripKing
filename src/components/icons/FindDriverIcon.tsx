import type { SVGProps } from 'react';

/**
 * Find-driver glyph for the agent + admin bottom-nav tab. Three cues:
 *   1. **Steering wheel** — big ring (fills the icon) with short spokes radiating in.
 *   2. **Person driving** — head + rounded shoulders inside the wheel.
 *   3. **Magnifying lens** — overlapping the lower-right of the wheel so the
 *      two shapes merge; the handle exits the bottom-right corner of the frame.
 *
 * Sized to match the + pill in the nav (size-12 / 48px). Single-stroke,
 * `currentColor`. Driver head is filled so the centre stays visible at small
 * sizes.
 */
export function FindDriverIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Steering wheel rim — fills the icon */}
      <circle cx="10" cy="10" r="8.5" strokeWidth="2.25" />
      {/* Spokes — three short ticks from the rim toward the hub */}
      <line x1="10" y1="1.7" x2="10" y2="3.3" />
      <line x1="1.7" y1="12.7" x2="3.3" y2="12.1" />
      <line x1="18.3" y1="12.7" x2="16.7" y2="12.1" />
      {/* Driver head — filled so the centre stays visible */}
      <circle cx="10" cy="8.2" r="1.9" fill="currentColor" stroke="none" />
      {/* Driver shoulders — wide arc inside the wheel */}
      <path d="M5.4 13.4 Q10 10.4 14.6 13.4" />
      {/* Magnifying lens — bigger, overlapping the lower-right of the wheel */}
      <circle cx="16" cy="16" r="4.5" strokeWidth="2.25" />
      {/* Handle — extends out of the bottom-right corner */}
      <line x1="19.2" y1="19.2" x2="22.7" y2="22.7" strokeWidth="2.5" />
    </svg>
  );
}

export default FindDriverIcon;
