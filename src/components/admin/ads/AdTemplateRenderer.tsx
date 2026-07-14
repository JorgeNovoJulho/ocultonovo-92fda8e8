/**
 * Renderizador unificado de templates de anúncio.
 * Usado tanto pelo thumbnail da galeria quanto pelo preview final.
 * Switch por `variant` — flat design, sem libs pesadas, mobile-first.
 */
import { memo } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdTemplatePayload } from "./adTemplatesLibrary";

export interface AdRenderData {
  title: string;
  description?: string;
  ctaText: string;
  imageUrl?: string;
  payload: AdTemplatePayload;
}

interface Props {
  data: AdRenderData;
  /** "thumb" reduz textos e esconde detalhes para caber em cards pequenos. */
  mode?: "thumb" | "preview";
  className?: string;
}

const FONT_CLASS: Record<NonNullable<AdTemplatePayload["titleFont"]>, string> = {
  sans: "font-sans",
  serif: "font-serif tracking-tight",
  display: "font-sans tracking-tight uppercase",
};

function Badge({
  text,
  style = "solid",
  accent,
  textOnDark,
}: {
  text: string;
  style?: "solid" | "outline" | "ghost";
  accent: string;
  textOnDark?: boolean;
}) {
  if (style === "outline") {
    return (
      <span
        className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border tracking-wide"
        style={{ borderColor: accent, color: accent }}
      >
        {text}
      </span>
    );
  }
  if (style === "ghost") {
    return (
      <span
        className="text-[9px] font-bold uppercase px-1.5 py-0.5 tracking-wider"
        style={{ color: textOnDark ? "#fff" : accent }}
      >
        {text}
      </span>
    );
  }
  return (
    <span
      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white tracking-wide"
      style={{ backgroundColor: accent }}
    >
      {text}
    </span>
  );
}

