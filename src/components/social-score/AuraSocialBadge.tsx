import { Sparkles } from 'lucide-react';
import { useSocialScore } from '@/hooks/useSocialScore';
import { cn } from '@/lib/utils';

export function AuraSocialBadge({ userId, className }: { userId?: string | null; className?: string }) {
  const { data } = useSocialScore(userId);
  if (!data) return null;
  const glow = `hsl(${data.glow_color})`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border',
        className,
      )}
      style={{
        color: glow,
        borderColor: `hsl(${data.glow_color} / 0.5)`,
        background: `hsl(${data.glow_color} / 0.1)`,
      }}
      title={`Aura Social — Nv ${data.level} ${data.level_name}`}
    >
      <Sparkles className="h-3 w-3" />
      Nv {data.level}
    </span>
  );
}
