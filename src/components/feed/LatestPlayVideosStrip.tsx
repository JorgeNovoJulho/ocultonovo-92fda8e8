/**
 * LatestPlayVideosStrip — faixa horizontal no feed principal exibindo os
 * últimos vídeos publicados no Oculto Play. Visualmente alinhado à seção
 * "Boas-vindas aos novos do OCULTO".
 *
 * Comportamento:
 * - Primeiro card é CTA fixo → /oculto-play?kind=short_video
 * - Cards mostram thumb, @user, view_count (realtime) e gifts recebidos
 * - Botão "Assistir" → abre o vídeo direto com autoplay e cortes aplicados
 * - Botão de presente → AuraXpGiftModal com throttle anti-duplo-clique
 * - Skeletons enquanto carrega, estado de erro com botão "Tentar novamente"
 * - Rolagem infinita: ao chegar perto do fim, carrega mais 25;
 *   ao voltar perto do começo, refetch para trazer novos
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Gift, PlayCircle, Play, Video, RefreshCw, AlertTriangle, Loader2, Link2, Check } from "lucide-react";
import {
  useLatestOcultoPlayVideos,
  useLatestPlayVideoGiftTotals,
  type LatestPlayVideo,
} from "@/hooks/useLatestOcultoPlayVideos";
import { Skeleton } from "@/components/ui/skeleton";
import { AuraXpGiftModal } from "@/components/aura-match/AuraXpGiftModal";
import { GiftSendersModal } from "@/components/feed/GiftSendersModal";
import { CarouselScrollbar } from "./CarouselScrollbar";
import { CachedImg } from "./CachedImg";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { useAuth } from "@/hooks/useAuth";
import { useActionThrottle } from "@/hooks/useActionThrottle";
import { ocultoPlayShareUrlForSocial } from "@/lib/ocultoPlayShareUrl";
import { toast } from "sonner";
import {
  useEffectiveViewCount,
  useOcultoPlayCountersStore,
} from "@/store/useOcultoPlayCountersStore";
import { useHorizontalDragScroll } from "@/hooks/useHorizontalDragScroll";

function formatCount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(v);
}

const SkeletonRow = () => (
  <div className="flex gap-2 overflow-hidden px-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} className="w-[110px] h-[170px] rounded-xl shrink-0" />
    ))}
  </div>
);

const SectionHeader = () => (
  <div className="px-3 mb-1.5 flex items-center gap-1.5">
    <Video className="w-3.5 h-3.5 text-primary" />
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      Últimos vídeos do Oculto Play
    </h3>
  </div>
);

/**
 * VideoCard — extraído para permitir hook por item (useEffectiveViewCount),
 * que re-renderiza somente o card cujo view_count mudou no store.
 */
type VideoCardProps = {
  i: LatestPlayVideo;
  thumb: string | undefined;
  giftCount: number;
  isMe: boolean;
  giftLocked: boolean;
  copied: boolean;
  onOpen: (id: string) => void;
  onCopy: (e: React.MouseEvent, id: string) => void;
  onGift: (e: React.MouseEvent, author: NonNullable<LatestPlayVideo["author"]>) => void;
  onOpenSenders: (e: React.MouseEvent, author: NonNullable<LatestPlayVideo["author"]>) => void;
};

