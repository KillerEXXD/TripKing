import { useState } from 'react';
import { Bug } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BugReportModal } from '@/components/bug/BugReportModal';

/**
 * Floating "report a bug" button — visible only to admins and to users with
 * `can_report_bugs=true`. Lives in AppLayout so it shows on every authed page.
 * Muted grey + low opacity at idle so it never competes with primary content.
 */
export function BugReportFAB() {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated || !user) return null;
  if (user.role !== 'admin' && !user.canReportBugs) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Report a bug"
        title="Report a bug"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 flex size-11 items-center justify-center rounded-full bg-gray-500 text-white opacity-60 shadow-md hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Bug className="size-5" aria-hidden />
      </button>
      {open ? <BugReportModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export default BugReportFAB;
