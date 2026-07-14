/**
 * PlayOutboundCTAs — CTAs leves de integração do Oculto Play com:
 *  - Canal VIP do criador (kind=vip_teaser)
 *  - Comunidade Oculta (kind=community_post; usa primeira tag como slug)
 *  - Perfil do autor (sempre disponível)
 *
 * Cada clique chama RPC oculto_play_track_outbound() para alimentar métricas.
 * Nada é exibido se o item não tiver os campos mínimos.
 */
import { useNavigate } from 'react-router-dom';
import { Crown, Users, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import type { OcultoPlayItem } from '@/hooks/useOcultoPlayContent';
import { cn } from '@/lib/utils';

interface Props {
  item: OcultoPlayItem;
  className?: string;
}

export function PlayOutboundCTAs({ item, className }: Props) {
  const navigate = useNavigate();

  const track = (
    target_kind: 'vip_channel' | 'community' | 'profile',
    target_id?: string,
  ) => {
    void (async () => {
      try {
        await supabase.rpc('oculto_play_track_outbound', {
          p_item_id: item.id,
          p_kind: target_kind,
          p_target_id: target_id ?? null,
        });
      } catch {
        /* noop */
      }
    })();
  };

  const ctas: React.ReactNode[] = [];

  if (item.kind === 'vip_teaser' && item.author_username) {
    ctas.push(
      <button
        key="vip"
        onClick={() => {
          track('vip_channel', item.author_id);
          navigate(`/creator/${item.author_username}?tab=vip`);
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-amber-500/15 text-amber-200 border border-amber-400/30 hover:bg-amber-500/25"
      >
        <Crown className="h-3.5 w-3.5" /> Ver Canal VIP
      </button>,
    );
  }

  if (item.kind === 'community_post' && item.tags?.length) {
    const slug = item.tags[0]?.toLowerCase().replace(/\s+/g, '-');
    if (slug) {
      ctas.push(
        <button
          key="community"
          onClick={() => {
            track('community', slug);
            navigate(`/comunidades/${slug}`);
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-violet-500/15 text-violet-200 border border-violet-400/30 hover:bg-violet-500/25"
        >
          <Users className="h-3.5 w-3.5" /> Entrar na comunidade
        </button>,
      );
    }
  }

  if (item.author_username) {
    ctas.push(
      <button
        key="profile"
        onClick={() => {
          track('profile', item.author_id);
          navigate(`/creator/${item.author_username}`);
        }}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-muted/40 text-foreground/80 border border-border/40 hover:bg-muted/60"
      >
        <UserRound className="h-3.5 w-3.5" /> Ver perfil
      </button>,
    );
  }

  if (ctas.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-2 pt-2', className)}>
      {ctas}
    </div>
  );
}
