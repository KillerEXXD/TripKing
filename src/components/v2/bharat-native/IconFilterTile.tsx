import type { LucideIcon } from 'lucide-react';

interface IconFilterTileProps {
  icon: LucideIcon;
  ta: string;
  en: string;
  active?: boolean;
  onClick?: () => void;
}

/**
 * Square icon tile — large hit target. Indian super-app convention
 * (PhonePe / Rapido). Icon + bilingual label, no chrome until tapped.
 */
export function IconFilterTile({ icon: Icon, ta, en, active = false, onClick }: IconFilterTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-card p-3 transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'bg-surface text-foreground'
      }`}
    >
      <Icon className="size-5" aria-hidden />
      <div className="leading-tight">
        <div className="text-[12px] font-semibold">{ta}</div>
        <div className={`text-[10px] ${active ? 'opacity-80' : 'text-muted-foreground'}`}>{en}</div>
      </div>
    </button>
  );
}

export default IconFilterTile;
