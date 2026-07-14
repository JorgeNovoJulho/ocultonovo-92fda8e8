import { CSSProperties, memo, useEffect, useMemo, useState } from "react";
import { AnyLayer } from "./layerTypes";
import { ensureFont } from "./fontsCatalog";
import { ANIMATION_MAP, ensureAnimationStyles } from "./animations";

interface Props {
  layer: AnyLayer;
  /** Quando true, animação é executada (preview). */
  animate?: boolean;
  /** Para forçar reexecução. */
  animKey?: number;
}

function LayerRendererInner({ layer, animate, animKey }: Props) {
  ensureAnimationStyles();

  // Reexecuta animação ao mudar animKey
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (animate) setBump((b) => b + 1);
  }, [animate, animKey]);

  const anim = useMemo(() => {
    if (!animate || !layer.animation || layer.animation.kind === "none") return undefined;
    const name = ANIMATION_MAP[layer.animation.kind];
    if (!name) return undefined;
    return `${name} ${layer.animation.duration}ms ease-out ${layer.animation.delay}ms both`;
  }, [animate, layer.animation, bump]);

  if (layer.hidden) return null;

  const base: CSSProperties = {
    position: "absolute",
    left: layer.x,
    top: layer.y,
    width: layer.w,
    height: layer.h,
    transform: layer.rotation ? `rotate(${layer.rotation}deg)` : undefined,
    transformOrigin: "center center",
    opacity: layer.opacity,
    pointerEvents: "none",
    userSelect: "none",
    animation: anim,
  };

  if (layer.kind === "text") {
    ensureFont(layer.fontFamily);
    const strokeStyle: CSSProperties = layer.stroke
      ? ({ WebkitTextStroke: `${layer.stroke.width}px ${layer.stroke.color}` } as CSSProperties)
      : {};
    const deco: string[] = [];
    if (layer.underline) deco.push("underline");
    if (layer.strike) deco.push("line-through");
    return (
      <div
        style={{
          ...base,
          fontFamily: `"${layer.fontFamily}", sans-serif`,
          fontWeight: layer.fontWeight,
          fontSize: layer.fontSize,
          fontStyle: layer.italic ? "italic" : "normal",
          color: layer.color,
          textAlign: layer.align,
          lineHeight: layer.lineHeight,
          letterSpacing: layer.letterSpacing,
          textDecoration: deco.join(" ") || "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          display: "flex",
          alignItems: "flex-start",
          justifyContent:
            layer.align === "center" ? "center" : layer.align === "right" ? "flex-end" : "flex-start",
          ...strokeStyle,
        }}
      >
        <span style={{ width: "100%" }}>{layer.text}</span>
      </div>
    );
  }

  if (layer.kind === "image") {
    const filters: string[] = [];
    if (layer.filterBlur) filters.push(`blur(${layer.filterBlur}px)`);
    if (layer.brightness != null && layer.brightness !== 100) filters.push(`brightness(${layer.brightness}%)`);
    if (layer.contrast != null && layer.contrast !== 100) filters.push(`contrast(${layer.contrast}%)`);
    if (layer.saturation != null && layer.saturation !== 100) filters.push(`saturate(${layer.saturation}%)`);
    if (layer.hue) filters.push(`hue-rotate(${layer.hue}deg)`);
    if (layer.sepia) filters.push(`sepia(${layer.sepia}%)`);
    if (layer.grayscale) filters.push(`grayscale(${layer.grayscale}%)`);
    if (layer.invert) filters.push(`invert(${layer.invert}%)`);

    const shadowParts: string[] = [];
    if (layer.shadow) {
      const s = layer.shadow;
      shadowParts.push(`${s.x}px ${s.y}px ${s.blur}px ${s.color}`);
    }
    if (layer.glow) shadowParts.push(`0 0 ${layer.glow.blur}px ${layer.glow.color}`);

    const margin = layer.margin ?? 0;
    const borderW = layer.borderWidth ?? 0;
    return (
      <div
        style={{
          ...base,
          background: margin > 0 ? (layer.marginColor ?? "#ffffff") : undefined,
          padding: margin,
          borderRadius: layer.radius ?? 0,
          boxShadow: shadowParts.join(", ") || undefined,
          border: borderW > 0 ? `${borderW}px ${layer.borderStyle ?? "solid"} ${layer.borderColor ?? "#000"}` : undefined,
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: Math.max(0, (layer.radius ?? 0) - margin) }}>
          <img
            src={layer.src}
            alt=""
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: layer.fit,
              display: "block",
              pointerEvents: "none",
              filter: filters.join(" ") || undefined,
            }}
          />
          {layer.filterDarken ? (
            <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${layer.filterDarken})`, pointerEvents: "none" }} />
          ) : null}
          {layer.vignette ? (
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at center, transparent 55%, rgba(0,0,0,0.6) 100%)", pointerEvents: "none" }} />
          ) : null}
        </div>
      </div>
    );
  }

  // shape
  if (layer.shape === "rect") {
    return (
      <div
        style={{
          ...base,
          background: layer.fill,
          borderRadius: layer.radius ?? 0,
          border:
            layer.stroke && layer.strokeWidth
              ? `${layer.strokeWidth}px solid ${layer.stroke}`
              : undefined,
        }}
      />
    );
  }
  if (layer.shape === "circle") {
    return (
      <div
        style={{
          ...base,
          background: layer.fill,
          borderRadius: "50%",
          border:
            layer.stroke && layer.strokeWidth
              ? `${layer.strokeWidth}px solid ${layer.stroke}`
              : undefined,
        }}
      />
    );
  }
  if (layer.shape === "svg" && layer.svgPath) {
    return (
      <div style={base}>
        <svg
          width="100%"
          height="100%"
          viewBox={layer.svgViewBox ?? "0 0 100 100"}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          <path
            d={layer.svgPath}
            fill={layer.fill}
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth ?? 0}
          />
        </svg>
      </div>
    );
  }
  return (
    <div
      style={{
        ...base,
        background: layer.fill,
        height: Math.max(2, layer.strokeWidth ?? 4),
        borderRadius: 999,
      }}
    />
  );
}

export const LayerRenderer = memo(LayerRendererInner);
