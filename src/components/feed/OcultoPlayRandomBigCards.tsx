/**
 * OcultoPlayRandomBigCards — seção do feed principal que mostra 5 cards
 * GRANDES (mesmo tamanho da seção "Explorar novos misteriosos") com vídeos
 * aleatórios do OCULTO PLAY. A seleção muda a cada login/sessão.
 *
 * - Capa do vídeo + título + @autor
 * - Botão "Assistir agora" abre o modal de foco do OCULTO PLAY (autoplay)
 * - Contador de visualizações em tempo real (via realtime de oculto_play_items)
 * - Ações funcionais e atualizadas em tempo real:
 *     Curtir / Não Gostei / Salvar / Comentar / Compartilhar / Presente
 * - Realtime via useOcultoPlayLiveCounts (subscribe em UPDATE)
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye, Play, Heart, ThumbsDown, Bookmark, MessageCircle, Share2, Gift,
  Sparkles, Loader2, Video, RefreshCw, AlertTriangle, Check,
} from "lucide-react";
import { CarouselScrollbar } from "./CarouselScrollbar";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useActionThrottle } from "@/hooks/useActionThrottle";
import {
  normalizeOcultoPlayItem,
  useOcultoPlayActions,
  useOcultoPlayItemLive,
  useOcultoPlayLiveCounts,
  type OcultoPlayItem,
} from "@/hooks/useOcultoPlayContent";
import { useOcultoPlayAccess } from "@/hooks/useOcultoPlayAccess";
import { ocultoPlayShareUrlForSocial } from "@/lib/ocultoPlayShareUrl";
import { stopAllOcultoPlayMediaNow } from "@/lib/ocultoPlayWatchdog";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHorizontalDragScroll } from "@/hooks/useHorizontalDragScroll";

// Chaves de persistência — embaralhamento muda a CADA NOVO LOGIN do usuário.
// Usamos localStorage + assinatura do access_token: quando o token muda
// (logout/login, refresh manual, troca de conta) geramos um novo seed e
// limpamos os picks travados, forçando 5 vídeos diferentes na próxima sessão.
const SEED_KEY = "oculto-play-random-bigcards:seed";
const PICKS_KEY = "oculto-play-random-bigcards:picks";
const SIG_KEY = "oculto-play-random-bigcards:login-sig";
const FEED_CACHE_KEY = ["oculto-play", "feed", "random-big-cards", "v1"] as const;
const POOL_SIZE = 60;
const PICKS = 5;

/** Hash curto e estável de uma string (djb2). */
function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Assinatura do login atual — muda a cada novo login do usuário. */
function buildLoginSig(userId: string | null | undefined, token: string | null | undefined): string {
  if (!userId) return "anon";
  // Usa apenas um trecho hasheado do token para não persistir o JWT em claro.
  const t = token ? shortHash(token) : "no-token";
  return `${userId}:${t}`;
}

/**
 * Retorna o seed da sessão atrelado à assinatura de login. Se a assinatura
 * mudou (novo login), gera novo seed, marca `fresh=true` e zera os picks
 * travados — garantindo 5 vídeos diferentes a cada login.
 */
function getLoginSeed(sig: string): { seed: number; fresh: boolean } {
  try {
    const lastSig = localStorage.getItem(SIG_KEY);
    const raw = localStorage.getItem(SEED_KEY);
    if (lastSig === sig && raw) {
      return { seed: Number(raw) || 1, fresh: false };
    }
    const seed = Math.floor(Math.random() * 1e9) + 1;
    localStorage.setItem(SEED_KEY, String(seed));
    localStorage.setItem(SIG_KEY, sig);
    // Novo login → limpa picks travados e o histórico de "já exibidos".
    try { localStorage.removeItem(PICKS_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem(PICKS_KEY); } catch { /* noop */ }
    try { sessionStorage.removeItem("oculto-play-random-bigcards:shown"); } catch { /* noop */ }
    return { seed, fresh: true };
  } catch {
    return { seed: Math.floor(Math.random() * 1e9) + 1, fresh: true };
  }
}

/** Lê IDs já travados para o login atual (estabilidade entre remounts). */
function readLockedIds(): string[] | null {
  try {
    const raw = localStorage.getItem(PICKS_KEY) ?? sessionStorage.getItem(PICKS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.every((x) => typeof x === "string") ? arr : null;
  } catch { return null; }
}
function writeLockedIds(ids: string[]) {
  try { localStorage.setItem(PICKS_KEY, JSON.stringify(ids)); } catch { /* noop */ }
}
function clearLockedSelection() {
  try {
    localStorage.removeItem(PICKS_KEY);
    localStorage.removeItem(SEED_KEY);
    localStorage.removeItem(SIG_KEY);
    sessionStorage.removeItem(PICKS_KEY);
    sessionStorage.removeItem(SHOWN_KEY);
  } catch { /* noop */ }
}

// IDs já exibidos nesta sessão (entre reshuffles) — evita repetição.
const SHOWN_KEY = "oculto-play-random-bigcards:shown";
function readShownIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []);
  } catch { return new Set(); }
}
function addShownIds(ids: string[]) {
  try {
    const cur = readShownIds();
    for (const id of ids) cur.add(id);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(cur)));
  } catch { /* noop */ }
}
function clearShownIds() {
  try { sessionStorage.removeItem(SHOWN_KEY); } catch { /* noop */ }
}

