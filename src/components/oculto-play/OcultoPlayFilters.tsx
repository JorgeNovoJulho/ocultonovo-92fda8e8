/**
 * OcultoPlayFilters — pílulas de filtro: Para Você / Seguindo / Vídeos / Memes / Áudios /
 * VIP / Comunidades / Em Alta. Não monta queries — é puramente UI controlada.
 */
import { cn } from '@/lib/utils';
import { useOcultoPlayConfig } from '@/hooks/useOcultoPlayAccess';

export type OcultoPlayFilterId =
  | 'foryou'
  | 'following'
  | 'short_video'
  | 'meme'
  | 'audio'
  | 'vip_teaser'
  | 'community_post'
  | 'link'
  | 'trending';

interface Props {
  active: OcultoPlayFilterId;
  onChange: (id: OcultoPlayFilterId) => void;
}

export function OcultoPlayFilters({ active, onChange }: Props) {
  const { data: cfg } = useOcultoPlayConfig();

  const all: { id: OcultoPlayFilterId; label: string; show: boolean }[] = [
    { id: 'foryou', label: 'Para Você', show: true },
    { id: 'following', label: 'Seguindo', show: true },
    { id: 'short_video', label: 'Vídeos', show: cfg?.short_videos_on !== false },
    { id: 'meme', label: 'Memes', show: cfg?.memes_on !== false },
    { id: 'audio', label: 'Áudios', show: !!cfg?.audios_on },
    { id: 'vip_teaser', label: 'VIP', show: cfg?.vip_teasers_on !== false },
    { id: 'community_post', label: 'Comunidades', show: cfg?.communities_on !== false },
    { id: 'link', label: 'Links', show: true },
    { id: 'trending', label: 'Em Alta', show: true },
  ];


  const visible = all.filter((f) => f.show);

  return (
    <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
      {visible.map((f) => {
        const isActive = active === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
              isActive
                ? 'bg-fuchsia-500/20 border-fuchsia-400/60 text-fuchsia-100'
                : 'bg-card/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/40',
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
