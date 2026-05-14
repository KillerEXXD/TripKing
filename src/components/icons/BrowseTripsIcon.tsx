import type { SVGProps } from 'react';

/**
 * Browse-trips glyph for the driver's bottom-nav. Reads as "search trips":
 * a hatchback-style car in motion (puffs trailing behind), with a small
 * magnifying lens at the bottom-right corner — as if you're zooming in on
 * the car. Single-stroke, `currentColor`, fills the 24×24 viewBox top-to-bottom
 * so the icon centres cleanly inside its tab cell.
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
      {/* Smoke puffs trailing behind the car — three small horizontal squiggles */}
      <path d="M0.8 8.5 q1.3 -0.6 2.5 0" />
      <path d="M0.5 12 q1.5 -0.6 3 0" />
      <path d="M1 15.5 q1.3 -0.6 2.5 0" />
      {/* Car body — hatchback silhouette filling the centre of the viewBox.
          Trunk → roof → windshield → hood → bumper → rocker. */}
      <path
        d="M3.5 17 L3.5 13.5 L6 9 L14.5 9 L17.5 13.5 L21.5 13.5 L21.5 17 Z"
        strokeWidth="2"
      />
      {/* Wheels — filled so they pop, slightly proud of the rocker line */}
      <circle cx="7" cy="18" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="17" cy="18" r="1.7" fill="currentColor" stroke="none" />
      {/* Cabin pillar — subtle tick to read the car as a car, not a box */}
      <line x1="10" y1="9.5" x2="10" y2="13" />
      {/* Magnifying lens — bottom-right, overlapping the front bumper area */}
      <circle cx="19" cy="20" r="2.8" strokeWidth="2" />
      <line x1="21" y1="22" x2="23" y2="23.5" strokeWidth="2" />
    </svg>
  );
}

export default BrowseTripsIcon;