// PRNG estável (mulberry32) para shuffle reprodutível por seed.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatCount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(v);
}

type ActionPillProps = {
  label: string;
  active?: boolean;
  pending?: boolean;
  count?: number;
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  colorClass: string;       // cor base sempre aplicada
  activeClass?: string;     // estado ativo (fundo + ring reforçado)
  ariaLabel?: string;
};

const ActionPill = memo(function ActionPill({
  label, active, pending, count, onClick, icon, colorClass, activeClass, ariaLabel,
}: ActionPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={active ? true : undefined}
      aria-label={ariaLabel ?? label}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] font-bold transition-all",
        "ring-1 hover:scale-[1.05] active:scale-95",
        colorClass,
        active && activeClass,
        pending && "opacity-60 cursor-wait",
      )}
      title={label}
    >
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center">
        {pending ? <Loader2 className="h-[16px] w-[16px] animate-spin" /> : icon}
      </span>
      <span className="leading-none tabular-nums">
        {count != null && count > 0 ? formatCount(count) : "0"}
      </span>
    </button>
  );
});

type CardProps = {
  baseItem: OcultoPlayItem;
  cardWidth: number;
  onOpen: (id: string) => void;
  onGift: (author: { id: string; user_id: string | null; username: string | null; name: string | null; avatar_url: string | null }) => void;
};

