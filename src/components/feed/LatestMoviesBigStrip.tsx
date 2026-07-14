/**
 * LatestMoviesBigStrip — seção "Filmes no Oculto Play" (tons de azul).
 *
 * - Cards GRANDES (mesmo formato da Descubra no OCULTO PLAY) com últimos
 *   filmes (kind='link', is_adult=false), até 10 itens.
 * - Ações totalmente funcionais e realtime: Curtir / Não gostei / Comentar
 *   / Salvar / Compartilhar / Presente — saldo de cada uma persiste e é
 *   contabilizado pelo backend padrão do Oculto Play.
 * - Botão "Assistir agora" abre o modal de foco do Oculto Play com autoplay.
 * - Visível apenas no modo "Universo Completo" (não aparece quando o usuário
 *   escolheu "Apenas conteúdo +18") — controlado pelo RealFeed.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, Play, Heart, ThumbsDown, Bookmark, MessageCircle, Share2, Gift,
  Film, Loader2, Video, Sparkles,
} from "lucide-react";
import { CarouselScrollbar } from "./CarouselScrollbar";
import { useAuth } from "@/hooks/useAuth";
import { useActionThrottle } from "@/hooks/useActionThrottle";
import {
  useOcultoPlayActions,
  useOcultoPlayItemLive,
  useOcultoPlayLiveCounts,
  type OcultoPlayItem,
} from "@/hooks/useOcultoPlayContent";
import { useLatestPlayMovies } from "@/hooks/useLatestPlayMovies";
import { ocultoPlayShareUrlForSocial } from "@/lib/ocultoPlayShareUrl";
import { stopAllOcultoPlayMediaNow } from "@/lib/ocultoPlayWatchdog";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { SharePlayItemModal } from "@/components/oculto-play/SharePlayItemModal";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizePublicStorageUrl } from "@/lib/storageUrl";
import { parseEmbeddedVideo } from "@/lib/embeddedVideoUrl";
import { useHorizontalDragScroll } from "@/hooks/useHorizontalDragScroll";

const SECTION_BG =
  "linear-gradient(135deg, #021024 0%, #052659 30%, #1d4ed8 65%, #38bdf8 100%)";
const HEADER_BG =
  "linear-gradient(135deg, #052659 0%, #1d4ed8 55%, #38bdf8 100%)";
const SESSION_ROTATION_KEY_PREFIX = "oculto-play:latest-movies-session-start";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getSessionStartOffset(userId: string | null | undefined, loginStamp: string | null | undefined, total: number, pageSize: number) {
  if (typeof window === "undefined" || total <= pageSize) return 0;
  const id = userId || "anon";
  const key = `${SESSION_ROTATION_KEY_PREFIX}:${id}:${todayKey()}:${loginStamp || "session"}`;
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing != null) {
      const parsed = Number(existing);
      return Number.isFinite(parsed) ? Math.max(0, parsed % total) : 0;
    }
    const lastKey = `${SESSION_ROTATION_KEY_PREFIX}:last:${id}`;
    const last = Number(window.localStorage.getItem(lastKey) ?? 0);
    const next = ((Number.isFinite(last) ? last : 0) + pageSize) % total;
    window.sessionStorage.setItem(key, String(next));
    window.localStorage.setItem(lastKey, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * total);
  }
}

function formatCount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(v);
}

function resolveMovieCover(item: OcultoPlayItem): string | undefined {
  const raw = item.thumb_url?.trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower !== "null" && lower !== "undefined" && lower !== "none" && !lower.includes("placeholder.svg") && !lower.includes("/placeholders/")) {
      return normalizePublicStorageUrl(raw, "oculto-play-media") ?? raw;
    }
  }
  const mediaRaw = item.media_url?.trim();
  if (mediaRaw && /\.(avif|webp|png|jpe?g|gif)(?:[?#].*)?$/i.test(mediaRaw)) {
    return normalizePublicStorageUrl(mediaRaw, "oculto-play-media") ?? mediaRaw;
  }
  const parsed = parseEmbeddedVideo(item.source_url || item.media_url || "");
  return parsed?.thumbnailUrl;
}

type ActionPillProps = {
  label: string;
  active?: boolean;
  pending?: boolean;
  count?: number;
  onClick: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  colorClass: string;
  activeClass?: string;
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
  onShare: (item: OcultoPlayItem) => void;
};

const MovieBigCard = memo(function MovieBigCard({ baseItem, cardWidth, onOpen, onGift, onShare }: CardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const it = useOcultoPlayItemLive(baseItem.id, baseItem);
  const { toggleLike, toggleDislike, toggleSave } = useOcultoPlayActions();
  const throttle = useActionThrottle({ cooldownMs: 700 });

  const isMe = !!user?.id && user.id === it.author_id;
  const thumb = resolveMovieCover(it) || "";

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
    navigate(`/oculto-play?item=${encodeURIComponent(it.id)}&kind=link&focus=comments`);
  };
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    onShare(it);
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
        name: (it as any).author_display_name ?? null,
        avatar_url: it.author_avatar_url,
      });
    });
  };

  return (
    <Card
      className="relative overflow-hidden border-2 border-sky-400/50 shadow-[0_0_22px_-6px_rgba(56,189,248,0.55)] hover:border-sky-300/80 hover:shadow-[0_0_28px_-4px_rgba(56,189,248,0.8)] transition-all bg-[#020a1c]"
      style={{ width: cardWidth, minWidth: cardWidth }}
    >
      <button
        type="button"
        onClick={() => onOpen(it.id)}
        className="block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        aria-label={`Assistir ${it.title ?? "filme"} no Oculto Play`}
      >
        <div className="relative w-full aspect-[4/5] bg-black/60">
          {thumb ? (
            <img
              src={thumb}
              alt={it.title ?? "Filme do Oculto Play"}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-sky-200/40">
              <Video className="h-10 w-10" />
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#020a1c] via-[#020a1c]/55 to-transparent" />

          <div
            className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-sky-50 ring-1 ring-sky-300/30 backdrop-blur"
            aria-label={`${it.view_count} visualizações`}
          >
            <Eye className="h-3 w-3" /> {formatCount(it.view_count)}
          </div>

          <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white shadow ring-1 ring-sky-200/70"
            style={{ background: "linear-gradient(135deg,#0c4a9c,#38bdf8)" }}>
            <Film className="h-3 w-3" /> FILME
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-black/55 ring-2 ring-sky-200/70 backdrop-blur-sm transition-transform group-hover:scale-110">
              <Play className="h-6 w-6 fill-white text-white translate-x-[1px]" />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-3 pb-2.5">
            <p className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-md">
              {it.title || "Sem título"}
            </p>
            <p className="mt-1 truncate text-[11px] font-medium text-sky-100/90 drop-shadow">
              @{it.author_username || "misterioso"}
            </p>
          </div>
        </div>
      </button>

      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={() => onOpen(it.id)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.6)] ring-1 ring-sky-200/60 transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg,#0c4a9c 0%, #1d4ed8 50%, #38bdf8 100%)" }}
        >
          <Play className="h-3.5 w-3.5 fill-white" /> Assistir agora
        </button>
      </div>

      <div className="grid grid-cols-6 gap-1 p-2">
        <ActionPill
          label="Curtir"
          icon={<Heart className={cn(it.liked_by_me && "fill-current")} />}
          active={!!it.liked_by_me}
          pending={toggleLike.isPending}
          count={it.like_count}
          onClick={handleLike}
          colorClass="bg-red-500/15 text-red-300 ring-red-400/40 hover:bg-red-500/25 hover:text-red-200 hover:ring-red-400/70"
          activeClass="!bg-red-500/30 !text-red-200 !ring-red-400/80"
        />
        <ActionPill
          label="Não gostei"
          icon={<ThumbsDown className={cn(it.disliked_by_me && "fill-current")} />}
          active={!!it.disliked_by_me}
          pending={toggleDislike.isPending}
          count={it.dislike_count ?? 0}
          onClick={handleDislike}
          colorClass="bg-zinc-500/15 text-zinc-200 ring-zinc-400/40 hover:bg-zinc-500/25 hover:ring-zinc-300/70"
          activeClass="!bg-zinc-400/30 !text-white !ring-zinc-200/70"
        />
        <ActionPill
          label="Comentar"
          icon={<MessageCircle />}
          count={it.comment_count}
          onClick={handleComment}
          colorClass="bg-sky-500/15 text-sky-200 ring-sky-400/40 hover:bg-sky-500/25 hover:text-sky-100 hover:ring-sky-400/70"
        />
        <ActionPill
          label="Salvar"
          icon={<Bookmark className={cn(it.saved_by_me && "fill-current")} />}
          active={!!it.saved_by_me}
          pending={toggleSave.isPending}
          count={it.save_count}
          onClick={handleSave}
          colorClass="bg-yellow-500/15 text-yellow-300 ring-yellow-400/40 hover:bg-yellow-500/25 hover:text-yellow-200 hover:ring-yellow-400/70"
          activeClass="!bg-yellow-500/30 !text-yellow-200 !ring-yellow-400/80"
        />
        <ActionPill
          label="Compartilhar"
          icon={<Share2 />}
          count={it.share_count}
          onClick={handleShare}
          colorClass="bg-emerald-500/15 text-emerald-300 ring-emerald-400/40 hover:bg-emerald-500/25 hover:text-emerald-200 hover:ring-emerald-400/70"
        />
        <ActionPill
          label={isMe ? "—" : "Presente"}
          icon={<Gift />}
          onClick={handleGift}
          colorClass="bg-orange-500/15 text-orange-300 ring-orange-400/40 hover:bg-orange-500/25 hover:text-orange-200 hover:ring-orange-400/70"
          activeClass="!bg-orange-500/30 !text-orange-200 !ring-orange-400/80"
        />
      </div>
    </Card>
  );
});

const Header = memo(function Header({
  canRotate, onRotate, rotating,
}: { canRotate: boolean; onRotate: () => void; rotating: boolean }) {
  return (
    <div
      className="mx-3 mb-2 rounded-xl px-3 py-2 flex items-center gap-2 shadow-[0_6px_18px_-6px_rgba(29,78,216,0.55)]"
      style={{ background: HEADER_BG, border: "1px solid rgba(180,210,255,0.25)" }}
    >
      <Film className="w-4 h-4 text-sky-50 drop-shadow shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <h3
          className="text-[12px] sm:text-[13px] font-black uppercase tracking-[0.14em] text-white drop-shadow truncate"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
        >
          Filmes no Oculto Play
        </h3>
        <p className="text-[10.5px] text-sky-100/90 truncate">
          Os últimos filmes — atualizado em tempo real
        </p>
      </div>
      {canRotate && (
        <button
          type="button"
          onClick={onRotate}
          disabled={rotating}
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white/95 hover:bg-white text-sky-700 px-2.5 py-1.5 text-[10.5px] font-black uppercase tracking-wide shadow-[0_4px_14px_-4px_rgba(56,189,248,0.7)] ring-1 ring-sky-200/80 transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-60"
          aria-label="Mostrar novos filmes"
          title="Mostrar novos filmes"
        >
          {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          <span className="hidden xs:inline sm:inline">Novos</span>
        </button>
      )}
    </div>
  );
});

export const LatestMoviesBigStrip = memo(function LatestMoviesBigStrip() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useHorizontalDragScroll(scrollRef);
  const { user } = useAuth();
  const { items: topItems, allItems, pageSize, isLoading, isError, refetch } = useLatestPlayMovies(true);
  const [giftTarget, setGiftTarget] = useState<
    null | { id: string; user_id: string | null; username: string | null; name: string | null; avatar_url: string | null }
  >(null);
  const [shareTarget, setShareTarget] = useState<OcultoPlayItem | null>(null);
  const [pageStart, setPageStart] = useState(0);
  const [rotating, setRotating] = useState(false);
  const { registerShare } = useOcultoPlayActions();

  useEffect(() => {
    if (allItems.length <= pageSize) return;
    setPageStart(getSessionStartOffset(user?.id, (user as any)?.last_sign_in_at, allItems.length, pageSize));
  }, [allItems.length, pageSize, user?.id, (user as any)?.last_sign_in_at]);

  // Janela rotativa SEM duplicar: percorre allItems em blocos de `pageSize`
  // a partir de `pageStart`, sempre filtrando ids já vistos no ciclo atual.
  const items = useMemo<OcultoPlayItem[]>(() => {
    if (allItems.length === 0) return [];
    if (pageStart === 0 || allItems.length <= pageSize) return topItems;
    const seen = new Set<string>();
    const out: OcultoPlayItem[] = [];
    for (let i = 0; i < allItems.length && out.length < pageSize; i++) {
      const idx = (pageStart + i) % allItems.length;
      const it = allItems[idx];
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  }, [allItems, topItems, pageStart, pageSize]);

  const canRotate = allItems.length > pageSize;

  const handleRotate = async () => {
    if (rotating) return;
    setRotating(true);
    try {
      setPageStart((p) => (p + pageSize) % Math.max(1, allItems.length));
      try { await refetch(); } catch { /* noop */ }
      try { scrollRef.current?.scrollTo({ left: 0, behavior: "smooth" }); } catch { /* noop */ }
    } finally {
      setTimeout(() => setRotating(false), 350);
    }
  };

  // Realtime de contadores para todos os itens visíveis.
  useOcultoPlayLiveCounts(items.map((i) => i.id));

  const cardWidth = typeof window !== "undefined"
    ? Math.max(236, Math.min(282, (window.innerWidth || 390) - 24 - 48))
    : 260;

  const openItem = (id: string) => {
    try { stopAllOcultoPlayMediaNow({ pauseSharedAudio: false }); } catch { /* noop */ }
    try {
      window.dispatchEvent(new CustomEvent("oculto-play:open-focus", { detail: { id, autoplay: true } }));
    } catch { /* noop */ }
    navigate(`/oculto-play?item=${encodeURIComponent(id)}&kind=link&autoplay=1`);
  };

  if (isLoading && items.length === 0) {
    return (
      <section
        className="pt-2 pb-3 my-3 mx-2 rounded-2xl"
        style={{ background: SECTION_BG }}
        aria-label="Filmes no Oculto Play (carregando)"
      >
        <Header canRotate={canRotate} onRotate={handleRotate} rotating={rotating} />
        <div className="flex gap-3 overflow-hidden px-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[380px] rounded-2xl shrink-0 bg-sky-950/40" style={{ width: cardWidth }} />
          ))}
        </div>
      </section>
    );
  }

  if (isError || items.length === 0) return null;

  return (
    <>
      <section
        className="pt-2 pb-3 my-3 mx-2 rounded-2xl shadow-[0_10px_30px_-12px_rgba(29,78,216,0.7)] ring-1 ring-sky-400/30"
        style={{ background: SECTION_BG }}
        aria-label="Filmes no Oculto Play"
      >
        <Header canRotate={canRotate} onRotate={handleRotate} rotating={rotating} />
        <div
          ref={scrollRef}
          id="latest-movies-big-scroll"
          tabIndex={0}
          role="region"
          aria-label="Carrossel dos últimos filmes do Oculto Play"
          className="feed-horizontal-scroll scrollbar-hide flex flex-row flex-nowrap gap-3 overflow-x-auto overflow-y-hidden px-3 pb-1 outline-none cursor-grab"
          style={{
            WebkitOverflowScrolling: "touch",
            touchAction: "pan-x pan-y",
            overscrollBehaviorX: "contain",
            scrollSnapType: "x proximity",
            scrollbarWidth: "none",
          }}
        >
          {items.map((it) => (
            <div key={it.id} className="shrink-0 snap-start">
              <MovieBigCard
                baseItem={it}
                cardWidth={cardWidth}
                onOpen={openItem}
                onGift={setGiftTarget}
                onShare={setShareTarget}
              />
            </div>
          ))}

          {/* Card final: leva para a seção "Filmes" expandida no Oculto Play */}
          <div className="shrink-0 snap-start">
            <Card
              className="relative overflow-hidden border-2 border-sky-300/60 shadow-[0_0_22px_-6px_rgba(56,189,248,0.55)] hover:border-sky-200 hover:shadow-[0_0_30px_-4px_rgba(56,189,248,0.9)] transition-all"
              style={{ width: cardWidth, minWidth: cardWidth, background: SECTION_BG }}
            >
              <button
                type="button"
                onClick={() => {
                  try { stopAllOcultoPlayMediaNow({ pauseSharedAudio: false }); } catch { /* noop */ }
                  try { localStorage.setItem('ocultoplay:section-open:v2:links', '1'); } catch { /* noop */ }
                  navigate('/oculto-play#filmes');
                }}
                className="flex h-full w-full flex-col items-center justify-center gap-3 p-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                aria-label="Veja mais filmes no Oculto Play"
                style={{ aspectRatio: '4 / 5' }}
              >
                <div className="grid h-16 w-16 place-items-center rounded-full bg-black/45 ring-2 ring-sky-200/80 backdrop-blur-sm">
                  <Film className="h-8 w-8 text-sky-100" />
                </div>
                <p className="text-[15px] font-black uppercase tracking-wide text-white drop-shadow"
                   style={{ textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>
                  Veja mais filmes<br/>no Oculto Play
                </p>
                <p className="text-[11px] font-medium text-sky-100/90">
                  Abrir a coleção completa
                </p>
                <span
                  className="mt-1 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(56,189,248,0.65)] ring-1 ring-sky-200/70"
                  style={{ background: 'linear-gradient(135deg,#0c4a9c 0%, #1d4ed8 50%, #38bdf8 100%)' }}
                >
                  <Play className="h-3.5 w-3.5 fill-white" /> Abrir Filmes
                </span>
              </button>
            </Card>
          </div>
        </div>

        <CarouselScrollbar
          scrollRef={scrollRef}
          ariaLabel="Rolar carrossel dos Filmes no Oculto Play"
          controlsId="latest-movies-big-scroll"
          className="px-3 pb-1"
          variant="blue"
        />
      </section>

      <AuraXpGiftModal
        open={!!giftTarget}
        onOpenChange={(v) => { if (!v) setGiftTarget(null); }}
        lockedReceiver={giftTarget}
        title="Presentear este(a) criador(a)"
        contextLabel="(via Filmes no Oculto Play)"
      />

      <SharePlayItemModal
        open={!!shareTarget}
        onOpenChange={(v) => { if (!v) setShareTarget(null); }}
        url={shareTarget ? ocultoPlayShareUrlForSocial(shareTarget.id) : ''}
        itemId={shareTarget?.id}
        title={shareTarget?.title ?? undefined}
        author={shareTarget?.author_username ?? null}
        onShared={() => {
          if (shareTarget) {
            try { registerShare.mutate(shareTarget.id); } catch { /* noop */ }
          }
        }}
      />
    </>
  );
});

export default LatestMoviesBigStrip;
