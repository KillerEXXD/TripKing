import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll hook for the promo website.
 *
 * Returns a `ref` to attach to an element and an `inView` flag that flips to
 * `true` the first time the element enters the viewport (and stays true).
 * Components use it to fade/translate content in — Tailwind transitions only,
 * no animation library. Respects `prefers-reduced-motion`: if the user opted
 * out of motion, `inView` starts `true` so content appears immediately.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; rootMargin?: string } = {},
): { ref: React.RefObject<T>; inView: boolean } {
  const ref = useRef<T>(null);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const [inView, setInView] = useState<boolean>(!!prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      {
        threshold: options.threshold ?? 0.15,
        rootMargin: options.rootMargin ?? '0px 0px -10% 0px',
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin, prefersReducedMotion]);

  return { ref, inView };
}

/** Convenience class string for a fade-up reveal. Pair with an inline
 *  `style={{ transitionDelay: '120ms' }}` for staggered children. */
export function revealClasses(inView: boolean): string {
  return [
    'transition-all duration-700 ease-out will-change-transform',
    inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6',
  ].join(' ');
}