const RandomVideoCard = memo(function RandomVideoCard({
  baseItem, cardWidth, onOpen, onGift,
}: CardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const it = useOcultoPlayItemLive(baseItem.id, baseItem);
  const { toggleLike, toggleDislike, toggleSave, registerShare } = useOcultoPlayActions();
  const throttle = useActionThrottle({ cooldownMs: 700 });
  const [copied, setCopied] = useState(false);

  const isMe = !!user?.id && user.id === it.author_id;
  const thumb = it.thumb_url || it.media_url || "";

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!user) { toast.info("Entre para curtir."); return; }
    toggleLike.mutate(it.id);
  };
  const handleDislike = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!user) { toast.info("Entre para reagir."); return; }
    toggleDislike.mutate(it.id);
  };
  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!user) { toast.info("Entre para salvar."); return; }
    toggleSave.mutate(it.id);
  };
  const handleComment = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    try { stopAllOcultoPlayMediaNow({ pauseSharedAudio: false }); } catch { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent("oculto-play:open-focus", { detail: { id: it.id, autoplay: false } }));
    } catch { /* noop */ }
    navigate(`/oculto-play?item=${encodeURIComponent(it.id)}&kind=short_video&focus=comments`);
  };
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    const url = ocultoPlayShareUrlForSocial(it.id);
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: it.title ?? "Oculto Play", url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Link copiado!");
        setTimeout(() => setCopied(false), 1600);
      }
      registerShare.mutate(it.id);
    } catch { /* user cancelled */ }
  };
  const handleGift = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (isMe) { toast.info("Você não pode presentear a si mesmo."); return; }
    if (throttle.isLocked) return;
    throttle.run(async () => {
      onGift({
        id: it.author_id,
        user_id: it.author_id,
        username: it.author_username ?? "criador",
        name: it.author_display_name ?? null,
        avatar_url: it.author_avatar_url,
      });
    });
  };

  return (
    <Card
      className="relative overflow-hidden border-2 border-amber-400/40 shadow-[0_0_22px_-6px_rgba(251,191,36,0.45)] hover:border-amber-300/70 hover:shadow-[0_0_28px_-4px_rgba(251,191,36,0.7)] transition-all"
      style={{ width: cardWidth, minWidth: cardWidth }}
      data-oculto-play-random-card
    >
      <button
        type="button"
        onClick={() => onOpen(it.id)}
        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        aria-label={`Assistir ${it.title ?? "vídeo"} no Oculto Play`}
      >
        <div className="relative w-full aspect-[4/5] bg-black/60">
          {thumb ? (
            <img
              src={thumb}
              alt={it.title ?? "Vídeo do Oculto Play"}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/40">
              <Video className="h-10 w-10" />
            </div>
          )}

          {/* Gradiente inferior */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/55 to-transparent" />

          {/* Views (realtime) */}
          <div
            className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/20 backdrop-blur"
            aria-label={`${it.view_count} visualizações`}
            title={`${it.view_count} visualizações`}
          >
            <Eye className="h-3 w-3" /> {formatCount(it.view_count)}
          </div>

          {/* Badge PLAY */}
          <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-black shadow ring-1 ring-amber-200/70">
            <Sparkles className="h-3 w-3" /> PLAY
          </div>

          {/* Ícone play central */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-black/55 ring-2 ring-white/60 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Play className="h-6 w-6 fill-white text-white translate-x-[1px]" />
            </div>
          </div>

          {/* Identidade */}
          <div className="absolute inset-x-0 bottom-0 p-3 pb-2.5">
            <p className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-md">
              {it.title || "Sem título"}
            </p>
            <p className="mt-1 truncate text-[11px] font-medium text-white/85 drop-shadow">
              @{it.author_username || "misterioso"}
            </p>
          </div>
        </div>
      </button>

      {/* Botão CTA */}
      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={() => onOpen(it.id)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-[12px] font-bold text-black shadow-[0_4px_14px_-4px_rgba(251,191,36,0.6)] ring-1 ring-amber-200/60 transition-all hover:brightness-110 active:scale-[0.98]"
        >
          <Play className="h-3.5 w-3.5 fill-black" /> Assistir agora
        </button>
      </div>

      {/* Ações funcionais — ordem/cores padrão do feed */}
      <div className="grid grid-cols-6 gap-1 p-2">
        {/* 1. Curtir — vermelho */}
        <ActionPill
          label="Curtir"
          icon={<Heart className={cn(it.liked_by_me && "fill-current")} />}
          active={!!it.liked_by_me}
          pending={toggleLike.isPending}
          count={it.like_count}
          onClick={handleLike}
          colorClass="bg-red-500/15 text-red-300 ring-red-400/40 hover:bg-red-500/25 hover:text-red-200 hover:ring-red-400/70"
          activeClass="!bg-red-500/30 !text-red-200 !ring-red-400/80"
          ariaLabel={it.liked_by_me ? "Remover curtida" : "Curtir vídeo"}
        />
        {/* 2. Não gostei — cinza */}
        <ActionPill
          label="Não gostei"
          icon={<ThumbsDown className={cn(it.disliked_by_me && "fill-current")} />}
          active={!!it.disliked_by_me}
          pending={toggleDislike.isPending}
          count={it.dislike_count ?? 0}
          onClick={handleDislike}
          colorClass="bg-zinc-500/15 text-zinc-200 ring-zinc-400/40 hover:bg-zinc-500/25 hover:ring-zinc-300/70"
          activeClass="!bg-zinc-400/30 !text-white !ring-zinc-200/70"
          ariaLabel={it.disliked_by_me ? "Remover marcação" : "Marcar como não gostei"}
        />
        {/* 3. Comentar — azul */}
        <ActionPill
          label="Comentar"
          icon={<MessageCircle />}
          count={it.comment_count}
          onClick={handleComment}
          colorClass="bg-sky-500/15 text-sky-300 ring-sky-400/40 hover:bg-sky-500/25 hover:text-sky-200 hover:ring-sky-400/70"
          ariaLabel="Comentar"
        />
        {/* 4. Salvar — amarelo */}
        <ActionPill
          label="Salvar"
          icon={<Bookmark className={cn(it.saved_by_me && "fill-current")} />}
          active={!!it.saved_by_me}
          pending={toggleSave.isPending}
          count={it.save_count}
          onClick={handleSave}
          colorClass="bg-yellow-500/15 text-yellow-300 ring-yellow-400/40 hover:bg-yellow-500/25 hover:text-yellow-200 hover:ring-yellow-400/70"
          activeClass="!bg-yellow-500/30 !text-yellow-200 !ring-yellow-400/80"
          ariaLabel={it.saved_by_me ? "Remover dos salvos" : "Salvar vídeo"}
        />
        {/* 5. Compartilhar — verde */}
        <ActionPill
          label={copied ? "Copiado" : "Compartilhar"}
          icon={copied ? <Check /> : <Share2 />}
          count={it.share_count}
          onClick={handleShare}
          colorClass="bg-emerald-500/15 text-emerald-300 ring-emerald-400/40 hover:bg-emerald-500/25 hover:text-emerald-200 hover:ring-emerald-400/70"
          ariaLabel="Compartilhar vídeo"
        />
        {/* 6. Presente — laranja */}
        <ActionPill
          label={isMe ? "—" : "Presente"}
          icon={<Gift />}
          onClick={handleGift}
          colorClass="bg-orange-500/15 text-orange-300 ring-orange-400/40 hover:bg-orange-500/25 hover:text-orange-200 hover:ring-orange-400/70"
          activeClass="!bg-orange-500/30 !text-orange-200 !ring-orange-400/80"
          ariaLabel={isMe ? "Você é o criador" : "Enviar presente de XP"}
        />
      </div>
    </Card>
  );
});

export const OcultoPlayRandomBigCards = memo(function OcultoPlayRandomBigCards() {
  const { canAccess } = useOcultoPlayAccess();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, session } = useAuth();
  // Assinatura do login atual: muda a cada novo login (token diferente) e
  // dispara seed novo + limpeza dos picks, garantindo 5 vídeos diferentes.
  const loginSig = useMemo(
    () => buildLoginSig(user?.id ?? null, session?.access_token ?? null),
    [user?.id, session?.access_token],
  );
  const [seedInfo, setSeedInfo] = useState(() => getLoginSeed(loginSig));
  useEffect(() => {
    setSeedInfo(getLoginSeed(loginSig));
  }, [loginSig]);
  const seed = seedInfo.seed;
  // Badge "Atualizado nesta sessão" aparece quando o login muda (seed novo).
  const [showFresh, setShowFresh] = useState<boolean>(seedInfo.fresh);
  useEffect(() => {
    setShowFresh(seedInfo.fresh);
    if (!seedInfo.fresh) return;
    const t = window.setTimeout(() => setShowFresh(false), 30_000);
    return () => window.clearTimeout(t);
  }, [seedInfo]);

  const [cardWidth, setCardWidth] = useState(260);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useHorizontalDragScroll(scrollRef);
  const [snapSupported, setSnapSupported] = useState(true);
  const [giftTarget, setGiftTarget] = useState<
    null | { id: string; user_id: string | null; username: string | null; name: string | null; avatar_url: string | null }
  >(null);

  // Feature-detect scroll-snap (fallback para navegadores antigos)
  useEffect(() => {
    try {
      const ok = typeof CSS !== "undefined" && CSS.supports?.("scroll-snap-type", "x mandatory");
      setSnapSupported(!!ok);
    } catch { setSnapSupported(false); }
  }, []);

  // Calcula largura dos cards similar à seção "Explorar novos misteriosos"
  useEffect(() => {
    const updateMetrics = () => {
      const viewport = window.innerWidth || 390;
      const horizontalPadding = viewport < 640 ? 24 : 32;
      const nextWidth = Math.max(236, Math.min(282, viewport - horizontalPadding - 48));
      setCardWidth(nextWidth);
    };
    updateMetrics();
    window.addEventListener("resize", updateMetrics, { passive: true });
    return () => window.removeEventListener("resize", updateMetrics);
  }, []);

  // Busca pool randômico — cache local a esta seção (NÃO é usado por nenhum
  // outro hook). Mantemos um único cache estável para a sessão inteira.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: FEED_CACHE_KEY,
    enabled: canAccess,
    // Sessão inteira sem refetch agressivo — evita re-render/re-shuffle.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    queryFn: async (): Promise<OcultoPlayItem[]> => {
      const sb: any = supabase as any;
      const { data, error } = await sb
        .from("oculto_play_items")
        .select(
          "id, author_id, kind, section, visibility, title, caption, media_url, thumb_url, audio_url, duration_sec, view_count, like_count, save_count, share_count, dislike_count, comment_count, published_at, created_at, expires_at, trim_start_seconds, trim_end_seconds, is_published"
        )
        .eq("is_published", true)
        .in("kind", ["short_video", "vip_teaser"])
        .order("created_at", { ascending: false })
        .limit(POOL_SIZE);
      if (error) {
        console.warn("[OcultoPlayRandomBigCards]", error.message);
        throw error;
      }
      const items = ((data ?? []) as any[]).map((r) => normalizeOcultoPlayItem(r));
      const ids = Array.from(new Set(items.map((i) => i.author_id).filter(Boolean)));
      if (ids.length) {
        const { data: profs } = await sb
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", ids);
        const map = new Map<string, { username: string | null; avatar_url: string | null }>();
        for (const p of (profs ?? []) as any[]) {
          map.set(p.id, { username: p.username ?? null, avatar_url: p.avatar_url ?? null });
        }
        for (const it of items) {
          const a = map.get(it.author_id);
          if (a) {
            it.author_username = a.username;
            it.author_avatar_url = a.avatar_url;
          }
        }
      }
      return items;
    },
  });

  // Nonce de reshuffle manual ("Ver outros vídeos"): bumpa o seed sem reload.
  const [reshuffleNonce, setReshuffleNonce] = useState(0);

  // ⚓ Trava determinística: escolhe 5 IDs por sessão e persiste em storage.
  // Anti-repetição: nunca repete IDs já mostrados nesta sessão, mesmo quando
  // o seed colidir. Se o pool restante for insuficiente, reseta o histórico.
  const picks = useMemo<OcultoPlayItem[]>(() => {
    const list = data ?? [];
    if (list.length === 0) return [];

    const byId = new Map(list.map((it) => [it.id, it] as const));

    // Em reshuffle manual NÃO usamos o lock — forçamos nova escolha.
    if (reshuffleNonce === 0) {
      const locked = readLockedIds();
      if (locked && locked.length > 0) {
        const resolved = locked.map((id) => byId.get(id)).filter(Boolean) as OcultoPlayItem[];
        if (resolved.length >= Math.min(3, PICKS)) {
          addShownIds(resolved.map((r) => r.id));
          return resolved.slice(0, PICKS);
        }
      }
    }

    let shown = readShownIds();
    let pool = list.filter((it) => !shown.has(it.id));
    // Esgotou o pool? Reseta o histórico (mantendo apenas os picks atuais
    // fora do sorteio para garantir troca visível).
    if (pool.length < PICKS) {
      clearShownIds();
      shown = new Set(readLockedIds() ?? []);
      pool = list.filter((it) => !shown.has(it.id));
      if (pool.length < PICKS) pool = list; // fallback final
    }

    const effSeed = (seed + reshuffleNonce * 2654435761) >>> 0;
    // Dedup defensivo por id (proteção contra colisões/dupes do pool).
    const seen = new Set<string>();
    const chosen: OcultoPlayItem[] = [];
    for (const it of seededShuffle(pool, effSeed)) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      chosen.push(it);
      if (chosen.length >= PICKS) break;
    }
    writeLockedIds(chosen.map((c) => c.id));
    addShownIds(chosen.map((c) => c.id));
    return chosen;
  }, [data, seed, reshuffleNonce]);

  const handleReshuffle = () => {
    setReshuffleNonce((n) => n + 1);
    setShowFresh(true);
    // Faz o badge "Atualizado" piscar de novo por 30s.
    window.setTimeout(() => setShowFresh(false), 30_000);
  };

  // Realtime + sincronização de contadores para os itens visíveis
  const visibleIds = useMemo(() => picks.map((p) => p.id), [picks]);
  useOcultoPlayLiveCounts(visibleIds);

  // ⚠️ REMOVIDO: o qc.setQueryData anterior reescrevia o cache do feed com
  // apenas 5 itens, o que provocava o flicker (re-render → reshuffle → swap
  // de cards visíveis). Cada card já assina o seu próprio item via
  // `useOcultoPlayItemLive`, então não precisamos patchar o feed aqui.

  const openItem = (id: string) => {
    // Limpa vídeos/previews residuais sem derrubar o áudio compartilhado/mini player.
    try { stopAllOcultoPlayMediaNow({ pauseSharedAudio: false }); } catch { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent("oculto-play:open-focus", { detail: { id, autoplay: true } }));
    } catch { /* noop */ }
    navigate(`/oculto-play?item=${encodeURIComponent(id)}&kind=short_video&autoplay=1`);
  };

  if (!canAccess) return null;

  if (isLoading) {
    return (
      <section className="px-3 py-4" aria-label="Vídeos aleatórios do Oculto Play (carregando)">
        <Header />
        <div className="flex gap-3 overflow-x-auto px-1 pb-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[380px] rounded-2xl shrink-0" style={{ width: cardWidth }} />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="px-3 py-4" aria-label="Vídeos aleatórios do Oculto Play (erro)">
        <Header />
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="flex-1 text-xs text-muted-foreground">
            Não foi possível carregar os vídeos agora.
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} /> Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  if (picks.length === 0) {
    return (
      <section className="px-3 py-4" aria-label="Vídeos aleatórios do Oculto Play (vazio)">
        <Header />
        <div className="mx-3 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-500/5 via-transparent to-amber-500/5 p-5 text-center">
          <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-amber-400/15 ring-1 ring-amber-300/40">
            <Video className="h-5 w-5 text-amber-300" />
          </div>
          <p className="text-sm font-semibold text-foreground">Nenhum vídeo no Oculto Play por enquanto</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Volte em instantes — novos vídeos chegam a cada sessão.
          </p>
          <button
            type="button"
            onClick={() => { clearLockedSelection(); refetch(); }}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-400/15 px-3 py-1.5 text-[12px] font-semibold text-amber-200 ring-1 ring-amber-300/40 hover:bg-amber-400/25"
          >
            <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} /> Atualizar
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="px-1 py-4" aria-label="Vídeos aleatórios do Oculto Play">
        <Header fresh={showFresh} onReshuffle={handleReshuffle} reshuffling={isFetching} />
        <div
          ref={scrollRef}
          id="oculto-play-random-bigcards-scroll"
          tabIndex={0}
          role="region"
          aria-label="Carrossel de vídeos aleatórios do Oculto Play"
          className={`feed-horizontal-scroll scrollbar-hide flex flex-row flex-nowrap gap-3 overflow-x-auto overflow-y-hidden px-3 pb-1 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 rounded ${
            snapSupported ? "snap-x" : ""
          } ${snapSupported ? "snap-proximity" : ""}`}
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x pan-y",
            overscrollBehaviorX: "contain",
            overscrollBehaviorY: "auto",
            overscrollBehaviorInline: "contain",
            scrollSnapType: snapSupported
              ? "x proximity"
              : undefined,
            scrollbarWidth: "none",
            scrollPaddingLeft: "12px",
            scrollPaddingRight: "12px",
            contain: "content",
            cursor: "grab",
          }}
        >
          {picks.map((it) => (
            <div
              key={it.id}
              className={`shrink-0 ${snapSupported ? "snap-start" : ""}`}
              style={{ scrollSnapStop: "normal" }}
            >
              <RandomVideoCard
                baseItem={it}
                cardWidth={cardWidth}
                onOpen={openItem}
                onGift={setGiftTarget}
              />
            </div>
          ))}
        </div>

        <CarouselScrollbar
          scrollRef={scrollRef}
          ariaLabel="Rolar carrossel de vídeos aleatórios do Oculto Play"
          controlsId="oculto-play-random-bigcards-scroll"
          className="px-3 pb-2"
          variant="amber"
        />
      </section>






      <AuraXpGiftModal
        open={!!giftTarget}
        onOpenChange={(v) => { if (!v) setGiftTarget(null); }}
        lockedReceiver={giftTarget}
        title="Presentear este(a) criador(a)"
        contextLabel="(via Vídeos do Oculto Play)"
      />
    </>
  );
});

type HeaderProps = {
  fresh?: boolean;
  onReshuffle?: () => void;
  reshuffling?: boolean;
};
const Header = memo(function Header({ fresh = false, onReshuffle, reshuffling = false }: HeaderProps) {
  return (
    <div className="px-3 mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-black shadow ring-1 ring-amber-200/70">
          <Play className="h-3.5 w-3.5 fill-black" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-none text-foreground truncate">Descubra no OCULTO PLAY</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            5 vídeos aleatórios para você — atualiza a cada sessão
          </p>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1.5">
        {fresh && (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-300/40"
            title="Nova seleção gerada para esta sessão"
          >
            <Sparkles className="h-3 w-3" /> Atualizado nesta sessão
          </span>
        )}
        {onReshuffle && (
          <button
            type="button"
            onClick={onReshuffle}
            disabled={reshuffling}
            className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-300/40 hover:bg-amber-400/25 active:scale-95 transition disabled:opacity-60"
            aria-label="Ver outros vídeos do Oculto Play"
            title="Ver outros vídeos"
          >
            <RefreshCw className={cn("h-3 w-3", reshuffling && "animate-spin")} />
            Ver outros
          </button>
        )}
      </div>
    </div>
  );
});

export default OcultoPlayRandomBigCards;
