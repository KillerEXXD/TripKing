import type { SVGProps } from 'react';

/**
 * Browse-trips glyph for the driver's bottom-nav. Reads as "search trips" —
 * a car in motion (bold smoke puffs trailing left) with a magnifying lens
 * sitting **on** the car's windscreen (the two shapes overlap, so the
 * silhouette reads as one). Single-stroke, `currentColor`. Designed to be
 * legible at the 28 px bigIcon size used by the nav.
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
      {/* Smoke puffs — bigger, bolder, trailing left of the car */}
      <path d="M0.5 13 q2.5 -1 5 0" strokeWidth="2" />
      <path d="M0.5 16 q2.5 -1 5 0" strokeWidth="2" />
      <path d="M1.5 19 q2 -1 4 0" strokeWidth="2" />
      {/* Car body — bigger, fills the lower 2/3 of the icon */}
      <path d="M5.5 19.5 L8 12 L14 12 L17.5 15.5 L21 15.5 L21 19.5 Z" strokeWidth="2.25" />
      {/* Wheels — bigger so they pop */}
      <circle cx="9" cy="20.3" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20.3" r="1.7" fill="currentColor" stroke="none" />
      {/* Magnifying lens — overlaps the windscreen so the two shapes merge */}
      <circle cx="13.5" cy="8" r="5" strokeWidth="2.25" />
      {/* Handle — heavy stroke to keep it readable at small sizes */}
      <line x1="17.2" y1="11.6" x2="20.5" y2="14.9" strokeWidth="2.5" />
    </svg>
  );
}

export default BrowseTripsIcon;
