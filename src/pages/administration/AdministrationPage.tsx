import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Briefcase, Bug, Car, ChevronRight, Languages, LayoutDashboard,
  Palette, ShieldCheck, SlidersHorizontal, UserCheck, Users, Video, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Card } from '@/components/ui';
import { apiClient, ApiError } from '@/lib/api/client';
import { captureDataError, messageForError } from '@/lib/sentry';

interface AdminSectionTile {
  to: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
  tone: 'violet' | 'purple' | 'red' | 'amber' | 'blue' | 'sky' | 'teal' | 'orange' | 'emerald' | 'rose';
}

const REFERENCE_TILE: AdminSectionTile = {
  to: '/app/administration/config',
  title: 'Reference data',
  desc: 'Car types, fuel, makes & models, cities, languages, tags, app settings',
  Icon: SlidersHorizontal,
  tone: 'violet',
};

const OPERATIONS_TILES: AdminSectionTile[] = [
  { to: '/app/administration/dashboard',    title: 'Platform dashboard',         desc: 'Counts, fare totals, commission, monthly trip trend',           Icon: LayoutDashboard, tone: 'emerald' },
  { to: '/app/administration/kyc',          title: 'KYC review queue',           desc: 'Verify drivers & agents — docs, video, approve / reject',      Icon: ShieldCheck,     tone: 'purple'  },
  { to: '/app/administration/drivers',      title: 'Driver directory',           desc: 'Search by name, phone, city — filter by KYC status',           Icon: UserCheck,       tone: 'blue'    },
  { to: '/app/administration/agents',       title: 'Agent directory',            desc: 'Search by name, phone, business — filter by KYC status',       Icon: Briefcase,       tone: 'sky'     },
  { to: '/app/administration/passengers',   title: 'Passengers directory',       desc: 'Search by name, phone, alias — see referrer and trip count',   Icon: Users,           tone: 'teal'    },
  { to: '/app/administration/video-calls',  title: 'Video call console',         desc: 'Scheduled & in-progress video verifications — finalize KYC',   Icon: Video,           tone: 'rose'    },
  { to: '/app/administration/vehicles',     title: 'Vehicle eligibility',        desc: 'Search by registration or driver — filter by eligibility',     Icon: Car,             tone: 'orange'  },
  { to: '/app/administration/reviews',      title: 'Reviews moderation',         desc: 'Flagged reviews — publish, hide, clear flags',                  Icon: AlertTriangle,   tone: 'red'     },
  { to: '/app/administration/translations', title: 'Translation manager',        desc: 'Per-language string coverage and overrides',                   Icon: Languages,       tone: 'amber'   },
  { to: '/app/administration/bugs',         title: 'Bug tracker',                 desc: 'Triage submitted bugs — status, comments, attachments',         Icon: Bug,             tone: 'red'     },
  { to: '/app/administration/designs',      title: 'Design previews',             desc: 'Preview the 5 alternate UI directions — /v2 through /v6',      Icon: Palette,         tone: 'purple'  },
];

const TONE: Record<AdminSectionTile['tone'], string> = {
  violet:  'bg-violet-100 text-violet-700',
  purple:  'bg-purple-100 text-purple-700',
  red:     'bg-red-100 text-red-700',
  amber:   'bg-amber-100 text-amber-700',
  blue:    'bg-blue-100 text-blue-700',
  sky:     'bg-sky-100 text-sky-700',
  teal:    'bg-teal-100 text-teal-700',
  orange:  'bg-orange-100 text-orange-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  rose:    'bg-rose-100 text-rose-700',
};

function SectionTile({ tile }: { tile: AdminSectionTile }) {
  const { Icon } = tile;
  return (
    <Link to={tile.to} className="flex items-start gap-3 rounded-card bg-surface shadow-card p-3 transition-colors hover:border-primary/40">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${TONE[tile.tone]}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{tile.title}</span>
        <span className="block text-xs text-secondary">{tile.desc}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 self-center text-secondary" aria-hidden />
    </Link>
  );
}

/** Admin hub — reference data + operations (KYC, vehicle eligibility, translations, reviews moderation) + a diagnostics panel. */
export function AdministrationPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <Link to="/app" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <h1 className="text-2xl font-bold">Administration</h1>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">Reference data</h2>
        <SectionTile tile={REFERENCE_TILE} />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary">Operations</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPERATIONS_TILES.map((t) => <SectionTile key={t.to} tile={t} />)}
        </div>
      </section>

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
