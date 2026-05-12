import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { apiClient, ApiError } from '@/lib/api/client';
import { captureDataError, messageForError } from '@/lib/sentry';

/** Admin hub — reference data + operations (KYC, vehicle eligibility, translations, reviews moderation) + a diagnostics panel. */
export function AdministrationPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Administration</h1>
      <Card className="gap-1">
        <h2 className="font-semibold">Reference data</h2>
        <p className="text-sm text-secondary">
          Car types · fuel types · vehicle makes &amp; models · seat options · cities · languages · review tags ·
          cancellation reasons · app settings.
        </p>
        <Link to="/administration/config" className="text-sm text-primary underline">
          Open the configuration manager →
        </Link>
      </Card>
      <Card className="gap-1">
        <h2 className="font-semibold">Operations</h2>
        <ul className="mt-1 space-y-1 text-sm">
          <li>
            <Link to="/administration/kyc" className="text-primary underline">
              KYC review queue →
            </Link>
          </li>
          <li>
            <Link to="/administration/vehicles" className="text-primary underline">
              Vehicle-eligibility dashboard →
            </Link>
          </li>
          <li>
            <Link to="/administration/reviews" className="text-primary underline">
              Reviews moderation →
            </Link>
          </li>
          <li>
            <Link to="/administration/translations" className="text-primary underline">
              Translation manager →
            </Link>
          </li>
        </ul>
      </Card>
      <DiagnosticsCard />
    </main>
  );
}

/** Renders nothing — unless `crash`, in which case it throws on render (a deliberate diagnostic). */
function Crasher({ crash }: { crash: boolean }) {
  if (crash) throw new Error('diagnostic: deliberate render error from the admin panel');
  return null;
}

/** Buttons that deliberately exercise each layer of the exception pipeline. Admin-only (this whole page is). See docs/EXCEPTION_HANDLING.md. */
function DiagnosticsCard() {
  const [crash, setCrash] = useState(false);

  async function trigger500() {
    try {
      await apiClient.get('/debug/throw');
      toast.error('Expected the server to error, but it succeeded?');
    } catch (e) {
      if (e instanceof ApiError) toast.error(`Server error reported (${e.status} ${e.code ?? ''}). ${messageForError(e)}`);
      else toast.error(messageForError(e));
    }
  }

  function rejectPromise() {
    // No `.catch()` — handled by Sentry's global `unhandledrejection` hook + our L0 bridge.
    void Promise.reject(new Error('diagnostic: deliberate unhandled promise rejection from the admin panel'));
    toast.message('Rejected a promise — check Sentry / the console.');
  }

  async function triggerTransformError() {
    try {
      const { transformTrip } = await import('@/lib/api/transforms/trip');
      transformTrip({}); // missing required fields → throws TripTransformError
      toast.error('Expected a transform error, but none was thrown?');
    } catch (e) {
      captureDataError('diagnostic:transform', e);
      toast.error(`Transform error reported. ${messageForError(e)}`);
    }
  }

  return (
    <Card className="gap-2 border-amber-200 bg-amber-50">
      <h2 className="font-semibold text-amber-900">Diagnostics</h2>
      <p className="text-sm text-amber-800">
        Deliberately exercise the exception-handling pipeline (frontend → Sentry, and the edge functions → Sentry). The
        “render error” button replaces this page with the route-error fallback — navigate away to recover.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setCrash(true)}>
          Throw a render error
        </Button>
        <Button variant="outline" size="sm" onClick={rejectPromise}>
          Reject a promise
        </Button>
        <Button variant="outline" size="sm" onClick={() => void trigger500()}>
          Trigger a server 500
        </Button>
        <Button variant="outline" size="sm" onClick={() => void triggerTransformError()}>
          Trigger a transform error
        </Button>
      </div>
      <Crasher crash={crash} />
    </Card>
  );
}

export default AdministrationPage;