export const AdTemplateRenderer = memo(function AdTemplateRenderer({
  data,
  mode = "preview",
  className,
}: Props) {
  const { payload, title, description, ctaText, imageUrl } = data;
  const accent = payload.accent || "#ec4899";
  const dark = !!payload.textOnDark;
  const fontClass = FONT_CLASS[payload.titleFont ?? "sans"];
  const bgStyle: React.CSSProperties = payload.gradient
    ? { background: payload.gradient }
    : payload.bg
      ? { backgroundColor: payload.bg }
      : {};

  const textColor = dark ? "#fff" : payload.bg === "#fafaf7" || payload.bg === "#f5f5f0" || payload.bg === "#fbf7ff" ? "#0f172a" : undefined;

  const isThumb = mode === "thumb";
  const titleSize = isThumb
    ? "text-[11px] leading-tight line-clamp-2"
    : "text-base sm:text-lg leading-tight line-clamp-3";
  const descSize = isThumb
    ? "text-[9px] line-clamp-1 opacity-80"
    : "text-xs sm:text-sm line-clamp-2 opacity-80";
  const ctaSize = isThumb ? "text-[9px] px-2 py-0.5" : "text-xs sm:text-sm px-3 py-1.5";

  const wrapper = cn(
    "relative w-full h-full overflow-hidden rounded-lg",
    "flex flex-col",
    className,
  );

  // ────────────────────────────────────────────────────────────────
  // VARIANTES
  // ────────────────────────────────────────────────────────────────

  // CLASSIC: imagem topo, texto abaixo (estilo card de feed)
  if (payload.variant === "classic") {
    return (
      <div className={wrapper} style={bgStyle}>
        {!isThumb && (
          <div className="flex items-center justify-between px-2 py-1 bg-black/5 dark:bg-white/5">
            <div className="flex items-center gap-1">
              <Megaphone className="h-3 w-3" style={{ color: accent }} />
              <span className="text-[9px] font-semibold uppercase tracking-wide opacity-60">Patrocinado</span>
            </div>
            {payload.badge && (
              <Badge text={payload.badge} style={payload.badgeStyle} accent={accent} textOnDark={dark} />
            )}
          </div>
        )}
        <div className="relative w-full bg-muted flex-1" style={{ minHeight: isThumb ? 60 : 140 }}>
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] opacity-50">imagem</div>
          )}
          {isThumb && payload.badge && (
            <div className="absolute top-1 right-1">
              <Badge text={payload.badge} style={payload.badgeStyle} accent={accent} textOnDark={dark} />
            </div>
          )}
        </div>
        <div className={cn("p-2 space-y-1", fontClass)} style={{ color: textColor }}>
          <h3 data-ad-slot="title" className={cn("font-bold", titleSize)}>{title || "Título do anúncio"}</h3>
          {description && <p data-ad-slot="description" className={descSize}>{description}</p>}
          <span
            className={cn("inline-flex items-center gap-1 rounded-md font-semibold text-white", ctaSize)}
            style={{ backgroundColor: accent }}
          >
            {ctaText || "Saiba mais"}
            {!isThumb && <ExternalLink className="h-3 w-3" />}
          </span>
        </div>
      </div>
    );
  }

  // BOLD-OVERLAY: título gigante sobre a imagem
  if (payload.variant === "bold-overlay") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="relative w-full h-full">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: payload.gradient || `linear-gradient(135deg,${accent},${accent}cc)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
          {payload.badge && (
            <div className="absolute top-2 left-2">
              <Badge text={payload.badge} style={payload.badgeStyle} accent={accent} textOnDark />
            </div>
          )}
          <div className={cn("absolute inset-x-0 bottom-0 p-2 space-y-1 text-white", fontClass)}>
            <h3 data-ad-slot="title" className={cn("font-black drop-shadow", isThumb ? "text-[12px] leading-tight line-clamp-2" : "text-xl sm:text-2xl leading-[1.05] line-clamp-3")}>
              {title || "MANCHETE FORTE"}
            </h3>
            {description && !isThumb && <p data-ad-slot="description" className={descSize}>{description}</p>}
            <span data-ad-slot="cta" className={cn("inline-flex items-center gap-1 rounded-full font-bold text-black bg-white", ctaSize)}>
              {ctaText || "Ver agora"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // SPLIT-PRODUCT: imagem esquerda, texto direita
  if (payload.variant === "split-product") {
    return (
      <div className={cn(wrapper, "flex-row")} style={bgStyle}>
        <div className="relative w-2/5 bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0" style={{ background: accent }} />
          )}
        </div>
        <div className={cn("flex-1 p-2 flex flex-col justify-center gap-1", fontClass)} style={{ color: textColor }}>
          {payload.badge && (
            <div><Badge text={payload.badge} style={payload.badgeStyle} accent={accent} textOnDark={dark} /></div>
          )}
          <h3 data-ad-slot="title" className={cn("font-bold", titleSize)}>{title || "Produto destaque"}</h3>
          {description && <p data-ad-slot="description" className={descSize}>{description}</p>}
          <span
            className={cn("inline-flex w-fit items-center gap-1 rounded-md font-semibold text-white mt-1", ctaSize)}
            style={{ backgroundColor: accent }}
          >
            {ctaText || "Comprar"}
          </span>
        </div>
      </div>
    );
  }

  // EVENT-DARK: dark com acento dourado, data destacada
  if (payload.variant === "event-dark") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="relative w-full h-full p-2 flex flex-col">
          <div className="flex items-center justify-between">
            {payload.badge && <Badge text={payload.badge} style="outline" accent={accent} textOnDark />}
            <span className="text-[9px] uppercase tracking-widest" style={{ color: accent }}>Oculto</span>
          </div>
          <div className="flex-1 flex items-center justify-center my-2 rounded overflow-hidden bg-black/40">
            {imageUrl && (
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover opacity-70" />
            )}
          </div>
          <div className={cn("space-y-1 text-white", fontClass)}>
            <h3 data-ad-slot="title" className={cn("font-bold", titleSize)} style={{ color: accent }}>
              {title || "Noite Exclusiva"}
            </h3>
            {description && <p data-ad-slot="description" className={descSize}>{description}</p>}
            <span data-ad-slot="cta" className={cn("inline-flex items-center gap-1 rounded-sm font-semibold border", ctaSize)} style={{ borderColor: accent, color: accent }}>
              {ctaText || "Reservar"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // MINIMAL-SERIF: editorial limpo
  if (payload.variant === "minimal-serif") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="p-2 flex-1 flex flex-col gap-1.5" style={{ color: textColor }}>
          {payload.badge && (
            <span className="text-[8px] uppercase tracking-[0.2em] opacity-60">{payload.badge}</span>
          )}
          <h3 data-ad-slot="title" className={cn("font-serif font-medium leading-tight", isThumb ? "text-[12px] line-clamp-2" : "text-xl sm:text-2xl line-clamp-3")}>
            {title || "Um novo capítulo começa aqui."}
          </h3>
          {description && <p data-ad-slot="description" className={cn("font-serif italic", descSize)}>{description}</p>}
          {imageUrl && (
            <div className="flex-1 min-h-[40px] mt-1 overflow-hidden rounded-sm">
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover grayscale" />
            </div>
          )}
          <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 border-b font-medium", ctaSize.replace("px-2", "px-0").replace("py-0.5", "py-0"))} style={{ borderColor: accent, color: accent }}>
            {ctaText || "Conhecer"} →
          </span>
        </div>
      </div>
    );
  }

  // MAGAZINE: texto esquerda + imagem direita
  if (payload.variant === "magazine") {
    return (
      <div className={cn(wrapper, "flex-row")} style={bgStyle}>
        <div className={cn("flex-1 p-2 flex flex-col justify-between gap-1", fontClass)} style={{ color: textColor }}>
          {payload.badge && <Badge text={payload.badge} style="ghost" accent={accent} />}
          <h3 data-ad-slot="title" className={cn("font-serif font-bold leading-tight", isThumb ? "text-[12px] line-clamp-3" : "text-lg sm:text-xl line-clamp-4")}>
            {title || "Manchete editorial"}
          </h3>
          <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 rounded-full font-semibold text-white", ctaSize)} style={{ backgroundColor: accent }}>
            {ctaText || "Ler"}
          </span>
        </div>
        <div className="w-2/5 bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: accent }} />
          )}
        </div>
      </div>
    );
  }

  // GRADIENT-TEXT: sem imagem, fundo gradiente
  if (payload.variant === "gradient-text") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className={cn("absolute inset-0 p-2 flex flex-col justify-between text-white", fontClass)}>
          {payload.badge && (
            <span className="text-[10px] font-black tracking-widest opacity-90">{payload.badge}</span>
          )}
          <h3 data-ad-slot="title" className={cn("font-black uppercase leading-[0.95]", isThumb ? "text-[14px] line-clamp-3" : "text-2xl sm:text-3xl line-clamp-4")}>
            {title || "Black Week"}
          </h3>
          <div className="flex items-end justify-between">
            {description && <p data-ad-slot="description" className={descSize}>{description}</p>}
            <span data-ad-slot="cta" className={cn("inline-flex items-center gap-1 rounded-full font-bold text-black bg-white", ctaSize)}>
              {ctaText || "Ver"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // NEON-GLOW: dark + acento neon
  if (payload.variant === "neon-glow") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="absolute inset-0 opacity-30">
          {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />}
        </div>
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(circle at 30% 30%, ${accent}33, transparent 60%)` }}
        />
        <div className={cn("relative p-2 flex flex-col justify-end h-full text-white gap-1", fontClass)}>
          {payload.badge && (
            <div><Badge text={payload.badge} style="outline" accent={accent} textOnDark /></div>
          )}
          <h3 data-ad-slot="title" className={cn("font-black uppercase leading-tight", isThumb ? "text-[12px] line-clamp-2" : "text-xl sm:text-2xl line-clamp-3")} style={{ color: accent, textShadow: `0 0 8px ${accent}66` }}>
            {title || "AO VIVO"}
          </h3>
          {description && !isThumb && <p data-ad-slot="description" className={descSize}>{description}</p>}
          <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 rounded-sm font-bold border", ctaSize)} style={{ borderColor: accent, color: accent }}>
            {ctaText || "Entrar"}
          </span>
        </div>
      </div>
    );
  }

  // POSTER-FULLBLEED: imagem inteira com overlay
  if (payload.variant === "poster-fullbleed") {
    return (
      <div className={wrapper}>
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-muted" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-black/85" />
        <div className={cn("relative p-2 flex flex-col justify-end h-full text-white gap-1", fontClass)}>
          {payload.badge && <Badge text={payload.badge} style="ghost" accent="#fff" textOnDark />}
          <h3 data-ad-slot="title" className={cn("font-black uppercase leading-[0.95] drop-shadow", isThumb ? "text-[13px] line-clamp-2" : "text-2xl sm:text-3xl line-clamp-3")}>
            {title || "Você foi escolhido."}
          </h3>
          {description && !isThumb && <p data-ad-slot="description" className={descSize}>{description}</p>}
          <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 rounded-full font-bold text-black bg-white mt-1", ctaSize)}>
            {ctaText || "Entrar"}
          </span>
        </div>
      </div>
    );
  }

  // QUOTE: depoimento
  if (payload.variant === "quote") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className={cn("relative p-2 flex flex-col h-full gap-1.5", fontClass)} style={{ color: textColor }}>
          <span className="text-3xl leading-none font-serif" style={{ color: accent }}>“</span>
          <h3 data-ad-slot="title" className={cn("font-serif italic leading-snug", isThumb ? "text-[11px] line-clamp-3" : "text-base sm:text-lg line-clamp-4")}>
            {title || "Mudou a forma como vejo o mundo."}
          </h3>
          {description && <p data-ad-slot="description" className={cn("font-semibold", descSize)} style={{ color: accent }}>{description}</p>}
          {imageUrl && !isThumb && (
            <div className="mt-auto w-12 h-12 rounded-full overflow-hidden border-2" style={{ borderColor: accent }}>
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </div>
          )}
          <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 rounded-full font-semibold text-white", ctaSize)} style={{ backgroundColor: accent }}>
            {ctaText || "Experimentar"}
          </span>
        </div>
      </div>
    );
  }

  // GRADIENT-HERO: inspirado na propaganda 1 — texto branco gigante + CTA outline pill
  if (payload.variant === "gradient-hero") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className={cn("relative flex flex-col justify-center h-full text-white", isThumb ? "p-2 gap-1.5" : "p-4 sm:p-6 gap-3", fontClass)}>
          {payload.badge && !isThumb && (
            <div className="self-start"><Badge text={payload.badge} style="ghost" accent="#fff" textOnDark /></div>
          )}
          <h3 data-ad-slot="title"
            className={cn(
              "font-black leading-[0.95]",
              isThumb ? "text-[12px] line-clamp-5" : "text-2xl sm:text-4xl md:text-5xl line-clamp-6",
            )}
            style={{ color: accent }}
          >
            {title || "Ser premium é mais gostoso e divertido."}
          </h3>
          {description && !isThumb && <p data-ad-slot="description" className={cn(descSize, "text-white/90")}>{description}</p>}
          <span
            className={cn(
              "inline-flex w-fit items-center justify-center rounded-full border-2 font-semibold mt-1",
              isThumb ? "text-[9px] px-2.5 py-1" : "text-sm sm:text-base px-6 py-2.5",
            )}
            style={{ borderColor: accent, color: accent }}
          >
            {ctaText || "Conheça os planos"}
          </span>
        </div>
      </div>
    );
  }

  // SPLIT-PORTRAIT: inspirado na propaganda 2 — serif multi-cor + retrato + CTA full-width
  if (payload.variant === "split-portrait") {
    const words = (title || "Seja destaque onde todos são iguais").split(/\s+/);
    const accentSoft = `${accent}b0`;
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="relative flex h-full w-full">
          <div className={cn("flex-1 flex flex-col justify-center gap-1", isThumb ? "p-2 pb-6" : "p-4 sm:p-6 pb-14")}>
            <div className={cn("font-serif leading-[1.0]", isThumb ? "text-[11px]" : "text-xl sm:text-3xl md:text-4xl")} style={{ color: accent }}>
              {words.map((w, i) => {
                const big = i === Math.floor(words.length / 2) || i === Math.min(words.length - 1, 2);
                const soft = i % 3 === 0;
                return (
                  <span
                    key={i}
                    className={cn("mr-1.5 inline-block", big ? "font-bold" : "font-light italic")}
                    style={{ color: soft ? accentSoft : accent, fontSize: big ? "1.3em" : "1em" }}
                  >
                    {w}
                  </span>
                );
              })}
            </div>
            {description && !isThumb && (
              <p data-ad-slot="description" className={cn("font-serif italic mt-1", descSize)} style={{ color: accentSoft }}>{description}</p>
            )}
          </div>
          <div className="w-2/5 relative bg-muted overflow-hidden">
            {imageUrl ? (
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${accent}33,${accent}11)` }} />
            )}
          </div>
          <div className={cn("absolute left-0 right-0 bottom-0 flex justify-center", isThumb ? "p-1.5" : "p-3 sm:p-4")}>
            <span
              className={cn(
                "rounded-full text-white text-center font-semibold tracking-wide uppercase w-full max-w-[85%]",
                isThumb ? "text-[8px] px-2 py-0.5" : "text-sm sm:text-base px-6 py-2.5",
              )}
              style={{ backgroundColor: accent }}
            >
              {ctaText || "EU QUERO!"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // RIBBON-STACK: 3 faixas coloridas + manchete vazada
  if (payload.variant === "ribbon-stack") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className={cn("relative h-full w-full flex flex-col justify-center items-center text-white", isThumb ? "p-2 gap-1" : "p-4 gap-2", fontClass)}>
          <h3 data-ad-slot="title" className={cn("font-black uppercase text-center leading-[0.9] drop-shadow", isThumb ? "text-[13px] line-clamp-3" : "text-2xl sm:text-4xl line-clamp-3")}>
            {title || "TUDO MUDA AGORA"}
          </h3>
          {description && !isThumb && <p data-ad-slot="description" className={cn(descSize, "text-center text-white/90")}>{description}</p>}
          <span data-ad-slot="cta" className={cn("rounded-full bg-white text-black font-bold", ctaSize)}>{ctaText || "Aproveitar"}</span>
        </div>
      </div>
    );
  }

  // DUOTONE-CARD: imagem em duotone + texto sobreposto
  if (payload.variant === "duotone-card") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="absolute inset-0">
          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
              style={{ filter: "grayscale(1) contrast(1.1)", opacity: 0.65 }}
            />
          )}
          <div
            className="absolute inset-0 mix-blend-multiply"
            style={{ background: `linear-gradient(135deg,${payload.bg || "#0f172a"}, ${accent}66)` }}
          />
        </div>
        <div className={cn("relative h-full flex flex-col justify-end gap-1 text-white", isThumb ? "p-2" : "p-3 sm:p-4", fontClass)}>
          {payload.badge && (
            <div className="absolute top-2 left-2"><Badge text={payload.badge} style="solid" accent={accent} /></div>
          )}
          <h3 data-ad-slot="title" className={cn("font-black uppercase leading-tight", isThumb ? "text-[12px] line-clamp-2" : "text-xl sm:text-2xl line-clamp-3")} style={{ color: accent }}>
            {title || "A noite acontece"}
          </h3>
          {description && !isThumb && <p data-ad-slot="description" className={descSize}>{description}</p>}
          <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 rounded-md font-bold text-black", ctaSize)} style={{ backgroundColor: accent }}>
            {ctaText || "Entrar"}
          </span>
        </div>
      </div>
    );
  }

  // STICKER-POP: cores chapadas + adesivo rotacionado
  if (payload.variant === "sticker-pop") {
    return (
      <div className={wrapper} style={bgStyle}>
        <div className="relative h-full w-full flex flex-col">
          <div className={cn("flex-1 relative overflow-hidden rounded-md", isThumb ? "m-1.5" : "m-2 sm:m-3")} style={{ background: accent }}>
            {imageUrl && (
              <img src={imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover mix-blend-multiply" />
            )}
            {payload.badge && (
              <div className="absolute -top-1 -right-1 rotate-12">
                <span className="inline-block bg-black text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">{payload.badge}</span>
              </div>
            )}
          </div>
          <div className={cn("space-y-1", isThumb ? "p-2" : "p-3", fontClass)} style={{ color: "#0f172a" }}>
            <h3 data-ad-slot="title" className={cn("font-black leading-tight", isThumb ? "text-[11px] line-clamp-2" : "text-lg sm:text-2xl line-clamp-2")}>
              {title || "É hoje. É agora."}
            </h3>
            {description && !isThumb && <p data-ad-slot="description" className={descSize}>{description}</p>}
            <span data-ad-slot="cta" className={cn("inline-flex w-fit items-center gap-1 rounded-full font-bold text-white bg-black", ctaSize)}>
              {ctaText || "Pegar o meu"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className={wrapper} style={bgStyle}>
      <div className="p-2 text-xs">{title}</div>
    </div>
  );
});
