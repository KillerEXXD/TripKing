import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, Briefcase, Bug, Car, ChevronRight, Languages, LayoutDashboard, Palette, ShieldCheck, SlidersHorizontal, UserCheck, Users, Video, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { Card, SectionLabel } from '@/components/ui';
import { PageShell } from '@/components/layout';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import { getFirstName, initials } from '@/lib/utils';

interface AdminTile {
  to: string;
  title: string;
  desc: string;
  Icon: LucideIcon;
  tone: 'violet' | 'purple' | 'red' | 'amber' | 'blue' | 'sky' | 'teal' | 'orange' | 'emerald' | 'rose';
}

// The admin's home is the operations hub — everything under /administration, surfaced as tiles.
// Kept in sync with OPERATIONS_TILES + REFERENCE_TILE in `pages/administration/AdministrationPage.tsx`.
const ADMIN_TILES: AdminTile[] = [
  { to: '/app/administration/dashboard',   title: 'Platform dashboard',desc: 'Counts, fare totals, commission, monthly trip trend',                          Icon: LayoutDashboard,   tone: 'emerald' },
  { to: '/app/administration/config',      title: 'Reference data',    desc: 'Car types, fuel, makes & models, cities, languages, tags, app settings',      Icon: SlidersHorizontal, tone: 'violet'  },
  { to: '/app/administration/kyc',         title: 'KYC review queue',  desc: 'Verify drivers & agents — docs, video, approve / reject',                      Icon: ShieldCheck,       tone: 'purple'  },
  { to: '/app/administration/drivers',     title: 'Drivers',           desc: 'Search by name, phone, city — filter by KYC status',                           Icon: UserCheck,         tone: 'blue'    },
  { to: '/app/administration/agents',      title: 'Agents',            desc: 'Search by name, phone, business — filter by KYC status',                       Icon: Briefcase,         tone: 'sky'     },
  { to: '/app/administration/passengers',  title: 'Passengers',        desc: 'Search by name, phone, alias — see referrer and trip count',                   Icon: Users,             tone: 'teal'    },
  { to: '/app/administration/video-calls', title: 'Video call console',desc: 'Scheduled & in-progress video verifications — finalize KYC',                   Icon: Video,             tone: 'rose'    },
  { to: '/app/administration/vehicles',    title: 'Vehicles',          desc: 'Search by registration or driver — filter by eligibility and expiry status',   Icon: Car,               tone: 'orange'  },
  { to: '/app/administration/reviews',     title: 'Reviews moderation',desc: 'Flagged reviews — publish, hide, clear flags',                                  Icon: AlertTriangle,     tone: 'red'     },
  { to: '/app/administration/translations',title: 'Translation manager',desc: 'Per-language string coverage and overrides',                                  Icon: Languages,         tone: 'amber'   },
  { to: '/app/administration/bugs',        title: 'Bug tracker',       desc: 'Triage submitted bugs — status, comments, attachments',                        Icon: Bug,               tone: 'red'     },
  { to: '/app/administration/designs',     title: 'Design previews',   desc: 'Preview the 5 alternate UI directions — /v2 through /v6',                      Icon: Palette,           tone: 'purple'  },
];

const TONE: Record<AdminTile['tone'], string> = {
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

function Bellish({ count }: { count: number }) {
  return (
    <Link to="/app/notifications" aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'} className="relative flex size-7 items-center justify-center rounded-full text-secondary hover:bg-muted">
      <Bell className="size-4" aria-hidden />
      {count > 0 ? <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-destructive" /> : null}
    </Link>
  );
}

function ProfileAvatar({ name }: { name: string }) {
  return (
    <Link to="/app/profile" aria-label="Your profile" className="flex size-7 items-center justify-center overflow-hidden rounded-full border bg-primary/15 text-[11px] font-bold text-primary hover:ring-2 hover:ring-primary/40">
      <span>{name ? initials(name) : '?'}</span>
    </Link>
  );
}

function AdminTileCard({ tile }: { tile: AdminTile }) {
  return (
    <Link to={tile.to} className="flex flex-col gap-2 rounded-card bg-surface p-3.5 shadow-card transition-shadow hover:shadow-md">
      <span className={`flex size-9 items-center justify-center rounded-full ${TONE[tile.tone]}`}>
        <tile.Icon className="size-5" aria-hidden />
      </span>
      <div className="text-sm font-semibold leading-tight">{tile.title}</div>
      <div className="text-micro leading-snug text-muted-foreground">{tile.desc}</div>
    </Link>
  );
}

/**
 * `/` for an admin — the operations hub. Greeting + bell, then a tile grid for
 * everything under `/app/administration` (reference data, KYC, vehicle eligibility,
 * reviews moderation, translations), then a few marketplace shortcuts. (A driver
 * or agent gets their own home; an admin can preview those via the role switcher
 * at the top — see `HomeForRole`.)
 */
export function HomePage() {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount();
  const name = user?.displayName || user?.phone || 'Admin';
  // The admin home gets a bespoke greeting header (badge + bell + avatar) — too custom for the
  // generic <PageHeader>; lay it out as a sticky band that mirrors the redesign surface + shadow
  // so it visually matches the other pages.
  return (
    <PageShell>
      <header className="sticky top-0 z-10 -mx-4 mb-3 flex items-end justify-between gap-3 bg-surface px-4 py-3 shadow-header">
        <div className="min-w-0">
          <div className="text-micro text-muted-foreground">Welcome back</div>
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{getFirstName(user?.displayName ?? '') || user?.displayName || user?.phone || 'Admin'}</span>
            <span aria-label="Admin" title="Admin" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-accent text-[10px] font-bold text-white">Ad</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Bellish count={unread} />
          <ProfileAvatar name={name} />
        </div>
      </header>

      <div className="space-y-4">
        <section className="space-y-2">
          <SectionLabel className="px-1">Administration</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            {ADMIN_TILES.map((t) => (
              <AdminTileCard key={t.to} tile={t} />
            ))}
          </div>
        </section>

        <Card className="gap-2">
          <SectionLabel>Marketplace</SectionLabel>
          <p className="text-xs text-muted-foreground">Browse the live marketplace, or use the switcher above to act as a driver or an agent.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to="/app/trips" className="text-primary underline">Browse trips</Link>
            <Link to="/app/vacancies" className="text-primary underline">Vacant drivers</Link>
            <Link to="/app/posted-trips" className="text-primary underline">Posted trips</Link>
            <Link to="/app/notifications" className="text-primary underline">Notifications</Link>
          </div>
        </Card>

        <Link to="/app/administration" className="flex items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground">
          Full administration page <ChevronRight className="size-3.5" aria-hidden />
        </Link>

        <InstallAppCard dismissable />
      </div>
    </PageShell>
  );
}

export default HomePage;
