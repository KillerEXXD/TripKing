import { formatINR } from '@/lib/utils';

/**
 * Big, tabular-nums fare display — sized for outdoor glance.
 */
export function FareNumeral({ amount, sublabel }: { amount: number; sublabel?: string }) {
  return (
    <div className="text-right" style={{ fontFeatureSettings: '"tnum" 1' }}>
      <div className="text-[40px] font-bold leading-none tracking-tight">{formatINR(amount)}</div>
      {sublabel ? <div className="mt-1 text-[12px] uppercase tracking-wide text-muted-foreground">{sublabel}</div> : null}
    </div>
  );
}

export default FareNumeral;
