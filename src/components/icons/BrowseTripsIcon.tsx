import type { SVGProps } from 'react';

/**
 * Browse-trips glyph for the driver's bottom-nav. Reads as a fast-moving car
 * with smoke trailing behind it, plus a small magnifying lens at the bottom-
 * right corner as the "search" hint. The previous version put a big lens on
 * top of the car which read as a head + body silhouette (i.e. a person) at
 * the 28 px nav size — moving the lens to the corner (and oversizing the car)
 * fixes that. Single-stroke, `currentColor`.
 */
export function BrowseTripsIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* Smoke puffs — bold curves trailing left */}
      <path d="M0 9 q2.5 -1 5 0" strokeWidth="2" />
      <path d="M0 12.5 q2.5 -1 5 0" strokeWidth="2" />
      <path d="M0 16 q2.5 -1 5 0" strokeWidth="2" />
      {/* Car body — big, dominant. Roof at y=6, bonnet slope, body bottom at y=17. */}
      <path d="M3 17 L5.5 7 L11.5 7 L15.5 11.5 L20 11.5 L20 17 Z" strokeWidth="2.25" />
      {/* Wheels overlap the bottom of the body so the shape reads as a real car */}
      <circle cx="7" cy="18.5" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18.5" r="2" fill="currentColor" stroke="none" />
      {/* Magnifying lens — small, in the bottom-right corner, clearly separate
          from the car so it doesn't read as a head. Handle exits the frame. */}
      <circle cx="20.5" cy="20.2" r="1.8" strokeWidth="2" />
      <line x1="21.8" y1="21.5" x2="23.4" y2="23.1" strokeWidth="2.5" />
    </svg>
  );
}

export default BrowseTripsIcon;
