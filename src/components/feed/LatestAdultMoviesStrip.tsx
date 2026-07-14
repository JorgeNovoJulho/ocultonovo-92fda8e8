/**
 * LatestAdultMoviesStrip — faixa horizontal "Filmes +18 do Oculto Play".
 *
 * Comportamento:
 * - Visível apenas quando o usuário escolheu o tipo de conteúdo
 *   "Apenas +18" OU está no modo "Experiência Completa".
 *   • Em "Experiência Completa": cards vêm com BLUR + botão MOSTRAR
 *     somente quando o Modo Blur Seguro global estiver ligado.
 *   • Em "Apenas +18": cards visíveis sem blur.
 * - Card destaque (primeiro): rótulo "+18 no Oculto Play" e botão
 *   "ASSISTIR AGORA" que abre a página com a seção "Filmes +18" expandida.
 * - Lista até 25 filmes, ordenados por mistura de mais novos e mais vistos.
 */
import { memo, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Film, PlayCircle, EyeOff, Sparkles } from "lucide-react";
import { useLatestAdultPlayMovies, type LatestAdultMovie } from "@/hooks/useLatestAdultPlayMovies";
import { Skeleton } from "@/components/ui/skeleton";
import { CarouselScrollbar } from "./CarouselScrollbar";
import { CachedImg } from "./CachedImg";
import { normalizePublicStorageUrl } from "@/lib/storageUrl";
import { parseEmbeddedVideo } from "@/lib/embeddedVideoUrl";
import { useEffectiveViewCount, useOcultoPlayCountersStore } from "@/store/useOcultoPlayCountersStore";
import { useHorizontalDragScroll } from "@/hooks/useHorizontalDragScroll";

function formatCount(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(v);
}

function resolveMovieCoverUrl(value?: string | null): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none") return undefined;
  if (lower.includes("placeholder.svg") || lower.includes("/placeholders/")) return undefined;
  return normalizePublicStorageUrl(raw, "oculto-play-media") ?? raw;
}

function isImageUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(value, base);
    return /\.(avif|webp|png|jpe?g|gif)$/i.test(u.pathname);
  } catch {
    return /\.(avif|webp|png|jpe?g|gif)(?:[?#].*)?$/i.test(value);
  }
}

function resolveCardThumb(item: LatestAdultMovie): string | undefined {
  const fromStorage = resolveMovieCoverUrl(item.thumb_url);
  if (fromStorage) return fromStorage;
  if (isImageUrl(item.media_url)) {
    const mediaImage = resolveMovieCoverUrl(item.media_url);
    if (mediaImage) return mediaImage;
  }
  const source = item.source_url || item.media_url || "";
  if (source) {
    try {
      const parsed = parseEmbeddedVideo(source);
      if (parsed?.thumbnailUrl) return parsed.thumbnailUrl;
    } catch { /* noop */ }
  }
  return undefined;
}

const SECTION_BG =
  "linear-gradient(135deg, #2a0000 0%, #5a0a0a 30%, #b30b1f 60%, #ff3146 100%)";
const HEADER_BG =
  "linear-gradient(135deg, #4a0009 0%, #8b0a16 50%, #c91528 100%)";

const SectionHeader = () => (
  <div
    className="mx-3 mb-2 rounded-xl px-3 py-2 flex items-center gap-2 shadow-[0_6px_18px_-6px_rgba(196,12,30,0.55)]"
    style={{ background: HEADER_BG, border: "1px solid rgba(255,180,180,0.25)" }}
  >
    <Film className="w-4 h-4 text-rose-100 drop-shadow" aria-hidden />
    <h3
      className="text-[12px] sm:text-[13px] font-black uppercase tracking-[0.14em] text-white drop-shadow"
      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
    >
      Filmes +18 do Oculto Play
    </h3>
  </div>
);

type CardProps = {
  i: LatestAdultMovie;
  thumb?: string;
  sourceUrl?: string | null;
  withBlur: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  onOpen: (id: string) => void;
};

function EmbeddedPreviewBackdrop({ sourceUrl, title, blurred }: { sourceUrl?: string | null; title?: string | null; blurred?: boolean }) {
  const parsed = sourceUrl ? parseEmbeddedVideo(sourceUrl) : null;
  if (!parsed) return <div className="absolute inset-0 bg-gradient-to-br from-rose-900 to-black" />;
  const mediaClass = "absolute inset-0 h-full w-full object-cover pointer-events-none " + (blurred ? "blur-2xl scale-110" : "");
  if (parsed.kind === "direct") {
    return <video src={parsed.embedSrc} muted playsInline preload="metadata" className={mediaClass} aria-hidden />;
  }
  return (
    <iframe
      src={parsed.embedSrc}
      title={title ?? "Preview do filme"}
      className={mediaClass}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="encrypted-media; picture-in-picture; web-share; fullscreen"
      tabIndex={-1}
      aria-hidden
    />
  );
}

function CoveredAdultBackdrop() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(circle at 28% 18%, rgba(255,180,190,0.18) 0, transparent 32%), radial-gradient(circle at 75% 82%, rgba(255,49,70,0.24) 0, transparent 38%), linear-gradient(145deg, #160004 0%, #360009 48%, #0a0002 100%)",
        boxShadow: "inset 0 0 0 1px rgba(255,170,180,0.12)",
      }}
      aria-hidden
    />
  );
}

