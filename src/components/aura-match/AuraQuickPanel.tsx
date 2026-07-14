import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Heart, Star, X, MessageCircle, User, Sparkles, MapPin, Users, ImageOff, Swords, Heart as HeartIcon, Zap, Megaphone, Loader2, CheckCircle2, AlertTriangle, Timer, Ban, MapPinOff, Tag } from 'lucide-react';
import type { PairCard } from '@/hooks/usePerfectPair';
import { useNavigate } from 'react-router-dom';
import { isPlaceholderMedia } from '@/lib/placeholderMedia';
import { useAuraDuels } from '@/hooks/useAuraDuels';
import { useAuraBond } from '@/hooks/useAuraBond';
import { useAuraAttention } from '@/hooks/useAuraAttention';
import { supabase } from '@/lib/supabaseExternal';
import { resolveUserUnavailability, notifyUserToRegularize, type UnavailabilityResult } from '@/lib/auraRoomRequirements';
import { geocodeCity, haversineKm } from '@/lib/cityGeocode';
import { toast } from 'sonner';
import { useEffect, useRef, useState } from 'react';

interface Props {
  card: PairCard | null;
  score: number;
  /** Afinidade real (Jaccard de tags) — mesmo cálculo do perfil e salas. */
  realScore?: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSwipe: (id: string, action: 'like' | 'dislike' | 'superlike') => void;
  /** Se definido, substitui a ação de superlike (para abrir modal de pagamento) */
  onSuperLikeRequest?: (card: PairCard) => void;
}

const profileTypeLabel = (t?: string | null, gender?: string | null): string => {
  const v = (t || '').toLowerCase();
  if (v === 'couple' || v === 'casal') return 'Casal';
  if (v === 'trans' || v === 'travesti' || v === 'transex') return 'Trans';
  if (v === 'group' || v === 'grupo') return 'Grupo';
  // Single / solo / individual / vazio: usa gender
  const g = (gender || '').toLowerCase();
  if (['m', 'male', 'masculino', 'homem', 'man'].includes(g)) return 'Homem';
  if (['f', 'female', 'feminino', 'mulher', 'woman'].includes(g)) return 'Mulher';
  if (g.includes('trans')) return 'Trans';
  if (v === 'single' || v === 'solo') return 'Solo';
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : '—';
};

function ActionTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={6}
        collisionPadding={12}
        className="max-w-[180px] whitespace-normal break-words text-center text-[11px] leading-snug"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

type AttStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; cost: number; remaining: number }
  | { kind: 'cooldown'; secondsLeft: number }
  | { kind: 'insufficient'; balance: number; cost: number }
  | { kind: 'error'; message: string };

