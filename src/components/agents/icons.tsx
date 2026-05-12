/**
 * Icon-key → lucide component map for the Agents landing page.
 * Copy objects reference icons by string key (`agents/copy.ts`).
 */
import type { LucideIcon } from 'lucide-react';
import {
  FilePlus2,
  Send,
  Users,
  ListChecks,
  Navigation,
  MessageSquareDashed,
  ShieldQuestion,
  FileX2,
  History,
  Layers,
  Workflow,
  EyeOff,
  BadgeCheck,
  LayoutDashboard,
  Star,
  Route,
  BarChart3,
  Contact,
  Clock,
  Shield,
  Lock,
  Briefcase,
  HelpCircle,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  'file-plus': FilePlus2,
  send: Send,
  users: Users,
  'list-checks': ListChecks,
  navigation: Navigation,
  message: MessageSquareDashed,
  'shield-question': ShieldQuestion,
  'file-x': FileX2,
  history: History,
  layers: Layers,
  scatter: Workflow,
  'eye-off': EyeOff,
  'badge-check': BadgeCheck,
  'layout-dashboard': LayoutDashboard,
  star: Star,
  route: Route,
  'bar-chart': BarChart3,
  'address-book': Contact,
  clock: Clock,
  shield: Shield,
  lock: Lock,
  briefcase: Briefcase,
};

export function agentIcon(key: string): LucideIcon {
  return MAP[key] ?? HelpCircle;
}
