import { memo } from 'react';

const MOOD_MAP: Record<string, { emoji: string; label: string; color: string }> = {
  calmo:      { emoji: '🌙', label: 'Calma',      color: '210 60% 70%' },
  popular:    { emoji: '⚡', label: 'Popular',    color: '50 90% 65%' },
  fervendo:   { emoji: '🔥', label: 'Fervendo',   color: '10 90% 65%' },
  misterioso: { emoji: '🌌', label: 'Misterioso', color: '270 70% 70%' },
  elite:      { emoji: '💎', label: 'Elite',      color: '180 80% 70%' },
};

interface Props {
  mood?: string | null;
  rising?: boolean;
  className?: string;
}

function AuraRoomMoodBadgeImpl({ mood, rising, className }: Props) {
  const m = MOOD_MAP[mood ?? 'calmo'] ?? MOOD_MAP.calmo;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className ?? ''}`}
      style={{
        color: `hsl(${m.color})`,
        borderColor: `hsl(${m.color} / 0.4)`,
        background: `hsl(${m.color} / 0.1)`,
      }}
      title={`Humor da sala: ${m.label}${rising ? ' · em ascensão' : ''}`}
    >
      <span aria-hidden>{m.emoji}</span>
      {m.label}
      {rising && <span className="ml-1 rounded-sm bg-fuchsia-500/30 px-1 text-[9px] text-fuchsia-100">🔥 alta</span>}
    </span>
  );
}

export const AuraRoomMoodBadge = memo(AuraRoomMoodBadgeImpl);
