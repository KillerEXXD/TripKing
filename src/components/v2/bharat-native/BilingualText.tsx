import type { ReactNode } from 'react';

interface BilingualTextProps {
  ta: string;
  en: string;
  as?: 'h1' | 'h2' | 'h3' | 'div';
  size?: 'lg' | 'md' | 'sm';
  className?: string;
}

const SIZE_MAP: Record<NonNullable<BilingualTextProps['size']>, { primary: string; secondary: string }> = {
  lg: { primary: 'text-[22px]', secondary: 'text-[13px]' },
  md: { primary: 'text-[17px]', secondary: 'text-[12px]' },
  sm: { primary: 'text-[14px]', secondary: 'text-[11px]' },
};

/**
 * Tamil-prominent bilingual heading. Tamil leads, English subtitle
 * underneath. Same layout, same colour token — the screen reads as one.
 */
export function BilingualText({ ta, en, as = 'div', size = 'md', className = '' }: BilingualTextProps) {
  const Tag: 'h1' | 'h2' | 'h3' | 'div' = as;
  const sizes = SIZE_MAP[size];
  const inner: ReactNode = (
    <>
      <span className={`block font-semibold leading-tight ${sizes.primary}`}>{ta}</span>
      <span className={`block leading-tight text-muted-foreground ${sizes.secondary}`}>{en}</span>
    </>
  );
  return <Tag className={className}>{inner}</Tag>;
}

export default BilingualText;
