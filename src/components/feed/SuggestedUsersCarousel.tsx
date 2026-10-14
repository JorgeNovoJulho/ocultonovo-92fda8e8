/**
 * SuggestedUsersCarousel — "Explorar novos misteriosos(as)"
 *
 * Cards de descoberta com 3 ações: Ignorar (30d), Aproximar (match recíproco),
 * Presente XP (reutiliza AuraXpGiftModal + mensagem automática contextual).
 *
 * Reutiliza:
 *  - useNewRealUsersForCarousel  → lista de mistérios
 *  - useDiscoveryActions / State → ignore/approach/autoreply
 *  - useToggleFollow, useIsFollowing → quando vira match
 *  - AuraXpGiftModal             → presente XP (lockedReceiver)
 *  - looking_now_matches (via RPC discovery_approach_user) → matches reais
 *  - DiscoveryMatchOverlay       → overlay ao bater match
 */
import { memo, useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Users, Crown, X, Sparkles, RefreshCw,
  Heart, Gift, EyeOff, Check, Loader2, Zap, HelpCircle,
} from "lucide-react";

import {
  useNewRealUsersForCarousel,
  useRealUsersCount,
  type SuggestedUser,
  useDiscoveryPreferences,
} from "@/hooks/useSuggestedUsers";
import { useSettingValue } from "@/hooks/useSystemSettings";
import { useI18n } from "@/lib/i18n";
import { CarouselDots } from "@/components/ui/CarouselDots";

import { ProfileHighlightPurchaseModal } from "@/components/settings/ProfileHighlightPurchaseModal";
import { useMyProfileHighlight } from "@/hooks/useProfileHighlight";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { computeAffinityScore } from "@/lib/affinityScore";
import { useHighlightGlow, highlightGlowClass } from "@/hooks/useHighlightGlow";
import { HighlightStyleMenu } from "@/components/highlight/HighlightStyleMenu";
import { useDiscoveryState, useDiscoveryActions, mapDiscoveryErrorMessage } from "@/hooks/useDiscoveryActions";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { DiscoveryMatchOverlay } from "@/components/feed/DiscoveryMatchOverlay";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { buildSupabaseImageThumb } from "@/lib/imageTransform";
import { toast } from "sonner";
import { useOnlineUserIds } from "@/hooks/useOnlineUserIds";
import { OnlineDot } from "@/components/ui/OnlineDot";
import { notifyDiscoveryApproach } from "@/lib/discoveryApproachNotify";
import { DiscoveryDebugOverlay } from "@/components/feed/DiscoveryDebugOverlay";
import { useIsMobile } from "@/hooks/use-mobile";

interface CardActionsState {
  approachStatus: 'idle' | 'pending' | 'matched';
  giftSent: boolean;
  ignored: boolean;
}

const IDLE_CARD_STATE: CardActionsState = {
  approachStatus: 'idle',
  giftSent: false,
  ignored: false,
};