function formatCooldown(s: number): string {
  if (s <= 0) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

export function AuraQuickPanel({ card, score, realScore, open, onOpenChange, onSwipe, onSuperLikeRequest }: Props) {
  const navigate = useNavigate();
  const { challenge, busy: duelBusy } = useAuraDuels();
  const { create: createBond, busy: bondBusy } = useAuraBond();
  const [actionBusy, setActionBusy] = useState(false);
  const [auraLevel, setAuraLevel] = useState<number | null>(null);
  const [auraXp, setAuraXp] = useState<number | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<UnavailabilityResult | null>(null);
  const [attStatus, setAttStatus] = useState<AttStatus>({ kind: 'idle' });
  const [metaLoading, setMetaLoading] = useState(false);
  // Distância aproximada via centroide das cidades (fallback quando falta GPS).
  const [approxDistanceKm, setApproxDistanceKm] = useState<number | null>(null);
  const [approxResolving, setApproxResolving] = useState(false);
  // Ref para o container do dialog — usada para resetar o scroll ao topo ao abrir.
  const contentRef = useRef<HTMLDivElement | null>(null);

  const {
    costXp: attentionCost,
    balanceXp: attentionBalance,
    hasEnough: attentionHasEnough,
    cooldownLeft: attentionCooldown,
    sendAttention,
    busy: attentionBusy,
    refreshStatus: refreshAttentionStatus,
  } = useAuraAttention(targetUserId);

  // Carrega aura_level/aura_xp e user_id do alvo + checa indisponibilidade
  useEffect(() => {
    if (!open || !card?.id) {
      setAuraLevel(null); setAuraXp(null); setTargetUserId(null);
      setUnavailable(null);
      setAttStatus({ kind: 'idle' });
      setMetaLoading(false);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    (async () => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('aura_level, aura_xp, user_id')
        .eq('id', card.id)
        .maybeSingle();
      if (!cancelled && data) {
        setAuraLevel((data as any).aura_level ?? null);
        setAuraXp((data as any).aura_xp ?? null);
        setTargetUserId((data as any).user_id ?? null);
      }
      // checagem completa de indisponibilidade
      const status = await resolveUserUnavailability(card.id);
      if (cancelled) return;
      setUnavailable(status.unavailable ? status : null);
      // Notifica usuário a regularizar (somente se for cadastro incompleto e tivermos uid)
      if (status.unavailable) {
        notifyUserToRegularize(status.userId, status.code);
      }
      if (!cancelled) setMetaLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, card?.id]);

  // Reseta scroll ao topo sempre que abre / troca de card (evita topo cortado).
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    requestAnimationFrame(() => { try { el.scrollTop = 0; } catch {} });
  }, [open, card?.id]);

  // Distância APROXIMADA via centroide de cidade — só quando não há GPS preciso.
  // Resolve cidade do viewer (próprio perfil) + cidade do alvo via Nominatim (cache 24h).
  useEffect(() => {
    setApproxDistanceKm(null);
    if (!open || !card?.id) return;
    if (card.distance_km != null) return;        // já temos GPS — não precisa
    if (!card.city) return;                       // sem cidade do alvo, nada a fazer
    let cancelled = false;
    setApproxResolving(true);
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const { data: me } = await (supabase as any)
          .from('profiles')
          .select('location_lat, location_lng, address_city')
          .eq('user_id', uid)
          .maybeSingle();
        let viewerLat = (me as any)?.location_lat ?? null;
        let viewerLng = (me as any)?.location_lng ?? null;
        if ((viewerLat == null || viewerLng == null) && (me as any)?.address_city) {
          const c = await geocodeCity((me as any).address_city);
          if (c) { viewerLat = c.lat; viewerLng = c.lng; }
        }
        if (viewerLat == null || viewerLng == null) return;
        const target = await geocodeCity(card.city);
        if (!target || cancelled) return;
        const km = haversineKm(viewerLat, viewerLng, target.lat, target.lng);
        if (!cancelled) setApproxDistanceKm(km);
      } catch {
        /* fallback silencioso — UI mantém "Sem GPS" */
      } finally {
        if (!cancelled) setApproxResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, card?.id, card?.city, card?.distance_km]);

  if (!card) return null;

  const resolveUserId = async (): Promise<string | null> => {
    if (targetUserId) return targetUserId;
    const { data } = await (supabase as any)
      .from('profiles')
      .select('user_id')
      .eq('id', card.id)
      .maybeSingle();
    const uid = (data as any)?.user_id || null;
    if (uid) setTargetUserId(uid);
    return uid;
  };

  const handleChallenge = async () => {
    setActionBusy(true);
    const uid = await resolveUserId();
    if (!uid) { toast.error('Usuário indisponível'); setActionBusy(false); return; }
    await challenge(uid);
    setActionBusy(false);
  };

  const handleBond = async () => {
    setActionBusy(true);
    try {
      const uid = await resolveUserId();
      if (!uid) { toast.error('Usuário indisponível para compartilhar Aura'); return; }
      const ok = await createBond(uid);
      if (!ok) {
        // hook já mostra toast de erro; nada a fazer aqui
      }
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao compartilhar Aura');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAttention = async () => {
    const uid = await resolveUserId();
    if (!uid) { setAttStatus({ kind: 'error', message: 'Usuário indisponível' }); return; }
    setAttStatus({ kind: 'loading' });
    const r = await sendAttention(uid);
    if (!r) { setAttStatus({ kind: 'error', message: 'Falha ao enviar' }); return; }
    if (r.ok) {
      setAttStatus({ kind: 'success', cost: r.cost_xp, remaining: r.remaining_xp });
      setTimeout(() => setAttStatus((s) => (s.kind === 'success' ? { kind: 'idle' } : s)), 4000);
    } else if (r.cooldown_seconds_left > 0) {
      setAttStatus({ kind: 'cooldown', secondsLeft: r.cooldown_seconds_left });
    } else if (r.remaining_xp < r.cost_xp) {
      setAttStatus({ kind: 'insufficient', balance: r.remaining_xp, cost: r.cost_xp });
    } else {
      setAttStatus({ kind: 'error', message: r.message || 'Ação bloqueada' });
    }
    refreshAttentionStatus();
  };

  const handle = (action: 'like' | 'dislike' | 'superlike') => {
    if (action === 'superlike' && onSuperLikeRequest) {
      onSuperLikeRequest(card);
      onOpenChange(false);
      return;
    }
    onSwipe(card.id, action);
    onOpenChange(false);
  };

  const typeLabel = profileTypeLabel(card.profile_type, card.gender);
  const avatarTemp = isPlaceholderMedia(card.avatar_url);
  const bannerTemp = isPlaceholderMedia(card.banner_url);
  // Fallbacks de mídia quebrada (onError no <img>)
  const [bannerBroken, setBannerBroken] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => { setBannerBroken(false); setAvatarBroken(false); }, [card?.id, card?.banner_url, card?.avatar_url]);
  const showBannerImg = !!card.banner_url && !bannerBroken;
  const showAvatarImg = !!card.avatar_url && !avatarBroken;

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          ref={contentRef}
          aria-label={`Painel rápido de ${card.name}`}
          className="scrollbar-hide flex max-h-[92dvh] w-[calc(100vw-1rem)] max-w-md flex-col overflow-y-auto overscroll-contain rounded-2xl border-white/10 bg-gradient-to-b from-[#150733] to-[#0b0420] p-0 text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 sm:max-w-lg md:max-w-xl lg:max-w-2xl"
        >
          {/* Banner do perfil (capa) */}
          <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-t-2xl bg-gradient-to-br from-fuchsia-600/40 via-purple-700/30 to-indigo-700/40">
            {showBannerImg ? (
              <img
                src={card.banner_url!}
                alt={`Capa de ${card.name}`}
                loading="lazy"
                onError={() => setBannerBroken(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(217,70,239,0.35),transparent_55%),radial-gradient(circle_at_70%_70%,rgba(99,102,241,0.35),transparent_55%)]"
                aria-label={bannerBroken ? 'Capa indisponível — usando arte padrão' : undefined}
              >
                {bannerBroken && (
                  <div className="absolute inset-0 flex items-end justify-end p-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur-sm">
                      <ImageOff className="h-3 w-3" /> capa indisponível
                    </span>
                  </div>
                )}
              </div>
            )}
            {bannerTemp && !bannerBroken && (
              <Badge className="absolute left-2 top-2 z-10 gap-1 bg-black/70 px-1.5 py-0 text-[10px] font-medium text-amber-300 backdrop-blur-sm hover:bg-black/70">
                <ImageOff className="h-3 w-3" /> Banner temp.
              </Badge>
            )}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b0420] via-[#0b0420]/80 to-transparent" />
          </div>

          <div className="px-4 pb-5 sm:px-5">
            {/* Avatar sobreposto ao banner */}
            <div className="-mt-14 relative inline-block">
              <div className="rounded-full bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400 p-[2px]">
                <Avatar className="h-20 w-20 ring-4 ring-[#0b0420]">
                  {showAvatarImg && (
                    <AvatarImage
                      src={card.avatar_url!}
                      alt={card.name}
                      loading="lazy"
                      onError={() => setAvatarBroken(true)}
                    />
                  )}
                  <AvatarFallback className="bg-gradient-to-br from-[#1a0b3d] to-[#0b0420] text-lg font-semibold text-fuchsia-200/90">
                    {avatarBroken ? (
                      <ImageOff className="h-6 w-6 text-fuchsia-300/70" aria-label="Avatar indisponível" />
                    ) : (
                      card.name?.slice(0, 1) || '?'
                    )}
                  </AvatarFallback>
                </Avatar>
              </div>
              {avatarTemp && (
                <Badge className="absolute -bottom-1 left-1/2 -translate-x-1/2 gap-1 whitespace-nowrap bg-black/80 px-1.5 py-0 text-[9px] font-medium text-amber-300 backdrop-blur-sm hover:bg-black/80">
                  <ImageOff className="h-2.5 w-2.5" /> Foto temp.
                </Badge>
              )}
            </div>
            {/* Nome e meta abaixo do banner — nunca sobrepõe a foto de capa */}
            <div className="mt-2">
              <DialogHeader className="text-left">
                <DialogTitle className="truncate text-lg text-amber-300">
                  {card.name}
                  {card.age ? <span className="ml-1 font-normal text-amber-200/90">, {card.age} anos</span> : null}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="secondary" className="capitalize">{card.plan_type || 'free'}</Badge>
                  {metaLoading ? (
                    <span className="inline-flex items-center gap-1.5" aria-label="Carregando nível de Aura">
                      <Skeleton className="h-5 w-28 rounded-full bg-fuchsia-500/15" />
                      <Skeleton className="h-5 w-12 rounded-full bg-fuchsia-500/10" />
                    </span>
                  ) : auraLevel != null ? (
                    <Badge className="gap-1 border-fuchsia-400/40 bg-fuchsia-500/15 text-[10px] font-semibold text-fuchsia-100 hover:bg-fuchsia-500/20">
                      <Zap className="h-2.5 w-2.5" /> Nível Aura {auraLevel}
                      {auraXp != null
                        ? <span className="opacity-70">· {auraXp} XP</span>
                        : <span className="opacity-50 italic">· XP indisponível</span>}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 border-dashed border-fuchsia-400/30 bg-transparent text-[10px] font-medium italic text-muted-foreground/80"
                      title="Esta aura ainda não acumulou XP suficiente para um nível"
                    >
                      <Zap className="h-2.5 w-2.5 opacity-60" /> aura em formação
                    </Badge>
                  )}
                  <span
                    className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-fuchsia-300"
                    title="Match: prioridade no Aura Match (tags + distância + plano + boosts). Afinidade real: índice Jaccard das suas tags em comum (mesma do perfil e salas)."
                  >
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> {score}% match
                    </span>
                    {typeof realScore === 'number' && (
                      <>
                        <span className="opacity-50">·</span>
                        <span className="text-emerald-300/90">{realScore}% afinidade real</span>
                      </>
                    )}
                  </span>
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Banner de indisponibilidade — vermelho/branco/ícone amarelo */}
            {metaLoading && !unavailable ? (
              <Skeleton className="mt-3 h-12 w-full rounded-lg bg-white/5" aria-label="Verificando disponibilidade" />
            ) : unavailable ? (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/60 bg-red-600/95 px-3 py-2 text-[12px] font-medium text-white shadow-md"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider">Usuário indisponível</div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-white/95">{unavailable.reason}</p>
                  {unavailable.code === 'profile_unsynced' && (
                    <p className="mt-1 text-[10px] text-white/70">
                      Notificação enviada para que regularize e volte a aparecer no Aura Match.
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            {/* Meta info — com estados vazios bonitos */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="flex flex-col items-center gap-0.5 rounded-lg border border-white/5 bg-white/5 p-2 text-center">
                <MapPin className={`h-3.5 w-3.5 ${card.city ? 'text-amber-300' : 'text-amber-200/60'}`} />
                <span className={`truncate font-medium text-amber-300 ${card.city ? '' : 'italic text-amber-200/70'}`} title={card.city || 'Cidade não informada'}>
                  {card.city || 'Sigilosa'}
                </span>
                <span className="text-[10px] font-medium text-amber-200/90">Cidade</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 rounded-lg border border-white/5 bg-white/5 p-2 text-center">
                <Users className={`h-3.5 w-3.5 ${typeLabel && typeLabel !== '—' ? 'text-amber-300' : 'text-amber-200/60'}`} />
                <span className={`font-medium text-amber-300 ${typeLabel && typeLabel !== '—' ? '' : 'italic text-amber-200/70'}`}>
                  {typeLabel && typeLabel !== '—' ? typeLabel : 'A descobrir'}
                </span>
                <span className="text-[10px] font-medium text-amber-200/90">Tipo</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 rounded-lg border border-white/5 bg-white/5 p-2 text-center">
                {(() => {
                  const hasGps = card.distance_km != null;
                  const hasApprox = !hasGps && approxDistanceKm != null;
                  const km = hasGps ? card.distance_km! : approxDistanceKm;
                  return (
                    <>
                      {hasGps || hasApprox ? (
                        <Sparkles className={`h-3.5 w-3.5 ${hasApprox ? 'text-amber-300' : 'text-amber-300'}`} />
                      ) : (
                        <MapPinOff className="h-3.5 w-3.5 text-amber-200/60" />
                      )}
                      <span className={`font-medium text-amber-300 ${hasGps || hasApprox ? '' : 'italic text-amber-200/70'}`}>
                        {km != null ? (km < 1 ? '< 1 km' : `${km} km`) : approxResolving ? 'Calculando…' : 'Sem GPS'}
                      </span>
                      {hasApprox && (
                        <span
                          className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-[1px] text-[8.5px] font-bold uppercase tracking-wider text-amber-300"
                          title={`Distância aproximada via centro de ${card.city}`}
                        >
                          Aprox.
                        </span>
                      )}
                      <span className="text-[10px] font-medium text-amber-200/90">Distância</span>
                    </>
                  );
                })()}
              </div>
            </div>

            {card.bio ? (
              <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{card.bio}</p>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-center text-[11px] italic text-muted-foreground/70">
                Esta aura ainda não escreveu uma bio — o mistério é parte do convite.
              </p>
            )}

            {/* Tags de afinidade em comum (social + adult) — base do score % */}
            {Array.isArray(card.shared_tags) && card.shared_tags.length > 0 ? (
              <div className="mt-3 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-2">
                <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-fuchsia-300">
                  <Sparkles className="h-3 w-3" />
                  Tags de afinidade em comum ({card.shared_tags.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {card.shared_tags.slice(0, 12).map((t) => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="border-fuchsia-400/40 bg-fuchsia-500/15 text-[10px] text-fuchsia-100"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-fuchsia-400/20 bg-fuchsia-500/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
                <Tag className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/70" />
                <span>
                  Nenhuma tag em comum ainda — o score considera distância e plano.{' '}
                  <span className="text-fuchsia-300/80">Adicione tags ao seu perfil</span> para ampliar a afinidade.
                </span>
              </div>
            )}

            {/* Ações primárias — 2 col mobile, 2 col tablet+ */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
              <ActionTip label="Abrir o perfil completo deste usuário">
                <Button
                  size="lg"
                  aria-label={`Ver perfil de ${card.name}`}
                  className="h-12 gap-2 bg-gradient-to-br from-fuchsia-600 to-pink-600 font-semibold shadow-lg shadow-fuchsia-900/40 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0420]"
                  onClick={() => {
                    if (card.username) navigate(`/u/${card.username}`);
                    else navigate(`/profile/${card.id}`);
                    onOpenChange(false);
                  }}
                >
                  <User className="h-5 w-5" /> Ver perfil
                </Button>
              </ActionTip>
              <ActionTip label="Abrir conversa com este usuário (cria se não existir)">
                <Button
                  size="lg"
                  aria-label={`Enviar mensagem para ${card.name}`}
                  className="h-12 gap-2 bg-gradient-to-br from-indigo-600 to-purple-600 font-semibold shadow-lg shadow-indigo-900/40 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0420]"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/messages?to=${card.id}`);
                  }}
                >
                  <MessageCircle className="h-5 w-5" /> Mensagem
                </Button>
              </ActionTip>
            </div>

            {/* Ações secundárias — 3 col mobile, 5 col em md+ (junta com duelo/vínculo) */}
            <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-5">
              <ActionTip label="Ocultar este perfil das auras por 15 dias">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Ignorar este perfil"
                  className="h-12 flex-col gap-0.5 border-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
                  onClick={() => handle('dislike')}
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[10px]">Ignorar</span>
                </Button>
              </ActionTip>
              <ActionTip label="Curtir — vira match se a outra pessoa também curtir">
                <Button
                  size="sm"
                  aria-label="Curtir e atrair este perfil"
                  className="h-12 flex-col gap-0.5 bg-gradient-to-br from-fuchsia-500 to-pink-500 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-pink-300"
                  onClick={() => handle('like')}
                >
                  <Heart className="h-4 w-4" />
                  <span className="text-[10px]">Atrair</span>
                </Button>
              </ActionTip>
              <ActionTip label="Super DM — R$ 4,99 para destacar seu interesse">
                <Button
                  size="sm"
                  aria-label="Enviar Super DM (pago)"
                  className="h-12 flex-col gap-0.5 bg-gradient-to-br from-amber-400 to-orange-500 text-black hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-300"
                  onClick={() => handle('superlike')}
                >
                  <Star className="h-4 w-4" />
                  <span className="text-[10px]">Super</span>
                </Button>
              </ActionTip>
              <ActionTip label="Desafiar para duelo de XP semanal — vencedor leva 100 XP">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Desafiar para duelo de Aura"
                  className="h-12 flex-col gap-0.5 border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:ring-rose-300"
                  disabled={actionBusy || duelBusy}
                  onClick={handleChallenge}
                >
                  <Swords className="h-4 w-4" />
                  <span className="text-[10px] font-semibold">Desafiar</span>
                </Button>
              </ActionTip>
              <ActionTip label="Compartilhar Aura por 1 hora — ambos ganham +20% XP">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Compartilhar Aura por 1 hora"
                  className="h-12 flex-col gap-0.5 border-pink-500/30 bg-pink-500/10 text-pink-200 hover:bg-pink-500/20 focus-visible:ring-2 focus-visible:ring-pink-300"
                  disabled={actionBusy || bondBusy}
                  onClick={handleBond}
                >
                  <HeartIcon className="h-4 w-4" />
                  <span className="text-[10px] font-semibold">Aura+</span>
                </Button>
              </ActionTip>
            </div>


            {/* Chamar atenção — custo configurável pelo Admin Master */}
            <div className="mt-2 space-y-1.5">
              {(() => {
                const onCooldown = attentionCooldown > 0;
                const insufficient = !attentionHasEnough;
                const disabled = actionBusy || attentionBusy || onCooldown || insufficient;
                const tipLabel = insufficient
                  ? `Você precisa de ${attentionCost} XP — saldo atual ${attentionBalance} XP`
                  : onCooldown
                    ? `Aguarde ${formatCooldown(attentionCooldown)} para chamar atenção deste perfil novamente`
                    : `Notifica este perfil de forma destacada — custa ${attentionCost} XP do seu saldo. Cooldown 6h por par.`;
                return (
                  <>
                    <ActionTip label={tipLabel}>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-busy={attentionBusy}
                        aria-disabled={disabled}
                        className={`h-11 w-full gap-1.5 border-amber-400/60 bg-black/60 text-amber-300 hover:bg-black/80 hover:text-amber-200 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={disabled}
                        onClick={handleAttention}
                      >
                        {attentionBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : insufficient ? (
                          <Ban className="h-4 w-4" />
                        ) : onCooldown ? (
                          <Timer className="h-4 w-4" />
                        ) : (
                          <Megaphone className="h-4 w-4" />
                        )}
                        <span className="text-[11px] font-semibold">
                          {attentionBusy ? 'Enviando…' : onCooldown ? `Aguarde ${formatCooldown(attentionCooldown)}` : insufficient ? 'XP insuficiente' : 'Chamar atenção'}
                        </span>
                        <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px]">
                          <Zap className="h-2.5 w-2.5" /> {attentionCost} XP
                        </span>
                      </Button>
                    </ActionTip>

                    {/* Feedback inline */}
                    {attStatus.kind === 'success' && (
                      <div className="flex items-start gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-200 animate-fade-in">
                        <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>
                          Atenção enviada! −{attStatus.cost} XP · saldo restante <strong>{attStatus.remaining} XP</strong>
                        </span>
                      </div>
                    )}
                    {attStatus.kind === 'cooldown' && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200 animate-fade-in">
                        <Timer className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>Cooldown ativo — tente novamente em <strong>{formatCooldown(attentionCooldown || attStatus.secondsLeft)}</strong>.</span>
                      </div>
                    )}
                    {attStatus.kind === 'insufficient' && (
                      <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200 animate-fade-in">
                        <Ban className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>XP insuficiente: você tem <strong>{attStatus.balance}</strong> e precisa de <strong>{attStatus.cost}</strong>.</span>
                      </div>
                    )}
                    {attStatus.kind === 'error' && (
                      <div className="flex items-start gap-2 rounded-md border border-red-400/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200 animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span>{attStatus.message}</span>
                      </div>
                    )}
                    {attStatus.kind === 'idle' && !insufficient && !onCooldown && (
                      <p className="text-[10px] text-muted-foreground">
                        Saldo: <strong className="text-amber-200">{attentionBalance} XP</strong> · custo {attentionCost} XP
                      </p>
                    )}
                    {insufficient && attStatus.kind === 'idle' && (
                      <p className="text-[10px] text-red-300/80">
                        Você precisa de mais <strong>{Math.max(0, attentionCost - attentionBalance)} XP</strong> para usar esta ação.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Close: ActionTip por fora; DialogClose recebe a <button> diretamente para
              propagar o handler do Radix sem ser interrompido pelo Slot do Tooltip. */}
          <ActionTip label="Fechar">
            <DialogClose asChild>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-3 z-30 rounded-full bg-black/60 p-1.5 text-white/90 shadow-md ring-1 ring-white/20 hover:bg-black/80 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogClose>
          </ActionTip>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
