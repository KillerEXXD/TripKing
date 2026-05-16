import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SwipeIndicatorProps {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
}

export function SwipeIndicator({ hasPrev, hasNext, onPrev, onNext, prevLabel, nextLabel }: SwipeIndicatorProps) {
  return (
    <div className="flex items-center justify-between px-4 pt-2 text-[12px] text-muted-foreground">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        className="inline-flex items-center gap-1 disabled:opacity-30"
        aria-label={`Previous column: ${prevLabel}`}
      >
        <ChevronLeft className="size-3.5" aria-hidden /> {prevLabel}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        className="inline-flex items-center gap-1 disabled:opacity-30"
        aria-label={`Next column: ${nextLabel}`}
      >
        {nextLabel} <ChevronRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

export default SwipeIndicator;
