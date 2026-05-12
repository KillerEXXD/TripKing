/**
 * Icon-key → lucide component map for the promo website.
 * Copy objects reference icons by string key (`copy.ts`); this resolves them.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Shield,
  ShieldCheck,
  ShieldQuestion,
  Navigation,
  Star,
  Languages,
  MessageSquareDashed,
  Wallet,
  BadgeCheck,
  Ghost,
  PhoneCall,
  MapPin,
  MapPinned,
  HandCoins,
  FilePlus2,
  CheckCircle2,
  KeyRound,
  BellRing,
  Ticket,
  Send,
  HelpCircle,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  shield: Shield,
  'shield-check': ShieldCheck,
  'shield-question': ShieldQuestion,
  navigation: Navigation,
  star: Star,
  languages: Languages,
  message: MessageSquareDashed,
  wallet: Wallet,
  badge: BadgeCheck,
  ghost: Ghost,
  phone: PhoneCall,
  'map-pin': MapPin,
  'map-pinned': MapPinned,
  'hand-coins': HandCoins,
  'file-plus': FilePlus2,
  'check-circle': CheckCircle2,
  'key-round': KeyRound,
  'bell-ring': BellRing,
  ticket: Ticket,
  send: Send,
};

export function iconFor(key: string): LucideIcon {
  return MAP[key] ?? HelpCircle;
}
