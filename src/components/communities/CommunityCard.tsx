/**
 * CommunityCard — card grande, moderno e responsivo.
 * Mobile-first, flat (sem shadows pesados), pronto para grid 1/2/3/4 colunas.
 */
import { useEffect, useState } from 'react';
import { Users, Lock, Crown, Star, Globe, Sparkles, MessageSquare, Clock, LogIn, LogOut, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeTable } from '@/lib/realtimeBus';
import { useMyMembership, useJoinCommunity, useLeaveCommunity, type Community } from '@/hooks/useCommunities';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

function visibilityMeta(v: Community['visibility']) {
  switch (v) {
    case 'private':           return { label: 'Privada',   icon: Lock,     cls: 'bg-slate-900/70 text-slate-100 border-slate-600/40' };
    case 'premium_only':      return { label: 'Premium',   icon: Star,     cls: 'bg-cyan-900/60 text-cyan-100 border-cyan-500/40' };
    case 'vip_only':          return { label: 'VIP',       icon: Crown,    cls: 'bg-amber-900/60 text-amber-100 border-amber-500/40' };
    case 'creator_exclusive': return { label: 'Criadores', icon: Sparkles, cls: 'bg-pink-900/60 text-pink-100 border-pink-500/40' };
    default:                  return { label: 'Pública',   icon: Globe,    cls: 'bg-emerald-900/60 text-emerald-100 border-emerald-500/40' };
  }
}

function timeAgo(iso: string | null) {
  if (!iso) return 'sem atividade';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mês`;
}

interface CommunityCardProps {
  community: Community;
  onOpen: () => void;
  memberPreviews?: Array<{ user_id: string; avatar_url: string | null; username: string | null }>;
}

export function CommunityCard({ community, onOpen, memberPreviews }: CommunityCardProps) {
  const v = visibilityMeta(community.visibility);
  const VIcon = v.icon;
  const qc = useQueryClient();
  const { data: membership } = useMyMembership(community.id);
  const join = useJoinCommunity(community.id);
  const leave = useLeaveCommunity(community.id);
  const [leaving, setLeaving] = useState(false);

  // Tick a cada 60s para "timeAgo" re-renderizar sem F5
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Realtime: invalidar lista quando membros/tópicos mudam nesta comunidade
  useEffect(() => {
    const cid = community.id;
    const onChange = (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (!row || row.community_id !== cid) return;
      qc.invalidateQueries({ queryKey: ['oculto_communities_list'] });
      qc.invalidateQueries({ queryKey: ['oculto_communities_infinite'] });
      qc.invalidateQueries({ queryKey: ['oculto_community', cid] });
      qc.invalidateQueries({ queryKey: ['oculto_community_member_previews'] });
    };
    const unsubs = [
      subscribeTable('oculto_community_members', onChange),
      subscribeTable('oculto_community_topics', onChange),
      subscribeTable('oculto_community_replies', onChange),
    ];
    return () => unsubs.forEach((u) => u());
  }, [community.id, qc]);

  const isMember = membership?.status === 'active';
  const isPending = membership?.status === 'pending';
  const isOwner = membership?.role === 'owner';
  const isPrivate = community.visibility === 'private' || community.require_join_approval;

  const accent = community.accent_color || '#a855f7';

  return (
    <div
      className="group relative rounded-2xl border border-border/60 bg-card flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/20 focus-within:border-foreground/30"
      style={{ ['--accent' as any]: accent }}
    >
      {/* Faixa accent topo (sutil) */}
      <div className="absolute top-0 left-0 right-0 h-[2px] opacity-60 group-hover:opacity-100 transition-opacity rounded-t-2xl z-10" style={{ background: accent }} />

      {/* Capa — overflow-hidden só aqui, para não cortar o avatar */}
      <div
        className="relative h-24 sm:h-28 w-full overflow-hidden rounded-t-2xl"
        style={{
          background: community.cover_url
            ? undefined
            : `linear-gradient(135deg, ${accent}40, ${accent}10 60%, transparent)`,
        }}
      >
        {community.cover_url && (
          <img
            src={buildSupabaseImageThumb(community.cover_url, { width: 480, quality: 72 }) ?? community.cover_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />

        {/* Badges no topo */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${v.cls}`}>
            <VIcon className="h-3 w-3" /> {v.label}
          </span>
          <div className="flex gap-1">
            {community.is_official && (
              <Badge className="h-5 text-[10px] bg-amber-500/90 text-black px-1.5">Oficial</Badge>
            )}
            {community.is_featured && (
              <Badge className="h-5 text-[10px] bg-fuchsia-500/90 text-white px-1.5">Destaque</Badge>
            )}
            {community.is_adult && (
              <Badge className="h-5 text-[10px] bg-red-600/90 text-white px-1.5">+18</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Avatar sobreposto — FORA da capa para não ser cortado pelo overflow-hidden */}
      <div className="absolute left-3 top-[68px] sm:top-[80px] z-20">
        <div
          className="h-14 w-14 rounded-xl border-2 border-card flex items-center justify-center overflow-hidden transition-transform duration-200 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${accent}80)`,
            boxShadow: `0 0 0 2px ${accent}, 0 0 14px ${accent}99`,
          }}
        >
          {community.avatar_url ? (
            <img src={buildSupabaseImageThumb(community.avatar_url, { width: 112, height: 112, quality: 72, resize: 'cover' }) ?? community.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-center" />
          ) : (
            <Users className="h-6 w-6 text-white" />
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col p-3 pt-10">

        <h3 className="text-base font-semibold leading-tight line-clamp-1">{community.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
          {community.description || 'Sem descrição.'}
        </p>

        {/* Avatares de membros recentes */}
        {memberPreviews && memberPreviews.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {memberPreviews.slice(0, 3).map((m) => {
                const initial = (m.username ?? '?').trim().charAt(0).toUpperCase() || '?';
                return (
                  <div
                    key={m.user_id}
                    className="h-8 w-8 rounded-full border-2 border-card overflow-hidden bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground"
                    title={m.username ?? ''}
                  >
                    {m.avatar_url ? (
                      <img
                        src={m.avatar_url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover object-center"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {community.members_count > memberPreviews.length && (
              <span className="text-[10px] text-muted-foreground">
                +{community.members_count - memberPreviews.length}
              </span>
            )}
          </div>
        )}

        {/* Estatísticas */}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{community.members_count}</span>
          <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{community.topics_count}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(community.last_activity_at)}</span>
        </div>

        {/* Ações */}
        <div className="mt-3 flex gap-2">
          {isMember ? (
            <>
              <Button
                size="sm"
                className="flex-1 h-9 bg-green-600 hover:bg-green-500 text-white border-0 shadow-[0_0_0_1px_rgba(34,197,94,0.4)] transition-colors"
                onClick={onOpen}
              >
                Abrir <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
              {!isOwner && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 px-2"
                  disabled={leave.isPending || leaving}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLeaving(true);
                    leave.mutate(undefined, { onSettled: () => setLeaving(false) });
                  }}
                  title="Sair"
                >
                  {leave.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                </Button>
              )}
            </>
          ) : isPending ? (
            <Button size="sm" variant="outline" className="flex-1 h-9" disabled>
              Solicitação enviada
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="flex-1 h-9"
                disabled={join.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  join.mutate();
                }}
              >
                {join.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <LogIn className="h-3.5 w-3.5 mr-1" />
                    {isPrivate ? 'Solicitar' : 'Entrar'}
                  </>
                )}
              </Button>
              <Button size="sm" variant="outline" className="h-9 px-3" onClick={onOpen}>
                Ver
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
