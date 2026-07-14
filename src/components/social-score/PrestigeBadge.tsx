import { useState } from 'react';
import { Sparkles, Eye, Flame, Crown, Gem, Star } from 'lucide-react';
import { usePrestige } from '@/hooks/usePrestige';
import { PrestigeDetailsModal } from './PrestigeDetailsModal';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, eye: Eye, flame: Flame, crown: Crown, gem: Gem, star: Star,
};

interface Props {
  userId?: string | null;
  className?: string;
  showName?: boolean;
  /** Quando true, abre modal de detalhes ao clicar */
  interactive?: boolean;
  /** Mostra histórico no modal (apenas faz sentido para o próprio usuário) */
  showHistory?: boolean;
  size?: 'xs' | 'sm';
}

export function PrestigeBadge({
  userId, className, showName = true, interactive = false, showHistory = false, size = 'sm',
}: Props) {
  const { data } = usePrestige(userId);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const Icon = ICONS[data.badge_icon] ?? Sparkles;
  const glow = `hsl(${data.glow_color})`;
  const tooltip = data.next_name
    ? `${data.name} — faltam ${data.xp_to_next} pts para ${data.next_name}`
    : `${data.name} — nível máximo`;

  const sizeCls = size === 'xs'
    ? 'px-1.5 py-0 text-[10px] gap-0.5'
    : 'px-2 py-0.5 text-[11px] gap-1';
  const iconCls = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3';

  const Tag: any = interactive ? 'button' : 'span';

  return (
    <>
      <Tag
        type={interactive ? 'button' : undefined}
        onClick={interactive ? (e: any) => { e.preventDefault(); e.stopPropagation(); setOpen(true); } : undefined}
        className={cn(
          'inline-flex items-center rounded-full border transition-colors',
          interactive && 'hover:brightness-110 cursor-pointer',
          sizeCls,
          className,
        )}
        style={{
          color: glow,
          borderColor: `hsl(${data.glow_color} / 0.55)`,
          background: `hsl(${data.glow_color} / 0.10)`,
        }}
        title={tooltip}
      >
        <Icon className={iconCls} />
        {showName ? data.name : `Pres. ${data.rank}`}
      </Tag>
      {interactive && (
        <PrestigeDetailsModal
          open={open}
          onClose={() => setOpen(false)}
          userId={userId}
          showHistory={showHistory}
        />
      )}
    </>
  );
}
