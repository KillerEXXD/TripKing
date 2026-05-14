import type { SVGProps } from 'react';

/**
 * Browse-trips glyph for the driver's bottom-nav. Reads as "search trips" —
 * a small car in motion (puffs of smoke trailing left) with a magnifying lens
 * sitting above the hood. Single-stroke, `currentColor`.
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
      {/* Motion / smoke puffs trailing behind the car */}
      <path d="M1.2 14 q2 -0.8 3.5 0" />
      <path d="M1.2 17 q2 -0.8 3.5 0" />
      <path d="M2.4 20 q1.6 -0.8 3 0" />
      {/* Car body — windscreen slope + roof + boot */}
      <path d="M5 18.5 L6.8 13.5 L13 13.5 L15.6 16.5 L20.5 16.5 L20.5 20.5 L5 20.5 Z" strokeWidth="2" />
      {/* Wheels (filled so they pop) */}
      <circle cx="8.5" cy="20.8" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="20.8" r="1.4" fill="currentColor" stroke="none" />
      {/* Magnifying lens — above the car, slightly right of centre */}
      <circle cx="15.5" cy="6" r="3.6" strokeWidth="2" />
      <line x1="18.1" y1="8.6" x2="20.8" y2="11.3" strokeWidth="2" />
    </svg>
  );
}

export default BrowseTripsIcon;
