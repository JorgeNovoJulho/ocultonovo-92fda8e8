/**
 * SecretNightMatchModal — modal "Match secreto da noite".
 *
 * Mesma mecânica da seção "Explorar novos misteriosos(as)":
 *  - Aproximar  → discovery_approach_user (RPC). Se reciproco → abre
 *                 DiscoveryMatchOverlay (modal de matches). O card NUNCA
 *                 reaparece enquanto o match estiver ativo.
 *  - Ignorar    → discovery_ignore_user (RPC, 15 dias). O card só volta
 *                 a aparecer depois desse período.
 *
 * Filtro de gênero idêntico ao do CentralAuraModal (H→M+casal,
 * M→H+casal, casal→tudo). Performance: hooks pesados só montam quando
 * `open=true`.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Heart, X, Sparkles, RotateCw, ArrowRight, Moon } from 'lucide-react';
import { useAnyRealSuggestedUsers, useNewRealUsersForCarousel } from '@/hooks/useSuggestedUsers';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import { resolveAvatarUrl } from '@/lib/avatarUrl';
import {
  useDiscoveryActions,
  useDiscoveryState,
  mapDiscoveryErrorMessage,
} from '@/hooks/useDiscoveryActions';
import { DiscoveryMatchOverlay } from '@/components/feed/DiscoveryMatchOverlay';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

function pickRandomIndex(len: number, exclude: number): number {
  if (len <= 1) return 0;
  let next = Math.floor(Math.random() * len);
  if (next === exclude) next = (next + 1) % len;
  return next;
}

function SecretNightMatchModalImpl({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <Dialog modal={false} open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        overlayClassName="!z-[90]"
        className="
          !z-[91] p-0 gap-0 border-0 overflow-hidden
          !w-[min(420px,94vw)]
          !max-h-[calc(100dvh_-_5rem)] !top-[calc(env(safe-area-inset-top)+1rem)] !translate-y-0
          sm:!top-1/2 sm:!-translate-y-1/2 sm:!max-h-[90dvh]
          sm:rounded-2xl rounded-2xl bg-[#0b0512]
          shadow-[0_0_0_1px_rgba(168,85,247,0.35),0_30px_80px_-20px_rgba(168,85,247,0.55)]
          [&>button.absolute]:hidden
          flex flex-col
        "
      >
        <Body onClose={onClose} />
      </DialogContent>
    </Dialog>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: suggestedA = [], isLoading: loadingA } = useAnyRealSuggestedUsers(40);
  const { data: suggestedB = [], isLoading: loadingB } = useNewRealUsersForCarousel(60);
  const isLoading = loadingA && loadingB;
  // Mescla as duas fontes (RPC de afinidade + carrossel de novos reais),
  // dedupe por id/user_id, para garantir que sempre haja alguém compatível.
  const suggested = useMemo(() => {
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const list of [suggestedA as any[], suggestedB as any[]]) {
      for (const u of list) {
        const key = u?.id || u?.user_id;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(u);
      }
    }
    return merged;
  }, [suggestedA, suggestedB]);
  const { ignored: ignoredSet, likes: likesMap } = useDiscoveryState();
  const actions = useDiscoveryActions();

  // Match overlay (idêntico ao "Explorar novos misteriosos(as)")
  const [matchOverlay, setMatchOverlay] = useState<{
    other: { profileId: string; userId: string | null; name: string; username: string | null; avatar: string | null };
    matchId: string | null;
  } | null>(null);

  // Filtro de gênero + exclusão de já-ignorados / já-aproximados / matched.
  const pool = useMemo(() => {
    const norm = (v?: string | null) => (v ?? '').toString().toLowerCase().trim();
    const my = norm(profile?.gender) || norm((profile as any)?.profile_type);
    const isCouple = my.includes('casal') || my === 'couple' || norm((profile as any)?.profile_type) === 'couple';
    const isMale = !isCouple && (my.startsWith('m') || my.includes('mascul') || my === 'homem' || my === 'male');
    const isFemale = !isCouple && (my.startsWith('f') || my.includes('femin') || my === 'mulher' || my === 'female');
    const filtered = (suggested as any[]).filter((u) => {
      const profileId = u?.id;
      if (!profileId) return false;
      // Exclui quem o backend já marcou como ignorado (cooldown ativo)
      if (ignoredSet.has(profileId)) return false;
      // Exclui quem já aproximei (pending) ou bati match (matched).
      // Se o match for desfeito ou expirar, o card volta naturalmente.
      const rel = likesMap.get(profileId);
      if (rel && (rel.status === 'pending' || rel.status === 'matched')) return false;

      const g = norm(u?.gender);
      const t = norm(u?.profile_type);
      const tc = g.includes('casal') || g === 'couple' || t === 'couple';
      const tm = !tc && (g.startsWith('m') || g.includes('mascul') || g === 'homem' || g === 'male');
      const tf = !tc && (g.startsWith('f') || g.includes('femin') || g === 'mulher' || g === 'female');
      if (isCouple) return true;
      if (isMale) return tf || tc;
      if (isFemale) return tm || tc;
      return true;
    });
    const withPhoto = filtered.filter((u) => resolveAvatarUrl(
      u?.avatar_url ?? u?.profile_avatar_url ?? u?.profile?.avatar_url ?? null,
    ));
    if (withPhoto.length > 0) return withPhoto;
    return filtered;
  }, [suggested, profile?.gender, (profile as any)?.profile_type, ignoredSet, likesMap]);

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (pool.length > 0) setIdx((i) => (i >= pool.length ? 0 : Math.floor(Math.random() * pool.length)));
  }, [pool.length]);

  const current = pool[idx];

  const advance = () => setIdx((i) => pickRandomIndex(pool.length, i));

  const handleIgnore = async () => {
    if (!current?.id) return advance();
    try {
      await actions.ignore(current.id);
      toast('Card ocultado por 15 dias', { description: 'Vamos te mostrar outros perfis enquanto isso.' });
    } catch (e) {
      toast.error(mapDiscoveryErrorMessage(e));
    } finally {
      advance();
    }
  };

  const handleAproximar = async () => {
    if (!current?.id) return advance();
    try {
      const res = await actions.approach(current.id);
      if (res?.matched) {
        // Abre modal de match recíproco
        setMatchOverlay({
          other: {
            profileId: current.id,
            userId: (current as any).user_id ?? null,
            name: current.name || (current.username ? `@${current.username}` : 'Misterioso(a)'),
            username: current.username ?? null,
            avatar: resolveAvatarUrl(current.avatar_url) ?? null,
          },
          matchId: res.match_id ?? null,
        });
      } else {
        toast.success('Sinal enviado ✨', { description: 'Se houver reciprocidade, vira match na hora.' });
      }
    } catch (e) {
      toast.error(mapDiscoveryErrorMessage(e));
    } finally {
      advance();
    }
  };

  const handleOpenProfile = () => {
    if (!current) return;
    const to = current.username
      ? `/u/${encodeURIComponent(current.username)}`
      : `/creator/${current.user_id ?? current.id}`;
    onClose();
    navigate(to);
  };

  const avatarRaw =
    (current as any)?.avatar_url ||
    (current as any)?.profile_avatar_url ||
    (current as any)?.profile?.avatar_url ||
    null;
  const resolvedAvatar = resolveAvatarUrl(avatarRaw);
  const avatarUrl = resolvedAvatar
    ? (buildSupabaseImageThumb(resolvedAvatar, { width: 480, quality: 75 }) || resolvedAvatar)
    : null;

  const myAvatar = resolveAvatarUrl((profile as any)?.avatar_url) ?? null;
  const myName = (profile as any)?.name || (profile as any)?.username || 'Você';

  const acting = actions.ignoring || actions.approaching;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div aria-hidden className="pointer-events-none absolute -top-20 -left-16 h-56 w-56 rounded-full blur-3xl opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.55), transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full blur-3xl opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.5), transparent 70%)' }} />

      <header className="relative flex shrink-0 items-start gap-3 border-b border-white/5 px-4 py-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 ring-1 ring-violet-300/40">
          <Moon className="h-4 w-4 text-violet-100" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-300/80">Mistério da noite</div>
          <h2 className="text-base font-semibold text-white leading-snug">Match secreto da noite</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain p-3">
        {isLoading && pool.length === 0 ? (
          <div className="h-56 rounded-2xl bg-white/[0.04] animate-pulse ring-1 ring-white/10" />
        ) : !current ? (
          <div className="rounded-2xl bg-white/[0.03] p-6 text-center text-sm text-white/70 ring-1 ring-white/10">
            A Aura ainda está buscando alguém compatível. Volte daqui a pouco.
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-indigo-500/10 ring-1 ring-violet-400/40 shadow-[0_0_24px_-8px_rgba(168,85,247,0.7)]">
            <button
              type="button"
              onClick={handleOpenProfile}
              className="group relative w-full text-left"
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-black">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: 'center 25%' }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Heart className="h-12 w-12 text-fuchsia-300/60" />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-100 ring-1 ring-violet-300/50">
                    Compatível
                  </span>
                  <Sparkles className="h-3.5 w-3.5 text-violet-200" />
                </div>
                <div className="mt-1 text-base font-bold text-white drop-shadow">
                  {current.name || current.username || 'Alguém misterioso'}
                </div>
                {current.username && (
                  <div className="text-[11px] text-white/70">@{current.username}</div>
                )}
                <div className="mt-0.5 text-[11px] text-white/65">
                  A Aura escolheu esse perfil pra cruzar com você esta noite.
                </div>
              </div>
              <ArrowRight className="absolute right-3 top-3 h-5 w-5 text-white/70 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/5 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleIgnore}
            disabled={!current || acting || !actions.canAct}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/[0.08] disabled:opacity-50"
            title="Esconder este card por 15 dias"
          >
            <RotateCw className="h-4 w-4" /> Ignorar
          </button>
          <button
            type="button"
            onClick={handleAproximar}
            disabled={!current || acting || !actions.canAct}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 px-3 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_-4px_rgba(244,63,94,0.7)] hover:brightness-110 disabled:opacity-50"
          >
            <Heart className="h-4 w-4" /> Aproximar
          </button>
        </div>
        <button
          type="button"
          onClick={handleOpenProfile}
          disabled={!current}
          className="mt-2 w-full text-center text-[12px] text-violet-200/80 hover:text-violet-100 disabled:opacity-50"
        >
          Ver perfil completo →
        </button>
      </div>

      <DiscoveryMatchOverlay
        open={!!matchOverlay}
        onOpenChange={(v) => { if (!v) setMatchOverlay(null); }}
        myAvatar={myAvatar}
        myName={myName}
        other={matchOverlay?.other ?? null}
        matchId={matchOverlay?.matchId ?? null}
      />
    </div>
  );
}

export const SecretNightMatchModal = memo(SecretNightMatchModalImpl);
export default SecretNightMatchModal;
