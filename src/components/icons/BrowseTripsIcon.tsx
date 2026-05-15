import type { SVGProps } from 'react';

/**
 * Browse-trips glyph for the driver's bottom-nav. Reads as a fast-moving car
 * with smoke trailing behind it, plus a magnifying lens overlapping the
 * front-right wheel area as the "search" hint. The lens stays below the
 * car body so the silhouette still reads as a car (not a head + body / person).
 * Single-stroke, `currentColor`. Sized to match the + pill in the nav.
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
      {/* Magnifying lens — bigger, overlapping the front-bottom of the car
          (front wheel area) so the two shapes merge but it still reads as a
          car (not a head + body). Handle exits the bottom-right corner. */}
      <circle cx="17.5" cy="17.5" r="3.5" strokeWidth="2.25" />
      <line x1="20" y1="20" x2="22.8" y2="22.8" strokeWidth="2.5" />
    </svg>
  );
}

export default BrowseTripsIcon;