const VideoCard = memo(function VideoCard({
  i, thumb, giftCount, isMe, giftLocked, copied, onOpen, onCopy, onGift, onOpenSenders,
}: VideoCardProps) {
  const effectiveViews = useEffectiveViewCount(i.id, Number(i.view_count ?? 0));
  const author = i.author;
  return (
    <div
      className="latest-play-card relative shrink-0 w-[110px] h-[170px] rounded-xl overflow-hidden bg-muted focus-within:ring-2 focus-within:ring-amber-300/70"
      style={{ scrollSnapAlign: "start" }}
    >
      <button
        type="button"
        onClick={() => onOpen(i.id)}
        className="absolute inset-0 w-full h-full hover:scale-[1.02] transition-transform outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/80 rounded-xl"
        aria-label={`Abrir vídeo ${i.title ?? ""} no Oculto Play`}
      >
        {thumb ? (
          <CachedImg
            src={thumb}
            alt={i.title ?? "Vídeo do Oculto Play"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted to-muted-foreground/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        <PlayCircle className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-white/90 drop-shadow-lg" />

        <div className="absolute bottom-0 left-0 right-0 p-1.5 pr-9 text-left">
          {author?.username && (
            <span className="block text-[10px] text-white/80 truncate">
              @{author.username}
            </span>
          )}
          <span className="text-[11px] font-semibold text-white drop-shadow-md line-clamp-2 leading-tight">
            {i.title || "Sem título"}
          </span>
        </div>
      </button>

      {/* Views (realtime via store) */}
      <div
        className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold flex items-center gap-1 ring-1 ring-white/20 shadow-lg pointer-events-none"
        title={`${effectiveViews} visualizações`}
        aria-label={`${effectiveViews} visualizações`}
        aria-live="polite"
      >
        <Eye className="w-2.5 h-2.5" aria-hidden />
        {formatCount(effectiveViews)}
      </div>

      {/* Gifts recebidos — clicável: abre lista de remetentes */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (author) onOpenSenders(e, author);
        }}
        disabled={!author}
        className="absolute top-1.5 right-1.5 z-20 px-1.5 py-0.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold flex items-center gap-1 ring-1 ring-white/20 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-amber-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        title={`Ver quem enviou presentes (${giftCount})`}
        aria-label={`Ver lista de remetentes — ${giftCount} presentes recebidos`}
      >
        <Gift className="w-2.5 h-2.5 text-amber-400" aria-hidden />
        {formatCount(giftCount)}
      </button>

      {/* Botão Assistir (autoplay + cortes aplicados) */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(i.id); }}
        className="absolute bottom-1.5 left-1.5 z-10 h-6 px-2 rounded-full bg-white/90 hover:bg-white text-black text-[10px] font-bold inline-flex items-center gap-1 shadow-lg ring-1 ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
        aria-label={`Assistir agora: ${i.title ?? ""}`}
        title="Assistir"
      >
        <Play className="w-3 h-3" aria-hidden /> Assistir
      </button>

      {/* Botão Copiar link */}
      <button
        type="button"
        onClick={(e) => onCopy(e, i.id)}
        className="absolute bottom-8 right-1.5 z-10 h-6 w-6 rounded-full bg-black/70 hover:bg-black/85 text-white inline-flex items-center justify-center shadow-lg ring-1 ring-white/20 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
        aria-label={copied ? "Link copiado para a área de transferência" : "Copiar link do vídeo"}
        aria-live="polite"
        title={copied ? "Link copiado!" : "Copiar link"}
      >
        {copied
          ? <Check className="w-3 h-3 text-emerald-300" aria-hidden />
          : <Link2 className="w-3 h-3" aria-hidden />}
      </button>

      {/* Botão Enviar Presente — sempre visível; desabilitado quando é o próprio criador */}
      {author && (
        <button
          type="button"
          onClick={(e) => {
            if (isMe) {
              e.stopPropagation();
              e.preventDefault();
              toast.info("Você não pode enviar presente para si mesmo");
              return;
            }
            onGift(e, author);
          }}
          disabled={!isMe && giftLocked}
          aria-disabled={isMe}
          className="absolute bottom-1.5 right-1.5 z-10 h-7 w-7 rounded-full bg-primary/90 hover:bg-primary disabled:opacity-60 disabled:cursor-not-allowed text-primary-foreground flex items-center justify-center shadow-lg ring-1 ring-white/30 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 focus-visible:ring-offset-1 focus-visible:ring-offset-black/40"
          aria-label={
            isMe
              ? "Enviar presente (indisponível para o próprio criador)"
              : `Enviar presente para @${author.username ?? "criador"}`
          }
          aria-busy={giftLocked}
          title={isMe ? "Você é o criador" : "Enviar presente"}
        >
          {giftLocked && !isMe
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            : <Gift className="w-3.5 h-3.5" aria-hidden />}
        </button>
      )}
    </div>
  );
});

export const LatestPlayVideosStrip = memo(function LatestPlayVideosStrip() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    items,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLatestOcultoPlayVideos();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useHorizontalDragScroll(scrollRef);
  const [giftTarget, setGiftTarget] =
    useState<null | { id: string; user_id: string; username: string; avatar_url: string | null }>(null);
  const giftThrottle = useActionThrottle({ cooldownMs: 1200 });
  const refreshThrottleRef = useRef<number>(0);
  // Janela de renderização (paginação visual) — evita renderizar centenas
  // de cards no DOM ao rolar a fila infinita. Cresce em blocos de 25.
  const [renderLimit, setRenderLimit] = useState(25);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [sendersTarget, setSendersTarget] =
    useState<null | { id: string; username: string | null }>(null);

  const receiverIds = useMemo(() => {
    const ids: string[] = [];
    for (const i of items) {
      if (i.author?.id) ids.push(i.author.id);
      if (i.author?.user_id && i.author.user_id !== i.author.id) ids.push(i.author.user_id);
    }
    return ids;
  }, [items]);
  const { data: giftTotals } = useLatestPlayVideoGiftTotals(receiverIds);

  // Hidrata o store global de contadores com os view_count vindos do servidor.
  // O <VideoCard /> lê via useEffectiveViewCount(id) e só re-renderiza quando
  // o número daquele item específico mudar (realtime ou bump local).
  const hydrateMany = useOcultoPlayCountersStore((s) => s.hydrateMany);
  useEffect(() => {
    if (items.length === 0) return;
    hydrateMany(items.map((i) => ({ id: i.id, view_count: i.view_count })));
  }, [items, hydrateMany]);

  // Prefetch leve dos próximos posters/thumbnails — mantém a rolagem fluida
  // sem flash de placeholder. Limita-se a 12 itens fora da janela renderizada.
  useEffect(() => {
    const next = items.slice(renderLimit, renderLimit + 12);
    const imgs: HTMLImageElement[] = [];
    for (const it of next) {
      const src = resolveAvatarUrl(it.thumb_url) || it.thumb_url;
      if (!src) continue;
      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.src = src;
      imgs.push(img);
    }
    return () => { imgs.length = 0; };
  }, [items, renderLimit]);

  const getGiftCount = (i: LatestPlayVideo) => {
    const a = i.author;
    if (!a) return 0;
    const byId = giftTotals?.[a.id]?.count ?? 0;
    const byUser = a.user_id ? giftTotals?.[a.user_id]?.count ?? 0 : 0;
    return byId + (a.user_id && a.user_id !== a.id ? byUser : 0);
  };

  // Rolagem infinita (frente/trás) — observa o scroll horizontal
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { scrollLeft, scrollWidth, clientWidth } = el;
        // Frente: expande janela de render e carrega mais antigos
        if (scrollWidth - (scrollLeft + clientWidth) < 360) {
          setRenderLimit((n) => Math.min(items.length, n + 25));
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }
        // Trás: refetch para trazer vídeos mais novos (throttle 8s)
        if (scrollLeft < 40) {
          const now = Date.now();
          if (now - refreshThrottleRef.current > 8000) {
            refreshThrottleRef.current = now;
            refetch();
          }
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, refetch, items.length]);

  // Limpa timer do toast "copiado" ao desmontar
  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
  }, []);

  const handleScrollKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientWidth * 0.35));
    const max = el.scrollWidth - el.clientWidth;
    let target: number | null = null;
    if (e.key === "ArrowLeft") target = el.scrollLeft - step;
    else if (e.key === "ArrowRight") target = el.scrollLeft + step;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = max;
    else return;
    e.preventDefault();
    el.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: "smooth" });
  };

  const openPlayItem = (id: string) => {
    try {
      window.dispatchEvent(
        new CustomEvent("oculto-play:open-focus", { detail: { id, autoplay: true } })
      );
    } catch { /* noop */ }
    navigate(`/oculto-play?item=${encodeURIComponent(id)}&kind=short_video&autoplay=1`);
  };

  const handleSendGift = async (
    e: React.MouseEvent,
    author: NonNullable<LatestPlayVideo["author"]>
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (giftThrottle.isLocked) return;
    await giftThrottle.run(async () => {
      setGiftTarget({
        id: author.id,
        user_id: author.user_id ?? author.id,
        username: author.username ?? "criador",
        avatar_url: author.avatar_url,
      });
    });
  };

  const handleCopyLink = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    const url = ocultoPlayShareUrlForSocial(id);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      toast.success("Link copiado!", { description: "Cole para compartilhar este vídeo." });
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  const visibleItems = useMemo(() => items.slice(0, renderLimit), [items, renderLimit]);


  // --- Loading inicial ---
  if (isLoading && items.length === 0) {
    return (
      <section className="pt-2 pb-3" aria-label="Últimos vídeos do Oculto Play (carregando)">
        <SectionHeader />
        <SkeletonRow />
      </section>
    );
  }

  // --- Erro de carregamento (não derruba o feed) ---
  if (isError && items.length === 0) {
    return (
      <section className="pt-2 pb-3" aria-label="Últimos vídeos do Oculto Play (erro)">
        <SectionHeader />
        <div className="mx-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-muted-foreground flex-1">
            Não foi possível carregar os vídeos agora.
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-semibold text-primary inline-flex items-center gap-1 hover:underline"
          >
            <RefreshCw className="w-3 h-3" /> Tentar novamente
          </button>
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <>
      <section className="pt-2 pb-3" aria-label="Últimos vídeos do Oculto Play">
        <SectionHeader />

        <div
          ref={scrollRef}
          id="latest-play-videos-scroll"
          tabIndex={0}
          role="region"
          aria-label="Carrossel dos últimos vídeos do Oculto Play"
          onKeyDown={handleScrollKey}
          className="feed-horizontal-scroll scrollbar-hide flex gap-2 overflow-x-auto pb-1 px-3 outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60 rounded cursor-grab"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y", scrollSnapType: "x proximity", scrollbarWidth: "none" }}
        >
          {/* CTA fixo: leva para a aba Vídeos do Oculto Play */}
          <div
            className="gold-card-shine relative shrink-0 w-[120px] sm:w-[130px] h-[170px] rounded-xl overflow-hidden flex flex-col items-center justify-between p-2.5 text-center"
            style={{
              scrollSnapAlign: "start",
              background:
                "linear-gradient(140deg, #4a2f04 0%, #b8860b 28%, #ffe17a 50%, #b8860b 72%, #4a2f04 100%)",
              boxShadow:
                "0 0 0 1px rgba(255,225,122,0.85), 0 8px 22px -6px rgba(184,134,11,0.7), inset 0 1px 0 rgba(255,255,255,0.45)",
            }}
          >
            <button
              type="button"
              onClick={() => navigate("/oculto-play?kind=short_video")}
              aria-label="Abrir o Oculto Play e assistir agora"
              className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-900 focus-visible:ring-amber-100 rounded-xl"
            />

            <div className="relative z-[5] flex flex-col items-center mt-1">
              <PlayCircle
                className="w-9 h-9 drop-shadow-[0_2px_3px_rgba(0,0,0,0.55)]"
                style={{ color: "#fff8d6" }}
                aria-hidden
              />
              <span
                className="mt-1 text-[10px] xs:text-[11px] font-black uppercase tracking-[0.14em] leading-tight"
                style={{ color: "#1a0f00", textShadow: "0 1px 0 rgba(255,236,170,0.95)" }}
              >
                Oculto Play
              </span>
              <span
                className="mt-0.5 text-[10.5px] xs:text-[11.5px] font-extrabold leading-tight"
                style={{ color: "#2a1a00", textShadow: "0 1px 0 rgba(255,236,170,0.9)" }}
              >
                Não perca nada
              </span>
            </div>

            <span
              className="relative z-[15] pointer-events-none w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10.5px] xs:text-[11px] font-black uppercase tracking-wider"
              style={{
                background: "linear-gradient(180deg, #1a0f00 0%, #3a2400 100%)",
                color: "#ffe17a",
                boxShadow:
                  "inset 0 1px 0 rgba(255,225,122,0.4), 0 2px 6px rgba(0,0,0,0.45)",
              }}
            >
              <PlayCircle className="w-3.5 h-3.5" aria-hidden />
              Assistir agora
            </span>
          </div>

          {visibleItems.map((i) => {
            const thumb = resolveAvatarUrl(i.thumb_url) || i.thumb_url || undefined;
            const giftCount = getGiftCount(i);
            const author = i.author;
            const isMe =
              !!author &&
              !!user?.id &&
              (author.user_id === user.id || author.id === user.id);
            return (
              <VideoCard
                key={i.id}
                i={i}
                thumb={thumb}
                giftCount={giftCount}
                isMe={isMe}
                giftLocked={giftThrottle.isLocked}
                copied={copiedId === i.id}
                onOpen={openPlayItem}
                onCopy={handleCopyLink}
                onGift={handleSendGift}
                onOpenSenders={(e, a) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setSendersTarget({ id: a.id, username: a.username ?? null });
                }}
              />
            );
          })}

          {/* Indicador de carregamento ao final (infinite scroll) */}
          {hasNextPage && (
            <div
              className="shrink-0 w-[80px] h-[170px] flex items-center justify-center text-muted-foreground"
              aria-label={isFetchingNextPage ? "Carregando mais vídeos" : "Role para carregar mais"}
            >
              {isFetchingNextPage
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <span className="text-[10px]">Mais →</span>}
            </div>
          )}
        </div>

        <CarouselScrollbar
          scrollRef={scrollRef}
          ariaLabel="Rolar carrossel dos últimos vídeos do Oculto Play"
          controlsId="latest-play-videos-scroll"
          className="px-3 pb-2"
          variant="gold"
        />
      </section>

      <style>{`
        .latest-play-card {
          padding: 1.5px;
          background:
            linear-gradient(hsl(var(--muted)), hsl(var(--muted))) padding-box,
            linear-gradient(135deg, #FFD56B 0%, #F7B733 25%, #FFE9A8 50%, #C9892F 75%, #FFD56B 100%) border-box;
          border: 1.5px solid transparent;
          box-shadow:
            0 0 0 1px rgba(255, 213, 107, 0.35),
            0 0 10px rgba(255, 183, 51, 0.55),
            0 0 22px rgba(255, 183, 51, 0.35),
            inset 0 0 12px rgba(255, 229, 168, 0.18);
          animation: latestPlayNeonPulse 3.6s ease-in-out infinite;
        }
        .latest-play-card:hover {
          box-shadow:
            0 0 0 1px rgba(255, 213, 107, 0.6),
            0 0 16px rgba(255, 183, 51, 0.7),
            0 0 32px rgba(255, 183, 51, 0.5),
            inset 0 0 14px rgba(255, 229, 168, 0.25);
        }
        @keyframes latestPlayNeonPulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(255, 213, 107, 0.35),
              0 0 10px rgba(255, 183, 51, 0.55),
              0 0 22px rgba(255, 183, 51, 0.35),
              inset 0 0 12px rgba(255, 229, 168, 0.18);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(255, 213, 107, 0.5),
              0 0 14px rgba(255, 183, 51, 0.75),
              0 0 28px rgba(255, 183, 51, 0.45),
              inset 0 0 14px rgba(255, 229, 168, 0.25);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .latest-play-card { animation: none; }
        }
      `}</style>


      {giftTarget && (
        <AuraXpGiftModal
          open={!!giftTarget}
          onOpenChange={(v) => { if (!v) setGiftTarget(null); }}
          lockedReceiver={{
            id: giftTarget.id,
            user_id: giftTarget.user_id,
            username: giftTarget.username,
            name: null,
            avatar_url: giftTarget.avatar_url,
          }}
          title="Presente para o criador"
          contextLabel={`para @${giftTarget.username}`}
        />
      )}

      <GiftSendersModal
        open={!!sendersTarget}
        onOpenChange={(v) => { if (!v) setSendersTarget(null); }}
        profileId={sendersTarget?.id ?? null}
        username={sendersTarget?.username ?? null}
      />
    </>
  );
});

export default LatestPlayVideosStrip;
