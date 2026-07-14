/**
 * CommunityPlayStrip — Etapa 8
 *
 * Faixa horizontal de itens do OCULTO PLAY ancorados a uma comunidade
 * (oculto_play_items.source_community_id). Aparece somente se o usuário
 * tem acesso ao PLAY e existem itens.
 */
import { Link } from 'react-router-dom';
import { Play, Music, Image as ImageIcon, Video, Crown, Users, Trophy } from 'lucide-react';
import { useOcultoPlayForCommunity } from '@/hooks/useOcultoPlayDiscovery';

const KIND_ICON: Record<string, React.ElementType> = {
  short_video: Video,
  meme: ImageIcon,
  audio: Music,
  vip_teaser: Crown,
  community_post: Users,
  challenge: Trophy,
};

interface Props {
  communityId: string;
  accentColor?: string;
}

export function CommunityPlayStrip({ communityId, accentColor }: Props) {
  const { data: items, isLoading } = useOcultoPlayForCommunity(communityId, 10);
  if (isLoading) return null;
  if (!items || items.length === 0) return null;

  const accent = accentColor || '#a855f7';

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-lg text-white"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}aa)` }}
          >
            <Play className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-bold leading-none">Em destaque no PLAY</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Conteúdo rápido ligado a esta comunidade
            </p>
          </div>
        </div>
        <Link
          to="/play"
          className="text-[10px] uppercase tracking-wide font-semibold hover:underline"
          style={{ color: accent }}
        >
          Ver tudo
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
        {items.map((it) => {
          const Icon = KIND_ICON[it.kind] ?? Play;
          return (
            <Link
              key={it.id}
              to="/play"
              className="shrink-0 w-24 rounded-lg overflow-hidden border border-border/60 bg-background hover:border-fuchsia-500/40 transition-colors"
            >
              <div className="relative aspect-[3/4] bg-black/40">
                {it.thumb_url || it.media_url ? (
                  <img
                    src={it.thumb_url || it.media_url!}
                    alt={it.title ?? ''}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                    <Icon className="h-6 w-6" />
                  </div>
                )}
                <span className="absolute top-1 left-1 text-[9px] bg-black/55 text-white px-1 py-0.5 rounded flex items-center gap-0.5 backdrop-blur-sm">
                  <Icon className="h-2.5 w-2.5" />
                </span>
              </div>
              {it.title && (
                <p className="text-[10px] line-clamp-2 px-1.5 py-1 text-foreground/90">
                  {it.title}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
