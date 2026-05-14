import type { SVGProps } from 'react';

/**
 * Custom "Find driver" glyph for the bottom-nav tab — combines three cues:
 *   1. A **steering wheel ring** (the dominant circle on the left).
 *   2. A **person bust** (head + rounded shoulders) inside the wheel — "the driver".
 *   3. A small **magnifying lens** at the bottom-right with a handle — "find / search".
 *
 * Lucide-style: 24×24 viewBox, single stroke colour driven by `currentColor`,
 * 1.75 stroke-width with round caps + joins. Accepts the same className the
 * rest of the bottom nav passes (e.g. `size-5`).
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
      {/* Steering wheel rim — encloses the driver figure */}
      <circle cx="9" cy="9" r="6.5" />
      {/* Driver head */}
      <circle cx="9" cy="7.5" r="1.6" />
      {/* Driver shoulders (rounded U inside the wheel) */}
      <path d="M5.5 11.5 a3.5 3.5 0 0 1 7 0" />
      {/* Magnifying lens — overlays bottom-right, suggesting "search" */}
      <circle cx="17.5" cy="17.5" r="3" />
      <line x1="19.7" y1="19.7" x2="22" y2="22" />
    </svg>
  );
}

export default FindDriverIcon;