const DiscoveryCard = memo(function DiscoveryCard({
  user,
  priority,
  state,
  busy,
  isOnline,
  onIgnore,
  onApproach,
  onGift,
}: {
  user: SuggestedUser;
  priority?: boolean;
  state: CardActionsState;
  busy: boolean;
  isOnline: boolean;
  onIgnore: (user: SuggestedUser) => void;
  onApproach: (user: SuggestedUser) => void;
  onGift: (user: SuggestedUser) => void;
}) {
  const { t } = useI18n();
  const isHighlighted = !!user.is_highlighted;
  const { user: authUser } = useAuth();
  const { style: myGlowStyle } = useHighlightGlow();
  const isMyCard = !!authUser?.id && (user as any).user_id === authUser.id;
  const glowClass = isHighlighted
    ? highlightGlowClass(isMyCard ? myGlowStyle : "gold")
    : "";
  const isMatched = state.approachStatus === 'matched';
  const isPendingApproach = state.approachStatus === 'pending';
  const isGiftSent = state.giftSent;
  const isIgnored = state.ignored;

  // Rótulo curto de tipo/gênero (nunca expõe nome real)
  const genderLabel = useMemo(() => {
    switch ((user.gender || '').toLowerCase()) {
      case 'casal':
      case 'couple':
        return 'Casal';
      case 'feminino':
      case 'woman':
      case 'female':
      case 'f':
        return 'Mulher';
      case 'masculino':
      case 'man':
      case 'male':
      case 'm':
        return 'Homem';
      case 'trans_fem':
      case 'trans_woman':
        return 'Trans ♀';
      case 'trans_masc':
      case 'trans_man':
        return 'Trans ♂';
      case 'nao_binario':
      case 'non_binary':
      case 'nb':
        return 'Não-binário';
      case 'other':
      case 'outro':
        return 'Outro';
      default:
        return null;
    }
  }, [user.gender]);

  // Linha "idade · tipo · cidade" — sempre renderiza nos 3 slots para manter
  // o alinhamento entre cards no mobile, usando "—" quando faltar dado.
  const metaParts = useMemo(() => {
    const age = user.age != null ? `${user.age}` : '—';
    const type = genderLabel || '—';
    const city = user.city || '—';
    return [age, type, city];
  }, [user.age, genderLabel, user.city]);
  const validAvatar = useMemo(() => resolveAvatarUrl(user.avatar_url), [user.avatar_url]);
  const thumbAvatar = useMemo(
    () => (validAvatar ? buildSupabaseImageThumb(validAvatar, { width: 540, quality: 65 }) : null),
    [validAvatar],
  );

  // Afinidade — cálculo centralizado em @/lib/affinityScore para garantir
  // que o MESMO par (logado × alvo) exiba a MESMA porcentagem em qualquer
  // tela (carrossel, perfil, etc.).
  const { profile: myProfileForAffinity } = useProfile();
  const affinity = useMemo(() => {
    return computeAffinityScore(myProfileForAffinity?.id, (user as any).id) ?? 0;
  }, [myProfileForAffinity?.id, user.id]);

  const affinityTone: 'high' | 'mid' | 'low' | 'veryLow' =
    affinity >= 75 ? 'high' : affinity >= 50 ? 'mid' : affinity >= 30 ? 'low' : 'veryLow';
  const affinityClass =
    affinityTone === 'high'
      ? 'bg-[hsl(135,90%,50%)] text-black ring-2 ring-[hsl(135,100%,70%)]/80 shadow-[0_0_18px_-2px_hsl(135,100%,55%/0.95),0_0_38px_-6px_hsl(135,100%,55%/0.6)]'
      : affinityTone === 'mid'
      ? 'bg-[hsl(48,100%,55%)] text-black ring-2 ring-[hsl(48,100%,75%)]/80 shadow-[0_0_16px_-2px_hsl(48,100%,55%/0.85)]'
      : affinityTone === 'low'
      ? 'bg-[hsl(20,100%,55%)] text-black ring-2 ring-[hsl(20,100%,72%)]/80 shadow-[0_0_16px_-2px_hsl(20,100%,55%/0.85)]'
      : 'bg-[hsl(0,90%,52%)] text-white ring-2 ring-[hsl(0,100%,72%)]/80 shadow-[0_0_18px_-2px_hsl(0,100%,55%/0.95),0_0_38px_-6px_hsl(0,100%,55%/0.55)]';
  const affinityLabel =
    affinityTone === 'high' ? 'AFINIDADE ALTA'
    : affinityTone === 'mid' ? 'AFINIDADE MÉDIA'
    : affinityTone === 'low' ? 'BAIXA AFINIDADE'
    : 'AFINIDADE BAIXA';

  const handleClickAction = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const handleActionPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };


  const neonBorderClass =
    isMatched
      ? 'border-violet-400/60'
      : isHighlighted
        ? `border-2 border-amber-400/80 ${glowClass}`
        : affinityTone === 'high'
          ? 'border-2 border-[hsl(135,100%,55%)]/70 shadow-[0_0_22px_-6px_hsl(135,100%,55%/0.75)]'
          : affinityTone === 'veryLow'
            ? 'border-2 border-[hsl(0,100%,60%)]/70 shadow-[0_0_22px_-6px_hsl(0,100%,55%/0.7)]'
            : affinityTone === 'mid'
              ? 'border border-[hsl(48,100%,60%)]/45'
              : 'border border-[hsl(20,100%,60%)]/45';

  return (
    <Card
      className={`discovery-card-shell relative overflow-hidden ${neonBorderClass} ${isPendingApproach && !isMatched ? 'ring-1 ring-fuchsia-400/40' : ''}`}
      data-discovery-card="real"
    >

      {/* Badge de afinidade — sempre presente, destaque visual primário */}
      <div
        className={`absolute ${isHighlighted ? 'top-10' : 'top-2'} left-2 z-30 flex flex-col items-start rounded-xl px-2.5 py-1 leading-none ${affinityClass}`}
        title={`${affinity}% de afinidade com você`}
        aria-label={`${affinity}% de afinidade`}
      >
        <span className="text-[15px] font-black tabular-nums tracking-tight">{affinity}%</span>
        <span className="mt-0.5 text-[8px] font-extrabold uppercase tracking-[0.12em] opacity-90">
          {affinityLabel}
        </span>
      </div>

      {isHighlighted && (
        <div className="absolute top-2 left-2 z-30 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-black shadow-[0_0_14px_-2px_rgba(251,191,36,0.85)] ring-1 ring-amber-200/70">
          <Crown className="h-3 w-3" />
          <span>Destaque</span>
        </div>
      )}
      {isHighlighted && isMyCard && <HighlightStyleMenu />}


      {isMatched && (
        <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-100 backdrop-blur">
          <Sparkles className="h-3 w-3" /> Match
        </div>
      )}

      {!!user.follows_me && !isMatched && (
        <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-[0_0_10px_-2px_rgba(232,121,249,0.7)] ring-1 ring-white/30">
          <Users className="h-3 w-3" /> Segue você
        </div>
      )}

      <Link
        to={`/creator/${user.id}`}
        className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={t("suggestions.viewProfile", { name: user.username ? `@${user.username}` : 'misterioso' })}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="discovery-card-media relative w-full aspect-[4/5]">
          {/* Bolinha online/offline (verde/vermelho) — sempre visível.
              Posiciona embaixo (canto inferior-esquerdo da foto, acima da
              faixa de identidade) para não conflitar com Crown/Match/Segue você. */}
          <div className="pointer-events-none absolute bottom-12 left-2 z-20 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow ring-1 ring-white/25 backdrop-blur-sm ${
                isOnline ? 'bg-[hsl(142,76%,36%)]/85' : 'bg-black/55'
              }`}
            >
              <span
                className={`inline-block h-2 w-2 rounded-full ring-1 ring-white/40 ${
                  isOnline ? 'bg-[hsl(142,76%,55%)] animate-pulse' : 'bg-[hsl(0,84%,60%)]'
                }`}
                aria-hidden
              />
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {validAvatar ? (
            <img
              src={thumbAvatar || validAvatar}
              alt={user.username ? `@${user.username}` : 'misterioso'}
              width={540}
              height={675}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              {...({ fetchpriority: priority ? 'high' : 'low' } as any)}
              draggable={false}
              className="h-full w-full object-cover"
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                // Se a thumb falhar (transformação indisponível p/ aquele arquivo),
                // tenta o original antes de cair no fallback visual.
                if (thumbAvatar && img.src !== validAvatar) {
                  img.src = validAvatar;
                  return;
                }
                img.style.display = 'none';
                const fb = img.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-b from-primary/15 to-primary/5 px-4 text-center"
            style={{ display: validAvatar ? 'none' : 'flex' }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-3xl font-bold text-primary">
              {(user.username || '?')[0].toUpperCase()}
            </div>
            {!isMyCard && (
              <p className="max-w-[180px] text-[11.5px] font-semibold leading-snug text-white/90 drop-shadow">
                Atualize a foto do perfil para mais visualizações
              </p>
            )}
          </div>

          {/* Gradiente inferior para legibilidade */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

          {/* Bloco de identidade — SEM nome real, sempre @username em destaque */}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="truncate text-base font-bold leading-tight text-white drop-shadow-md">
              @{user.username || 'misterioso'}
            </p>
            <p
              className="mt-0.5 flex min-h-[16px] items-center gap-1.5 truncate text-[11.5px] font-medium leading-4 text-white/85 drop-shadow"
              aria-label={`Idade ${metaParts[0]}, tipo ${metaParts[1]}, cidade ${metaParts[2]}`}
            >
              <span className="shrink-0 tabular-nums">{metaParts[0]}</span>
              <span aria-hidden className="text-white/45">·</span>
              <span className="shrink-0">{metaParts[1]}</span>
              <span aria-hidden className="text-white/45">·</span>
              <span className="min-w-0 flex-1 truncate">{metaParts[2]}</span>
            </p>
          </div>
        </div>
      </Link>


      {/* Trio de ações — moderno, pill, mais destaque visual */}
      {!isMyCard && (
        <div className="discovery-card-actions grid grid-cols-3 gap-1.5 border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || isIgnored}
            data-discovery-action="true"
            onPointerDownCapture={handleActionPointerDown}
            onClick={(e) => handleClickAction(e, () => onIgnore(user))}
            className={`h-11 flex-col gap-0.5 rounded-xl px-0 text-[10px] font-medium transition-all hover:scale-[1.03] active:scale-95 ${
              isIgnored
                ? 'discovery-card-btn-muted-active'
                : 'discovery-card-btn-muted'
            }`}
            aria-label="Ignorar este perfil por 30 dias"
            title="Ignorar por 30 dias"
          >
            {isIgnored ? (
              <Check className="h-[18px] w-[18px]" />
            ) : (
              <EyeOff className="h-[18px] w-[18px]" />
            )}
            <span>{isIgnored ? 'Ignorado' : 'Ignorar'}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={busy || isMatched}
            data-discovery-action="true"
            onPointerDownCapture={handleActionPointerDown}
            onClick={(e) => handleClickAction(e, () => onApproach(user))}
            className={`h-11 flex-col gap-0.5 rounded-xl px-0 text-[10px] font-semibold transition-all hover:scale-[1.04] active:scale-95 ${
              isMatched
                ? 'bg-violet-500/30 text-violet-100 hover:bg-violet-500/30'
                : isPendingApproach
                  ? '!bg-emerald-500 text-emerald-950 font-bold shadow-[0_0_14px_-2px_rgba(16,185,129,0.7)] ring-1 ring-emerald-300/60 hover:!bg-emerald-400'
                  : 'bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white shadow-[0_4px_14px_-4px_rgba(192,38,211,0.55)] hover:from-fuchsia-600 hover:to-violet-700'
            }`}
            aria-label={isMatched ? 'Match conquistado' : 'Aproximar deste perfil'}
            title={isMatched ? 'Match' : isPendingApproach ? 'Aproximação enviada' : 'Sentir energia'}
          >
            {busy ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : isMatched ? (
              <Sparkles className="h-[18px] w-[18px]" />
            ) : isPendingApproach ? (
              <Check className="h-[18px] w-[18px]" />
            ) : (
              <Heart className="h-[18px] w-[18px]" />
            )}
            <span>
              {isMatched ? 'Match' : isPendingApproach ? 'Enviado' : 'Aproximar'}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || isGiftSent}
            data-discovery-action="true"
            onPointerDownCapture={handleActionPointerDown}
            onClick={(e) => handleClickAction(e, () => onGift(user))}
            className={`h-11 flex-col gap-0.5 rounded-xl px-0 text-[10px] font-medium transition-all hover:scale-[1.03] active:scale-95 ${
              isGiftSent
                ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/40'
                : 'discovery-card-btn-gift'
            }`}
            aria-label="Enviar presente de XP"
            title={isGiftSent ? 'Presente enviado' : 'Presentear com XP'}
          >
            {isGiftSent ? (
              <Check className="h-[18px] w-[18px]" />
            ) : (
              <Gift className="h-[18px] w-[18px]" />
            )}
            <span>{isGiftSent ? 'Enviado' : 'Presente'}</span>
          </Button>
        </div>
      )}
    </Card>
  );
});

interface ProfileLite {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

export function SuggestedUsersCarousel() {
  const enabled = useSettingValue<boolean>('enable_suggested_section', true);
  const actionsEnabled = useSettingValue<boolean>('discovery_actions_enabled', true);
  const approachEnabled = useSettingValue<boolean>('discovery_approach_enabled', true);
  const giftAutoreplyEnabled = useSettingValue<boolean>('discovery_gift_autoreply_enabled', true);

  // Hoisted: precisamos dos IDs já interagidos ANTES do fetch de cards,
  // para excluí-los direto na query e sempre priorizar perfis NÃO vistos.
  const [optimisticIgnoredEarly, setOptimisticIgnoredEarly] = useState<Set<string>>(new Set());
  const [optimisticGiftedEarly, setOptimisticGiftedEarly] = useState<Set<string>>(new Set());
  const [intermediateIgnoredEarly, setIntermediateIgnoredEarly] = useState<Set<string>>(new Set());
  const { user: _userEarly } = useAuth();
  const _approachKeyEarly = _userEarly?.id ? `oculto:discovery:approach:${_userEarly.id}` : null;
  const [optimisticApproachEarly, setOptimisticApproachEarly] = useState<Record<string, 'pending' | 'matched'>>(() => {
    if (typeof window === 'undefined' || !_approachKeyEarly) return {};
    try { const raw = sessionStorage.getItem(_approachKeyEarly); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  });
  const { ignored: serverIgnoredEarly, likes: serverLikesEarly, likesLoaded: likesLoadedEarly } = useDiscoveryState();

  const excludeIdsForFetch = useMemo(() => {
    const s = new Set<string>();
    serverIgnoredEarly.forEach((id) => s.add(id));
    optimisticIgnoredEarly.forEach((id) => s.add(id));
    intermediateIgnoredEarly.forEach((id) => s.add(id));
    optimisticGiftedEarly.forEach((id) => s.add(id));
    serverLikesEarly.forEach((v, k) => {
      if (v?.status === 'pending' || v?.status === 'matched') s.add(k);
    });
    Object.entries(optimisticApproachEarly).forEach(([k, v]) => {
      if (v === 'pending' || v === 'matched') s.add(k);
    });
    return Array.from(s);
  }, [serverIgnoredEarly, optimisticIgnoredEarly, intermediateIgnoredEarly, optimisticGiftedEarly, serverLikesEarly, optimisticApproachEarly]);

  const { data: realUsers = [], isLoading, refetch, isFetching } = useNewRealUsersForCarousel(24, { excludeIds: excludeIdsForFetch });
  const [shuffleKey, setShuffleKey] = useState(0);
  // Aliases para os estados já criados acima (hoisted antes do fetch para
  // alimentar o filtro server-side de excludeIds). Mantém uma única fonte
  // de verdade — os setters originais continuam disparando atualizações.
  const optimisticIgnored = optimisticIgnoredEarly;
  const setOptimisticIgnored = setOptimisticIgnoredEarly;
  const optimisticApproachKey = _approachKeyEarly;
  const optimisticApproach = optimisticApproachEarly;
  const setOptimisticApproach = setOptimisticApproachEarly;
  useEffect(() => {
    if (!optimisticApproachKey) return;
    try { sessionStorage.setItem(optimisticApproachKey, JSON.stringify(optimisticApproach)); } catch { /* quota */ }
  }, [optimisticApproach, optimisticApproachKey]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const optimisticGifted = optimisticGiftedEarly;
  const setOptimisticGifted = setOptimisticGiftedEarly;
  const intermediateIgnored = intermediateIgnoredEarly;
  const setIntermediateIgnored = setIntermediateIgnoredEarly;
  const [highlightModalOpen, setHighlightModalOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const [giftTarget, setGiftTarget] = useState<ProfileLite | null>(null);
  const [matchOverlay, setMatchOverlay] = useState<{
    other: { profileId: string; userId: string | null; name: string; username: string | null; avatar: string | null };
    matchId: string | null;
  } | null>(null);
  const [avatarPromptOpen, setAvatarPromptOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: discoveryPrefs } = useDiscoveryPreferences();

  // Refaz a busca SÓ quando as preferências de descoberta realmente mudam.
  // A versão anterior também disparava na montagem e de novo quando as
  // preferências terminavam de carregar — 2 requisições a cada volta ao feed.
  const prefsKey = discoveryPrefs === undefined ? null : JSON.stringify(discoveryPrefs);
  const lastPrefsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prefsKey === null) return;
    const prev = lastPrefsKeyRef.current;
    lastPrefsKeyRef.current = prefsKey;
    if (prev !== null && prev !== prefsKey && user?.id) refetch();
  }, [prefsKey, user?.id, refetch]);
  const { profile } = useProfile();
  const { data: myHighlight } = useMyProfileHighlight();
  const isHighlightActive = !!myHighlight;

  // Bloqueio anti-engajamento sem foto: o próprio usuário logado, se não tem
  // avatar válido, é interrompido em qualquer ação/click/scroll e empurrado
  // para Configurações para subir a foto.
  const myAvatarValid = useMemo(
    () => !!resolveAvatarUrl((profile as any)?.avatar_url),
    [profile],
  );
  const requireMyAvatar = useCallback(() => {
    if (!user?.id) return true; // anônimo segue fluxo de auth normal
    if (myAvatarValid) return true;
    setAvatarPromptOpen(true);
    return false;
  }, [myAvatarValid, user?.id]);
  const handleGoUploadAvatar = useCallback(() => {
    setAvatarPromptOpen(false);
    navigate('/settings?openAvatar=1#avatar');
  }, [navigate]);

  const serverIgnored = serverIgnoredEarly;
  const serverLikes = serverLikesEarly;
  const likesLoaded = likesLoadedEarly;
  const actions = useDiscoveryActions();

  // ── Match recebido (outro lado iniciou e eu já tinha aproximado): detecta
  // a virada do servidor para 'matched' e dispara o overlay + alerta sonoro
  // mesmo que esta tela não tenha sido quem disparou a aproximação final.
  const matchedShownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!likesLoaded || matchOverlay) return;
    serverLikes.forEach((v, profileId) => {
      if (v?.status !== 'matched') return;
      if (matchedShownRef.current.has(profileId)) return;
      // Só celebra se eu ainda não havia visto este match localmente.
      if (optimisticApproach[profileId] === 'matched') {
        matchedShownRef.current.add(profileId);
        return;
      }
      matchedShownRef.current.add(profileId);
      const user = realUsers.find((u) => u.id === profileId);
      if (!user) return;
      setOptimisticApproach((prev) => ({ ...prev, [profileId]: 'matched' }));
      setMatchOverlay({
        other: {
          profileId: user.id,
          userId: (user as any).user_id ?? null,
          name: user.username ? `@${user.username}` : 'Misterioso(a)',
          username: user.username,
          avatar: user.avatar_url,
        },
        matchId: v.match_id,
      });
      toast.success('💫 Novo match misterioso!', {
        description: `Você e @${user.username || 'misterioso'} se aproximaram.`,
        duration: 5000,
      });
    });
  }, [serverLikes, likesLoaded, realUsers, matchOverlay, optimisticApproach]);


  const ignoredAll = useMemo(() => {
    const s = new Set<string>(serverIgnored);
    optimisticIgnored.forEach((id) => s.add(id));
    return s;
  }, [serverIgnored, optimisticIgnored]);

  // Mantém a ordem estável entre renders. PRIORIZA cards com foto de perfil:
  // primeiro shuffle entre quem tem avatar válido, depois entre quem não tem.
  const shuffledUsers = useMemo(() => {
    const withAvatar: typeof realUsers = [];
    const withoutAvatar: typeof realUsers = [];
    for (const u of realUsers) {
      if (resolveAvatarUrl(u.avatar_url)) withAvatar.push(u);
      else withoutAvatar.push(u);
    }
    const shuffle = (arr: typeof realUsers) => {
      const next = arr.slice();
      for (let i = next.length - 1; i > 0; i -= 1) {
        const seed = (shuffleKey + 1) * (i + 3);
        const j = seed % (i + 1);
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    };
    const combined = [...shuffle(withAvatar), ...shuffle(withoutAvatar)];
    // Destacados SEMPRE na frente, mantendo ordem relativa interna (estável).
    return combined.slice().sort(
      (a, b) => Number(!!b.is_highlighted) - Number(!!a.is_highlighted),
    );
  }, [realUsers, shuffleKey]);


  // Oculta cards já com match confirmado (servidor ou otimista).
  // Se o match for desfeito, o card volta naturalmente (server deixa de retornar 'matched').
  const matchedIds = useMemo(() => {
    const s = new Set<string>();
    serverLikes.forEach((v, k) => { if (v?.status === 'matched') s.add(k); });
    Object.entries(optimisticApproach).forEach(([k, v]) => { if (v === 'matched') s.add(k); });
    return s;
  }, [serverLikes, optimisticApproach]);

  // Online IDs em tempo real (presence < 5min, atualizado via realtime).
  const { data: onlineData } = useOnlineUserIds({ intervalMs: 45_000 });
  const onlineIds = onlineData?.ids ?? new Set<string>();

  const visibleUsers = useMemo(() => {
    const filtered = shuffledUsers.filter((u) => {
      // Regras: só aparecem cards com botão APROXIMAR (idle).
      if (ignoredAll.has(u.id)) return false;
      if (intermediateIgnored.has(u.id)) return false;
      if (matchedIds.has(u.id)) return false;
      // Pendentes (Enviado) ou já presenteados ficam fora.
      const approachState = optimisticApproach[u.id];
      if (approachState === 'pending' || approachState === 'matched') return false;
      if (optimisticGifted.has(u.id)) return false;
      const serverState = serverLikes.get(u.id)?.status;
      if (serverState === 'pending' || serverState === 'matched') return false;
      return true;
    });
    // Online primeiro, preservando a ordem dentro de cada grupo (estável).
    const online: typeof filtered = [];
    const offline: typeof filtered = [];
    for (const u of filtered) {
      if (onlineIds.has(u.id)) online.push(u);
      else offline.push(u);
    }
    const ordered = [...online, ...offline];
    // Destaque ativo SEMPRE à frente — reforço pós-filtros (online/offline, ignorados etc.).
    return ordered.slice().sort(
      (a, b) => Number(!!b.is_highlighted) - Number(!!a.is_highlighted),
    );
  }, [shuffledUsers, ignoredAll, intermediateIgnored, matchedIds, optimisticApproach, optimisticGifted, serverLikes, onlineIds]);



  // ── MOBILE: card único com troca aleatória ─────────────────────────
  // Em mobile mostramos só 1 card grande. Quando o usuário Aproxima,
  // Ignora ou envia Presente, trocamos para outro card aleatório que
  // ainda esteja com o botão "Aproximar" livre (idle).
  const isMobile = useIsMobile();
  const [mobileCardId, setMobileCardId] = useState<string | null>(null);

  const pickRandomMobileCard = useCallback(
    (excludeIds: string[] = []) => {
      const pool = visibleUsers.filter((u) => !excludeIds.includes(u.id));
      if (pool.length === 0) return null;
      const idx = Math.floor(Math.random() * pool.length);
      return pool[idx]?.id ?? null;
    },
    [visibleUsers],
  );

  // Mantém o card mobile válido: se for removido (match/ignore/filtrado),
  // escolhe outro aleatoriamente. Também inicializa quando entra na lista.
  useEffect(() => {
    if (!isMobile) return;
    if (visibleUsers.length === 0) {
      if (mobileCardId !== null) setMobileCardId(null);
      return;
    }
    if (!mobileCardId || !visibleUsers.some((u) => u.id === mobileCardId)) {
      setMobileCardId(pickRandomMobileCard());
    }
  }, [isMobile, visibleUsers, mobileCardId, pickRandomMobileCard]);




  // Carrossel reconstruído com trilho nativo + cards em largura fixa calculada.
  // Remove qualquer dependência de contain/layout do pai para o swipe horizontal
  // não ficar “preso” em Android/iOS quando o feed estiver em rolagem vertical.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cardWidth, setCardWidth] = useState(270);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const updateMetrics = () => {
      const viewport = window.innerWidth || el.clientWidth || 390;
      const horizontalPadding = viewport < 640 ? 24 : 32;
      const nextWidth = Math.max(236, Math.min(282, viewport - horizontalPadding - 48));
      setCardWidth(nextWidth);
    };

    updateMetrics();
    const ro = new ResizeObserver(updateMetrics);
    ro.observe(el);
    window.addEventListener('resize', updateMetrics, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf = 0;
    const updateActiveIndex = () => {
      raf = 0;
      const firstCard = el.querySelector<HTMLElement>('[data-discovery-slot]');
      const step = firstCard ? firstCard.offsetWidth + 12 : cardWidth + 12;
      if (step <= 0) return;
      const idx = Math.round(el.scrollLeft / step);
      setActiveIndex(Math.max(0, Math.min(idx, Math.max(visibleUsers.length - 1, 0))));
    };

    updateActiveIndex();

    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateActiveIndex);
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [visibleUsers.length, cardWidth]);

  // Barra de rolagem custom (igual Salas Ocultas) — somente desktop.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState({ width: 0, left: 0, visible: false });

  useEffect(() => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const trackWidth = track?.clientWidth ?? el.clientWidth;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 4 || el.scrollWidth <= 0) {
        setThumb({ width: 0, left: 0, visible: false });
        return;
      }
      const ratio = el.clientWidth / el.scrollWidth;
      const w = Math.max(48, Math.floor(trackWidth * ratio));
      const left = Math.max(0, Math.min(trackWidth - w, (el.scrollLeft / max) * (trackWidth - w)));
      setThumb({ width: w, left, visible: true });
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    if (track) ro.observe(track);
    const timers = [60, 250, 700, 1500].map((ms) => window.setTimeout(update, ms));
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [visibleUsers.length]);

  const beginThumbDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    e.preventDefault();
    const trackRect = track.getBoundingClientRect();
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const thumbW = thumb.width || 48;
    const usable = trackRect.width - thumbW;
    if (usable <= 0) return;
    const startX = e.clientX;
    const startLeft = thumb.left;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const nextLeft = Math.max(0, Math.min(usable, startLeft + delta));
      el.scrollLeft = (nextLeft / usable) * max;
    };
    const onUp = (ev: PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.thumb === "true") return;
    const el = scrollRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const trackRect = track.getBoundingClientRect();
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    const thumbW = thumb.width || 48;
    const usable = trackRect.width - thumbW;
    const x = e.clientX - trackRect.left - thumbW / 2;
    const nextLeft = Math.max(0, Math.min(usable, x));
    try {
      el.scrollTo({ left: (nextLeft / usable) * max, behavior: "smooth" });
    } catch {
      el.scrollLeft = (nextLeft / usable) * max;
    }
  };

  // Em mobile, troca o card visível por outro aleatório (excluindo o atual).
  const advanceMobileCard = useCallback((currentId?: string | null) => {
    if (!isMobile) return;
    const exclude = currentId ? [currentId] : [];
    setMobileCardId(pickRandomMobileCard(exclude));
  }, [isMobile, pickRandomMobileCard]);

  // ── Ações ────────────────────────────────────────────────────────────
  const handleIgnore = useCallback(async (u: SuggestedUser) => {
    if (!actions.canAct) { toast.info('Entre para ignorar perfis.'); return; }
    if (!requireMyAvatar()) return;
    // Estado intermediário "Ignorado" antes de remover do carrossel
    setIntermediateIgnored((prev) => new Set(prev).add(u.id));
    setBusyId(u.id);
    try {
      await actions.ignore(u.id);
      toast.success('Perfil ocultado por 15 dias', { duration: 2200 });
      window.setTimeout(() => {
        setOptimisticIgnored((prev) => new Set(prev).add(u.id));
        setIntermediateIgnored((prev) => { const s = new Set(prev); s.delete(u.id); return s; });
        advanceMobileCard(u.id);
      }, 600);
    } catch (e: any) {
      setIntermediateIgnored((prev) => { const s = new Set(prev); s.delete(u.id); return s; });
      toast.error('Não foi possível ignorar agora.');
    } finally { setBusyId(null); }
  }, [actions, requireMyAvatar, advanceMobileCard]);

  const handleApproach = useCallback(async (u: SuggestedUser) => {
    if (!approachEnabled) return;
    if (!actions.canAct) { toast.info('Entre para aproximar.'); return; }
    if (!requireMyAvatar()) return;
    setOptimisticApproach((prev) => ({ ...prev, [u.id]: 'pending' }));
    setBusyId(u.id);
    try {
      const r = await actions.approach(u.id);
      if (r.matched) {
        setOptimisticApproach((prev) => ({ ...prev, [u.id]: 'matched' }));
        setMatchOverlay({
          other: {
            profileId: u.id,
            userId: u.user_id ?? null,
            name: u.name,
            username: u.username,
            avatar: u.avatar_url,
          },
          matchId: r.match_id,
        });
      } else {
        toast.success('Aproximação enviada 💜', {
          description: 'Se a energia for mútua, vira match.',
        });
        // Notifica o alvo: "Alguém quer um match com você — explore a sessão"
        // Fire-and-forget; usa profile.id do remetente (perfil logado).
        if (profile?.id) {
          void notifyDiscoveryApproach({
            actorProfileId: profile.id,
            targetProfileId: u.id,
          });
        }
      }
      // Em mobile: depois de Aproximar/Match, troca para outro card aleatório.
      window.setTimeout(() => advanceMobileCard(u.id), 350);
    } catch (e: any) {
      setOptimisticApproach((prev) => { const c = { ...prev }; delete c[u.id]; return c; });
      toast.error(mapDiscoveryErrorMessage(e));
    } finally { setBusyId(null); }
  }, [actions, approachEnabled, requireMyAvatar, profile?.id, advanceMobileCard]);

  const handleGift = useCallback((u: SuggestedUser) => {
    if (!actions.canAct) { toast.info('Entre para enviar presente.'); return; }
    if (!requireMyAvatar()) return;
    setGiftTarget({
      id: u.id,
      user_id: u.user_id ?? null,
      username: u.username,
      name: u.name,
      avatar_url: u.avatar_url,
    });
  }, [actions.canAct, requireMyAvatar]);

  const handleGiftSent = useCallback(async (info: { receiver: ProfileLite; amount: number }) => {
    setOptimisticGifted((prev) => new Set(prev).add(info.receiver.id));
    // Após enviar o presente, ativa automaticamente o Aproximar para esse alvo.
    const target = visibleUsers.find((u) => u.id === info.receiver.id);
    if (target) {
      // Dispara approach apenas se ainda estiver "idle" (não enviado/match).
      const currentStatus = optimisticApproach[target.id];
      if (currentStatus !== 'pending' && currentStatus !== 'matched') {
        void handleApproach(target);
      } else {
        // Já estava enviado/match: apenas troca para outro card em mobile.
        advanceMobileCard(target.id);
      }
    }
    if (!giftAutoreplyEnabled) return;
    try {
      const r = await actions.sendGiftAutoreply(info.receiver.id, info.amount);
      if (r?.ok) {
        toast.success('Mensagem enviada junto com o presente 💌', { duration: 2400 });
      }
    } catch { /* silencioso — presente já foi enviado */ }
  }, [actions, giftAutoreplyEnabled, visibleUsers, optimisticApproach, handleApproach, advanceMobileCard]);



  const cardStates = useMemo(() => {
    const map = new Map<string, CardActionsState>();
    visibleUsers.forEach((u) => {
      const optimistic = optimisticApproach[u.id];
      const server = serverLikes.get(u.id);
      const giftSent = optimisticGifted.has(u.id);
      const ignored = intermediateIgnored.has(u.id);

      if (optimistic === 'matched' || server?.status === 'matched') {
        map.set(u.id, { approachStatus: 'matched', giftSent, ignored });
        return;
      }

      if (optimistic === 'pending' || server?.status === 'pending') {
        map.set(u.id, { approachStatus: 'pending', giftSent, ignored });
        return;
      }

      map.set(u.id, {
        approachStatus: 'idle',
        giftSent,
        ignored,
      });
    });
    return map;
  }, [visibleUsers, optimisticApproach, serverLikes, optimisticGifted, intermediateIgnored, likesLoaded]);

  // Auto-scroll quando chega via notificação (?focus=newcomers ou #newcomers).
  // IMPORTANTE: hooks declarados ANTES de qualquer early-return para manter
  // a contagem estável entre renders (evita "Rendered more hooks than during the previous render").
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const isTarget = search.get('focus') === 'newcomers' || location.hash === '#newcomers';
    if (!isTarget || !sectionRef.current) return;
    const t = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
    return () => window.clearTimeout(t);
  }, [location.search, location.hash]);

  // Hooks ANTES de qualquer early-return (regra de hooks).
  const {
    data: rawTotalCardsCount,
    isLoading: isCountLoading,
    isError: isCountError,
  } = useRealUsersCount();
  const totalCardsCount = Math.max(0, (rawTotalCardsCount ?? 0) - (user ? 1 : 0));
  const seenCount = useMemo(() => {
    const seen = new Set<string>();
    serverIgnored.forEach((id) => seen.add(id));
    intermediateIgnored.forEach((id) => seen.add(id));
    optimisticIgnored.forEach((id) => seen.add(id));
    serverLikes.forEach((v, k) => {
      if (v?.status === 'pending' || v?.status === 'matched') seen.add(k);
    });
    Object.entries(optimisticApproach).forEach(([k, v]) => {
      if (v === 'pending' || v === 'matched') seen.add(k);
    });
    optimisticGifted.forEach((id) => seen.add(id));
    return seen.size;
  }, [serverIgnored, intermediateIgnored, optimisticIgnored, serverLikes, optimisticApproach, optimisticGifted]);
  const remainingCount = Math.max(0, totalCardsCount - seenCount);
  const showCountFallback = isCountLoading || isCountError || rawTotalCardsCount === undefined;

  // ── Auto-refetch quando o lote atual filtrou tudo mas ainda há cartas não vistas ──
  // Evita o falso "Sem novos misteriosos" quando o saldo de não vistas > 0.
  const lastAutoFetchAtRef = useRef(0);
  const visibleEmpty = visibleUsers.length === 0;
  useEffect(() => {
    if (!enabled || isLoading || isFetching) return;
    if (!visibleEmpty) return;
    if (showCountFallback) return;
    if (remainingCount <= 0) return;
    const now = Date.now();
    if (now - lastAutoFetchAtRef.current < 1000) return; // cooldown
    lastAutoFetchAtRef.current = now;
    setShuffleKey((k) => k + 1);
    try { refetch(); } catch {}
  }, [enabled, isLoading, isFetching, visibleEmpty, showCountFallback, remainingCount, refetch]);


  if (!enabled) return null;
  if (isLoading) return null;
  const isEmpty = visibleUsers.length === 0;
  // Há saldo de cartas não vistas mas o lote atual filtrou tudo?
  // Mostramos um estado "buscando mais" e disparamos refetch automático
  // (com cooldown) em vez do "não tem mais o que mostrar".
  const hasUnseenBacklog = isEmpty && remainingCount > 0 && !showCountFallback;


  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
  };
  const handleShuffle = () => {
    // Força nova ordem random + refaz fetch para puxar perfis ainda não vistos.
    setShuffleKey((k) => k + 1);
    // Reseta o card mobile para que um novo perfil aleatório apareça.
    if (isMobile) setMobileCardId(null);
    refetch();
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' }));
  };

  const stopNavEvent = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };



  return (
    <>
      <Card ref={sectionRef as any} id="newcomers" className="newcomers-highlight-surface my-4 mx-2 sm:mx-0 overflow-hidden scroll-mt-24">
        <div className="flex items-center gap-1.5 px-3 sm:px-4 pt-3 pb-2">
          <Zap className="h-4 w-4 shrink-0 text-fuchsia-400" />
          <h3 className="min-w-0 flex-1 text-[12px] sm:text-sm font-semibold text-foreground leading-tight break-words pr-1">
            {t('suggestions.title')}
          </h3>
          <div
            className="hidden xs:flex sm:flex items-center gap-1 shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            title={
              showCountFallback
                ? (isCountError ? 'Contagem indisponível — tente atualizar' : 'Carregando contagem de cartas…')
                : `${remainingCount} de ${totalCardsCount} cartas restantes • ${seenCount} já vistas`
            }
            aria-label={
              showCountFallback
                ? (isCountError ? 'Contagem de cartas indisponível' : 'Carregando contagem de cartas')
                : `${remainingCount} cartas restantes de ${totalCardsCount} totais. ${seenCount} já vistas.`
            }
            aria-live="polite"
          >
            <Users className="h-3 w-3 text-fuchsia-400" />
            {showCountFallback ? (
              isCountError ? (
                <span className="text-foreground/80">~{Math.max(seenCount, 0)}+</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="opacity-70">cartas</span>
                </span>
              )
            ) : (
              <>
                <span className="tabular-nums text-foreground">{remainingCount}</span>
                <span className="opacity-60">/</span>
                <span className="tabular-nums">{totalCardsCount}</span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHowItWorksOpen(true); }}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Saiba mais sobre Explorar novos misteriosos"
              title="Saiba mais"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
            {user && (
              <Button
                size="sm"
                variant={isHighlightActive ? 'outline' : 'default'}
                data-allow-locked-click="true"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setHighlightModalOpen(true); }}
                className={isHighlightActive
                  ? 'h-8 gap-1 border-amber-400/60 px-2 text-[11px] text-amber-400 hover:bg-amber-400/10'
                  : 'h-8 gap-1 bg-gradient-to-r from-amber-500 to-amber-600 px-2 text-[11px] font-semibold text-black hover:from-amber-600 hover:to-amber-700'}
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {isHighlightActive ? 'Destaque ativo' : 'Destaque seu perfil'}
                </span>
                <span className="sm:hidden">
                  {isHighlightActive ? 'Ativo' : 'Destaque'}
                </span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShuffle(); }}
              disabled={isFetching}
              className="h-8 w-8 sm:w-auto gap-1 px-0 sm:px-2 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label="Atualizar misteriosos"
              title="Atualizar misteriosos"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isFetching ? 'Atualizando…' : 'Atualizar'}
              </span>
            </Button>
          </div>
        </div>



        <div className="relative">
          {isEmpty ? (
            <div className="px-3 pb-4 pt-1">
              <div className="rounded-2xl border border-dashed border-border/50 bg-card/40 p-6 text-center">
                {hasUnseenBacklog ? (
                  <>
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-fuchsia-300/80" />
                    <p className="text-sm font-medium text-foreground">
                      Buscando mais misteriosos(as)…
                    </p>
                    <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
                      Ainda há {remainingCount} {remainingCount === 1 ? 'carta' : 'cartas'} para você ver. Carregando o próximo lote.
                    </p>
                  </>
                ) : (
                  <>
                    <Sparkles className="mx-auto mb-2 h-6 w-6 text-fuchsia-300/70" />
                    <p className="text-sm font-medium text-foreground">
                      Sem novos misteriosos(as) por aqui agora
                    </p>
                    <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
                      Você já viu todos disponíveis. Volte mais tarde — novos perfis aparecem a cada momento.
                    </p>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleShuffle(); }}
                  disabled={isFetching}
                  aria-label="Roletar cartas para buscar novos perfis"
                  title="Roletar cartas"
                  className="mt-3 inline-flex h-9 min-h-[36px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-xs font-medium leading-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span className="truncate">{hasUnseenBacklog ? 'Tentar de novo' : 'Roletar Cartas'}</span>
                </Button>

              </div>
            </div>
          ) : isMobile ? (
            <div className="px-3 pb-4">
              {(() => {
                const current = visibleUsers.find((u) => u.id === mobileCardId) ?? visibleUsers[0];
                if (!current) {
                  return (
                    <div className="rounded-2xl border border-dashed border-border/50 bg-card/50 p-8 text-center">
                      <Sparkles className="mx-auto mb-2 h-6 w-6 text-fuchsia-300/70" />
                      <p className="text-sm text-muted-foreground">
                        Sem novos misteriosos no momento.
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        Toque em <span className="font-semibold">Atualizar</span> para tentar novamente.
                      </p>
                    </div>
                  );
                }
                return (
                  <div
                    key={current.id}
                    className="mx-auto w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-2 duration-300"
                    onClickCapture={(e) => {
                      if (!requireMyAvatar()) { e.preventDefault(); e.stopPropagation(); }
                    }}
                  >
                    <DiscoveryCard
                      user={current}
                      priority
                      state={cardStates.get(current.id) ?? IDLE_CARD_STATE}
                      busy={!actionsEnabled || busyId === current.id}
                      isOnline={onlineIds.has(current.id)}
                      onIgnore={handleIgnore}
                      onApproach={handleApproach}
                      onGift={handleGift}
                    />
                    <p className="mt-2 text-center text-[11px] text-muted-foreground">
                      {visibleUsers.length > 1
                        ? `${visibleUsers.length} misteriosos(as) disponíveis · troca aleatória a cada ação`
                        : 'Último misterioso disponível'}
                    </p>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div
              ref={scrollRef}
              className="discovery-suggestions-scroll scrollbar-hide flex gap-3 overflow-x-auto overflow-y-hidden px-3 pb-3 sm:px-4 snap-x snap-proximity overscroll-x-contain"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-x pan-y',
                scrollbarWidth: 'none',
                scrollPaddingLeft: '0.75rem',
                scrollPaddingRight: '0.75rem',
              }}
            >
              {visibleUsers.map((u, i) => {
                const highlighted = !!u.is_highlighted;
                return (
                  <div
                    key={u.id}
                    data-discovery-slot
                    data-highlighted={highlighted ? 'true' : undefined}
                    className={`discovery-suggestion-slot shrink-0 snap-start ${
                      highlighted ? 'relative z-20' : 'relative z-0'
                    }`}
                    style={{
                      width: `${cardWidth}px`,
                      minWidth: `${cardWidth}px`,
                      // Reforça a ordem visual: destacados sempre antes,
                      // mesmo se o layout reordenar (flex/grid usam `order`).
                      order: highlighted ? -1 : 0,
                    }}
                    onClickCapture={(e) => {
                      if (!requireMyAvatar()) { e.preventDefault(); e.stopPropagation(); }
                    }}
                  >
                    <DiscoveryCard
                      user={u}
                      priority={highlighted || i < 2}
                      state={cardStates.get(u.id) ?? IDLE_CARD_STATE}
                      busy={!actionsEnabled || busyId === u.id}
                      isOnline={onlineIds.has(u.id)}
                      onIgnore={handleIgnore}
                      onApproach={handleApproach}
                      onGift={handleGift}
                    />
                  </div>
                );
              })}

            </div>
          )}


          {/* Barra de rolagem custom — somente desktop (mesmo padrão de Salas Ocultas) */}
          <div className="hidden md:block px-3 pb-3">
            <div
              ref={trackRef}
              onMouseDown={handleTrackClick as any}
              className={`relative h-2.5 w-full rounded-full bg-white/10 ring-1 ring-white/10 transition-opacity ${thumb.visible ? "opacity-100" : "opacity-40"}`}
              role="scrollbar"
              aria-orientation="horizontal"
            >
              <div
                data-thumb="true"
                onPointerDown={beginThumbDrag}
                className="absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 shadow cursor-grab active:cursor-grabbing hover:brightness-110"
                style={{ width: `${thumb.width}px`, left: `${thumb.left}px`, touchAction: "none" }}
                aria-label="Arraste para navegar"
              />
            </div>
          </div>

        </div>

        {!isMobile && !isEmpty && (
          <CarouselDots
            count={visibleUsers.length}
            activeIndex={activeIndex}
            ariaLabel={t('suggestions.title')}
          />
        )}
      </Card>

      <ProfileHighlightPurchaseModal
        open={highlightModalOpen}
        onOpenChange={setHighlightModalOpen}
      />

      {/* Modal de presente XP — reusa o mesmo modal do Aura Match */}
      <AuraXpGiftModal
        open={!!giftTarget}
        onOpenChange={(v) => { if (!v) setGiftTarget(null); }}
        lockedReceiver={giftTarget}
        title="Presentear este(a) misterioso(a)"
        contextLabel="(via Explorar misteriosos)"
        onSent={handleGiftSent}
      />

      {/* Overlay de match */}
      <DiscoveryMatchOverlay
        open={!!matchOverlay}
        onOpenChange={(v) => { if (!v) setMatchOverlay(null); }}
        myAvatar={(profile as any)?.avatar_url ?? null}
        myName={(profile as any)?.name ?? null}
        other={matchOverlay?.other ?? null}
        matchId={matchOverlay?.matchId ?? null}
      />

      {/* Modal: usuário logado sem foto — barra ações/scroll e leva ao upload */}
      <Dialog open={avatarPromptOpen} onOpenChange={setAvatarPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 ring-1 ring-fuchsia-400/40">
              <Camera className="h-7 w-7 text-fuchsia-300" />
            </div>
            <DialogTitle className="text-center text-lg">
              Atualize agora a foto do seu perfil para obter visualizações
            </DialogTitle>
            <DialogDescription className="text-center">
              Perfis com foto recebem muito mais aproximações, presentes e matches em "Explorar novos misteriosos(as)".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button
              type="button"
              onClick={handleGoUploadAvatar}
              className="bg-gradient-to-r from-fuchsia-500 to-violet-600 text-white hover:from-fuchsia-600 hover:to-violet-700"
            >
              <Camera className="mr-2 h-4 w-4" /> Adicionar foto agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal "Como funciona — Explorar novos misteriosos(as)" */}
      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent
          className="
            w-[calc(100vw-1rem)] sm:max-w-md rounded-2xl
            p-0 gap-0 flex flex-col
            max-h-[calc(100dvh-8rem)] sm:max-h-[85vh]
          "
        >
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-base pr-6 text-left">
              <Zap className="h-4 w-4 text-fuchsia-400 shrink-0" />
              <span className="break-words">Como funciona "Explorar novos misteriosos(as)"</span>
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-left">
              Uma vitrine viva de novos membros para você conhecer com segurança e privacidade.
            </DialogDescription>
          </DialogHeader>
          <div
            className="
              flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4
              [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
            "
          >
            <ol className="space-y-3 text-sm leading-relaxed">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-[11px] font-bold text-fuchsia-400">1</span>
                <div>
                  <p className="font-semibold text-foreground">Cards aleatórios e privados</p>
                  <p className="text-[12px] text-muted-foreground">Mostramos apenas o @username — nome real e dados sensíveis nunca aparecem.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[11px] font-bold text-emerald-400">2</span>
                <div>
                  <p className="font-semibold text-foreground">Aproximar</p>
                  <p className="text-[12px] text-muted-foreground">Sinaliza interesse. Se a pessoa também te aproximar, vira match e libera o chat.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-400">3</span>
                <div>
                  <p className="font-semibold text-foreground">Presente XP</p>
                  <p className="text-[12px] text-muted-foreground">Mande um mimo de XP para chamar atenção e abrir uma conversa contextual automática.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-500/15 text-[11px] font-bold text-zinc-400">4</span>
                <div>
                  <p className="font-semibold text-foreground">Ignorar (30 dias)</p>
                  <p className="text-[12px] text-muted-foreground">Remove o perfil daqui por 30 dias. Você não vê e a pessoa não recebe aviso.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[11px] font-bold text-cyan-400">5</span>
                <div>
                  <p className="font-semibold text-foreground">Só "Aproximar" aparece</p>
                  <p className="text-[12px] text-muted-foreground">Cards já com Aproximação Enviada, Presente Enviado ou Ignorados saem automaticamente para a vitrine ficar sempre fresca.</p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[11px] font-bold text-violet-400">6</span>
                <div>
                  <p className="font-semibold text-foreground">Troca aleatória</p>
                  <p className="text-[12px] text-muted-foreground">A cada ação, mostramos um novo misterioso(a) — toque em <strong>Atualizar</strong> para embaralhar.</p>
                </div>
              </li>
            </ol>
          </div>
          <DialogFooter className="px-5 py-3 shrink-0 border-t border-border/40 bg-card/50">
            <Button onClick={() => setHowItWorksOpen(false)} className="w-full sm:w-auto">Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>

  );
}
