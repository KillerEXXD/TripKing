import type { SVGProps } from 'react';

/**
 * Find-driver glyph for the agent + admin bottom-nav tab. Combines three cues,
 * each drawn prominently:
 *   1. **Steering wheel** — big ring with short spokes radiating in.
 *   2. **Person driving** — head + rounded shoulders inside the wheel.
 *   3. **Magnifying lens** — bottom-right with handle, suggesting search.
 *
 * Rendered at `size-7` in the nav (no label below, so the icon carries the
 * full message). Single-stroke, `currentColor`. Driver head is filled so the
 * centre stays visible at 16–20 px.
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
      {/* Steering wheel rim */}
      <circle cx="9" cy="9" r="7.5" strokeWidth="2" />
      {/* Spokes — three short ticks from the rim toward the hub */}
      <line x1="9" y1="2" x2="9" y2="3.4" />
      <line x1="2.5" y1="11.5" x2="3.8" y2="11" />
      <line x1="15.5" y1="11.5" x2="14.2" y2="11" />
      {/* Driver head (filled so the centre stays visible at 16–20 px) */}
      <circle cx="9" cy="7.4" r="1.7" fill="currentColor" stroke="none" />
      {/* Driver shoulders — wide arc inside the wheel */}
      <path d="M4.8 12.4 Q9 9.6 13.2 12.4" />
      {/* Magnifying lens — bottom-right, prominent */}
      <circle cx="18.5" cy="18.5" r="3.6" strokeWidth="2" />
      <line x1="21.1" y1="21.1" x2="23.5" y2="23.5" strokeWidth="2" />
    </svg>
  );
}

export default FindDriverIcon;
