import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

export interface ErrorStateProps {
  /** Short headline, e.g. "Couldn't load trips". */
  title?: string;
  /** Optional detail line. */
  message?: string;
  /** Retry handler — renders a "Try again" button when provided. */
  onRetry?: () => void;
}

/** Standard error panel for a failed data view. Always offer a retry where possible. */
export function ErrorState({ title = "Something went wrong", message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <AlertTriangle className="size-6 text-red-500" aria-hidden />
      <div>
        <p className="font-semibold text-red-900">{title}</p>
        {message ? <p className="mt-1 text-sm text-red-700">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export default ErrorState;
