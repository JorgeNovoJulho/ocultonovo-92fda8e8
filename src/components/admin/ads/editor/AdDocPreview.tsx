import { LayerRenderer } from "./LayerRenderer";
import { AdDoc } from "./layerTypes";
import { useEffect, useRef, useState } from "react";
import { preloadFonts } from "./fontsCatalog";

interface Props {
  doc: AdDoc;
  className?: string;
  /** Página a renderizar (0 = doc raiz). */
  pageIndex?: number;
  /** Executar animações na entrada. */
  animate?: boolean;
}

/** Renderiza um AdDoc (ou uma página específica) escalado para caber no contêiner. */
export function AdDocPreview({ doc, className, pageIndex = 0, animate }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  // Resolve a página solicitada (0 = doc; 1+ = doc.pages[i-1])
  const page: AdDoc =
    pageIndex === 0 ? doc : doc.pages?.[pageIndex - 1] ?? doc;

  useEffect(() => {
    const allLayers = [
      ...doc.layers,
      ...(doc.pages ?? []).flatMap((p) => p.layers),
    ];
    preloadFonts(allLayers.filter((l) => l.kind === "text").map((l: any) => l.fontFamily));
  }, [doc]);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      setScale(Math.min(w / page.width, h / page.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.width, page.height]);

  const bg = page.backgroundImage
    ? `url(${page.backgroundImage}) center/cover no-repeat, ${page.background}`
    : page.background;

  return (
    <div ref={ref} className={className} style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: page.width,
          height: page.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
          background: bg,
        }}
      >
        {page.layers.map((l) => (
          <LayerRenderer key={l.id} layer={l} animate={animate} />
        ))}
      </div>
    </div>
  );
}
