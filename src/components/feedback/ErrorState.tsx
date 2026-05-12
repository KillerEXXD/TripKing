import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { messageForError } from '@/lib/sentry';

export interface ErrorStateProps {
  /** Short headline, e.g. "Couldn't load trips". */
  title?: string;
  /** Optional detail line. Ignored if `error` is given (we derive a friendly message from it). */
  message?: string;
  /** The thrown error — when present, the panel shows a category-derived message and (for ApiErrors) the HTTP status / code. */
  error?: unknown;
  /** Retry handler — renders a "Try again" button when provided. */
  onRetry?: () => void;
}

interface MaybeApiError {
  name?: string;
  status?: number;
  code?: string;
}

/** Standard error panel for a failed data view. Always offer a retry where possible. */
export function ErrorState({ title = 'Something went wrong', message, error, onRetry }: ErrorStateProps) {
  const detail = error !== undefined ? messageForError(error) : message;
  const api = error && typeof error === 'object' ? (error as MaybeApiError) : undefined;
  const showApiMeta = api?.name === 'ApiError' && typeof api.status === 'number' && api.status > 0;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
      <AlertTriangle className="size-6 text-red-500" aria-hidden />
      <div>
        <p className="font-semibold text-red-900">{title}</p>
        {detail ? <p className="mt-1 text-sm text-red-700">{detail}</p> : null}
        {showApiMeta ? (
          <p className="mt-1 text-xs text-red-700/70">
            {api?.status}
            {api?.code ? ` · ${api.code}` : ''}
          </p>
        ) : null}
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