const MovieCard = memo(function MovieCard({ i, thumb, sourceUrl, withBlur, revealed, onReveal, onOpen }: CardProps) {
  const effectiveViews = useEffectiveViewCount(i.id, Number(i.view_count ?? 0));
  const shouldBlur = withBlur && !revealed;
  return (
    <div
      className="adult-movie-card relative shrink-0 rounded-xl overflow-hidden bg-black/70"
      style={{ scrollSnapAlign: "start", width: "clamp(112px, 30vw, 144px)", aspectRatio: "2 / 3" }}
    >
      <button
        type="button"
        onClick={() => {
          if (shouldBlur) {
            onReveal(i.id);
            return;
          }
          onOpen(i.id);
        }}
        className="absolute inset-0 w-full h-full outline-none focus-visible:ring-2 focus-visible:ring-rose-300 rounded-xl"
        aria-label={shouldBlur ? "Mostrar filme +18" : `Abrir ${i.title ?? "filme +18"}`}
      >
        {shouldBlur ? (
          <CoveredAdultBackdrop />
        ) : thumb ? (
          <CachedImg
            src={thumb}
            alt={i.title ?? "Filme +18 do Oculto Play"}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover transition-[filter,transform] duration-300"
          />
        ) : (
          <EmbeddedPreviewBackdrop sourceUrl={sourceUrl} title={i.title} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        {!shouldBlur && (
          <PlayCircle className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 text-rose-50/95 drop-shadow-lg" />
        )}

        {shouldBlur ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-2">
            <EyeOff className="w-6 h-6 text-rose-100" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-50">
              Conteúdo +18
            </span>
            <span
              className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-black uppercase tracking-wider text-white shadow-lg"
              style={{
                background: "linear-gradient(135deg,#c91528 0%,#ff3146 100%)",
                boxShadow: "0 4px 12px rgba(201,21,40,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
              }}
            >
              <Eye className="w-3 h-3" aria-hidden /> Mostrar
            </span>
          </div>
        ) : (
          <div className="absolute bottom-0 left-0 right-0 p-1.5 text-left">
            {i.author?.username && (
              <span className="block text-[10px] text-rose-100/80 truncate">
                @{i.author.username}
              </span>
            )}
            <span className="text-[11px] font-semibold text-white drop-shadow-md line-clamp-2 leading-tight">
              {i.title || "Sem título"}
            </span>
          </div>
        )}
      </button>

      {!shouldBlur && (
        <div
          className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full bg-black/65 text-rose-50 text-[10px] font-bold flex items-center gap-1 ring-1 ring-rose-300/30 pointer-events-none"
          aria-label={`${effectiveViews} visualizações`}
        >
          <Eye className="w-2.5 h-2.5" aria-hidden />
          {formatCount(effectiveViews)}
        </div>
      )}

      <div className="absolute top-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider text-white"
        style={{ background: "linear-gradient(135deg,#7a0014,#ff3146)" }}>
        +18
      </div>
    </div>
  );
});

type Props = {
  /** Modo do feed escolhido pelo usuário. */
  isAdultOnly: boolean;
  /** Estado do botão global de Blur Seguro do feed. */
  safeBlurOn: boolean;
};

export const LatestAdultMoviesStrip = memo(function LatestAdultMoviesStrip({ isAdultOnly, safeBlurOn }: Props) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useHorizontalDragScroll(scrollRef);
  const { items, isLoading, isError } = useLatestAdultPlayMovies(true);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());

  const hydrateMany = useOcultoPlayCountersStore((s) => s.hydrateMany);
  useEffect(() => {
    if (items.length === 0) return;
    hydrateMany(items.map((i) => ({ id: i.id, view_count: i.view_count })));
  }, [items, hydrateMany]);

  const withBlur = !isAdultOnly && safeBlurOn;

  useEffect(() => {
    if (withBlur) setRevealedIds(new Set());
  }, [withBlur]);

  const openAdultMoviesSection = () => {
    try {
      // Persiste a abertura da seção "Filmes +18" para próxima visita
      localStorage.setItem("ocultoplay:section-open:v2:links_adult", "1");
    } catch { /* noop */ }
    navigate("/oculto-play#filmes-adult");
    // Scroll após navegar
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById("filmes-adult");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    });
  };

  const openItem = (id: string) => {
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
        aria-label="Filmes +18 do Oculto Play (carregando)"
      >
        <SectionHeader />
        <div className="flex gap-2 overflow-hidden px-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="rounded-xl shrink-0 bg-rose-950/40"
              style={{ width: "clamp(112px, 30vw, 144px)", aspectRatio: "2 / 3" }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (isError || items.length === 0) return null;

  return (
    <section
      className="pt-2 pb-3 my-3 mx-2 rounded-2xl shadow-[0_10px_30px_-12px_rgba(180,10,30,0.7)] ring-1 ring-rose-500/30"
      style={{ background: SECTION_BG }}
      aria-label="Filmes +18 do Oculto Play"
    >
      <SectionHeader />

      <div
        ref={scrollRef}
        id="latest-adult-movies-scroll"
        tabIndex={0}
        role="region"
        aria-label="Carrossel dos últimos Filmes +18 do Oculto Play"
        className="feed-horizontal-scroll scrollbar-hide flex gap-2 overflow-x-auto pb-1 px-3 outline-none cursor-grab"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y", scrollSnapType: "x proximity", scrollbarWidth: "none" }}
      >
        {/* CTA destaque — leva direto à seção Filmes +18 expandida. */}
        <div
          className="relative shrink-0 rounded-xl overflow-hidden flex flex-col items-center justify-between p-2.5 text-center"
          style={{
            scrollSnapAlign: "start",
            width: "clamp(124px, 33vw, 156px)",
            aspectRatio: "2 / 3",
            background:
              "linear-gradient(150deg, #1a0004 0%, #7a0014 35%, #ff3146 70%, #ffb3bd 100%)",
            boxShadow:
              "0 0 0 1px rgba(255,150,160,0.6), 0 10px 24px -8px rgba(180,10,30,0.7), inset 0 1px 0 rgba(255,255,255,0.35)",
          }}
        >
          <button
            type="button"
            onClick={openAdultMoviesSection}
            aria-label="Abrir Filmes +18 no Oculto Play e assistir agora"
            className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-rose-100 rounded-xl"
          />
          <div className="relative z-[5] flex flex-col items-center mt-1">
            <Sparkles className="w-7 h-7 text-rose-50 drop-shadow" aria-hidden />
            <span
              className="mt-1 text-[10.5px] font-black uppercase tracking-[0.14em] leading-tight text-white"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.85)" }}
            >
              +18 no Oculto Play
            </span>
            <span
              className="mt-0.5 text-[10.5px] font-extrabold leading-tight text-rose-100"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
            >
              Filmes exclusivos
            </span>
          </div>
          <span
            className="relative z-[15] pointer-events-none w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider"
            style={{
              background: "linear-gradient(180deg, #1a0004 0%, #4a000a 100%)",
              color: "#ffd9dd",
              boxShadow: "inset 0 1px 0 rgba(255,180,190,0.45), 0 2px 6px rgba(0,0,0,0.5)",
            }}
          >
            <PlayCircle className="w-3.5 h-3.5" aria-hidden /> Assistir agora
          </span>
        </div>

        {items.map((i) => {
          const thumb = resolveCardThumb(i);
          const revealed = revealedIds.has(i.id);
          return (
            <MovieCard
              key={i.id}
              i={i}
              thumb={thumb}
              sourceUrl={i.source_url || i.media_url}
              withBlur={withBlur}
              revealed={revealed}
              onReveal={(id) => setRevealedIds((s) => { const n = new Set(s); n.add(id); return n; })}
              onOpen={openItem}
            />
          );
        })}
      </div>

      <CarouselScrollbar
        scrollRef={scrollRef}
        ariaLabel="Rolar carrossel dos Filmes +18 do Oculto Play"
        controlsId="latest-adult-movies-scroll"
        className="px-3 pb-1"
        variant="red"
      />

      <style>{`
        .adult-movie-card {
          padding: 1.5px;
          background:
            linear-gradient(#000, #000) padding-box,
            linear-gradient(135deg, #ff3146 0%, #ffb3bd 25%, #ff3146 50%, #7a0014 75%, #ff3146 100%) border-box;
          border: 1.5px solid transparent;
          box-shadow:
            0 0 0 1px rgba(255, 49, 70, 0.45),
            0 0 10px rgba(255, 49, 70, 0.55),
            0 0 22px rgba(255, 49, 70, 0.3);
        }
      `}</style>
    </section>
  );
});

export default LatestAdultMoviesStrip;
