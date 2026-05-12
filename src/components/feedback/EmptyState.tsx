import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  /** Headline, e.g. "No open trips". */
  title: string;
  /** Optional supporting line. */
  message?: string;
  /** Optional icon (defaults to an inbox). */
  icon?: ReactNode;
  /** Optional action (e.g. a "Post a trip" button). */
  action?: ReactNode;
}

/** Standard empty-list panel. Every list view renders this when the result set is empty. */
export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-black/10 p-8 text-center">
      <div className="text-secondary/60" aria-hidden>
        {icon ?? <Inbox className="size-7" />}
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        {message ? <p className="mt-1 text-sm text-secondary">{message}</p> : null}
      </div>
      {action}
    </div>
  );
}

export default EmptyState;
