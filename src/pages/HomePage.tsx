import { Link } from 'react-router-dom';
import { AlertTriangle, Bell, Briefcase, Bug, Car, ChevronRight, Languages, LayoutDashboard, ShieldCheck, SlidersHorizontal, UserCheck, Users, Video, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { Badge, Card } from '@/components/ui';
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
  { to: '/administration/dashboard',   title: 'Platform dashboard',desc: 'Counts, fare totals, commission, monthly trip trend',                          Icon: LayoutDashboard,   tone: 'emerald' },
  { to: '/administration/config',      title: 'Reference data',    desc: 'Car types, fuel, makes & models, cities, languages, tags, app settings',      Icon: SlidersHorizontal, tone: 'violet'  },
  { to: '/administration/kyc',         title: 'KYC review queue',  desc: 'Verify drivers & agents — docs, video, approve / reject',                      Icon: ShieldCheck,       tone: 'purple'  },
  { to: '/administration/drivers',     title: 'Drivers',           desc: 'Search by name, phone, city — filter by KYC status',                           Icon: UserCheck,         tone: 'blue'    },
  { to: '/administration/agents',      title: 'Agents',            desc: 'Search by name, phone, business — filter by KYC status',                       Icon: Briefcase,         tone: 'sky'     },
  { to: '/administration/passengers',  title: 'Passengers',        desc: 'Search by name, phone, alias — see referrer and trip count',                   Icon: Users,             tone: 'teal'    },
  { to: '/administration/video-calls', title: 'Video call console',desc: 'Scheduled & in-progress video verifications — finalize KYC',                   Icon: Video,             tone: 'rose'    },
  { to: '/administration/vehicles',    title: 'Vehicles',          desc: 'Search by registration or driver — filter by eligibility and expiry status',   Icon: Car,               tone: 'orange'  },
  { to: '/administration/reviews',     title: 'Reviews moderation',desc: 'Flagged reviews — publish, hide, clear flags',                                  Icon: AlertTriangle,     tone: 'red'     },
  { to: '/administration/translations',title: 'Translation manager',desc: 'Per-language string coverage and overrides',                                  Icon: Languages,         tone: 'amber'   },
  { to: '/administration/bugs',        title: 'Bug tracker',       desc: 'Triage submitted bugs — status, comments, attachments',                        Icon: Bug,               tone: 'red'     },
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
    <Link to="/notifications" aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'} className="relative -mr-1 flex size-9 items-center justify-center rounded-full text-secondary hover:bg-muted">
      <Bell className="size-5" aria-hidden />
      {count > 0 ? <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" /> : null}
    </Link>
  );
}

function ProfileAvatar({ name }: { name: string }) {
  return (
    <Link to="/profile" aria-label="Your profile" className="flex size-9 items-center justify-center overflow-hidden rounded-full border bg-primary/15 text-sm font-bold text-primary hover:ring-2 hover:ring-primary/40">
      <span>{name ? initials(name) : '?'}</span>
    </Link>
  );
}

function AdminTileCard({ tile }: { tile: AdminTile }) {
  return (
    <Link to={tile.to} className="flex flex-col gap-2 rounded-2xl border bg-white p-3.5 transition-colors hover:border-primary/40">
      <span className={`flex size-9 items-center justify-center rounded-full ${TONE[tile.tone]}`}>
        <tile.Icon className="size-5" aria-hidden />
      </span>
      <div className="text-sm font-semibold leading-tight">{tile.title}</div>
      <div className="text-[11px] leading-snug text-secondary">{tile.desc}</div>
    </Link>
  );
}

/**
 * `/` for an admin — the operations hub. Greeting + bell, then a tile grid for
 * everything under `/administration` (reference data, KYC, vehicle eligibility,
 * reviews moderation, translations), then a few marketplace shortcuts. (A driver
 * or agent gets their own home; an admin can preview those via the role switcher
 * at the top — see `HomeForRole`.)
 */
export function HomePage() {
  const { user } = useAuth();
  const unread = useUnreadNotificationCount();
  return (
    <div>
      <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs text-secondary">Welcome back</div>
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{getFirstName(user?.displayName ?? '') || user?.displayName || user?.phone || 'Admin'}</span>
            <Badge variant="info">Admin</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Bellish count={unread} />
          <ProfileAvatar name={user?.displayName || user?.phone || 'Admin'} />
        </div>
      </header>

      <div className="space-y-4 px-4 pb-4 pt-3">
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold">Administration</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {ADMIN_TILES.map((t) => (
              <AdminTileCard key={t.to} tile={t} />
            ))}
          </div>
        </section>

        <Card className="gap-2">
          <h2 className="text-sm font-semibold">Marketplace</h2>
          <p className="text-xs text-secondary">Browse the live marketplace, or use the switcher above to act as a driver or an agent.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link to="/trips" className="text-primary underline">Browse trips</Link>
            <Link to="/vacancies" className="text-primary underline">Vacant drivers</Link>
            <Link to="/posted-trips" className="text-primary underline">Posted trips</Link>
            <Link to="/notifications" className="text-primary underline">Notifications</Link>
          </div>
        </Card>

        <Link to="/administration" className="flex items-center gap-1 px-1 text-xs text-secondary hover:text-foreground">
          Full administration page <ChevronRight className="size-3.5" aria-hidden />
        </Link>

        <InstallAppCard dismissable />
      </div>
    </div>
  );
}

export default HomePage;
