/**
 * AdImageCropper — recorte de imagens sem libs externas.
 *
 * - Pointer events nativos (mobile + desktop) para arrastar e redimensionar.
 * - Coordenadas normalizadas [0..1] sobre a imagem natural.
 * - Saída: WebP dataURL (até 1600px no maior lado), pronto para uso em <img>.
 * - Aspect-ratios pré-definidos por dispositivo + livre.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, RotateCcw, Check, X, Smartphone, Tablet, Monitor, Square } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Rect {
  x: number; // 0..1
  y: number;
  w: number;
  h: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  onApply: (dataUrl: string) => void;
}

const RATIOS: { key: string; label: string; icon: any; ratio: number | null }[] = [
  { key: "free", label: "Livre", icon: Square, ratio: null },
  { key: "mobile", label: "9:14", icon: Smartphone, ratio: 9 / 14 },
  { key: "tablet", label: "4:5", icon: Tablet, ratio: 4 / 5 },
  { key: "desktop", label: "16:9", icon: Monitor, ratio: 16 / 9 },
];

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function AdImageCropper({ open, onOpenChange, imageUrl, onApply }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [displayBox, setDisplayBox] = useState<{ left: number; top: number; w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [ratioKey, setRatioKey] = useState<string>("free");
  const [applying, setApplying] = useState(false);

  // Carrega tamanho real da imagem
  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setImgSize(null);
    img.src = imageUrl;
  }, [open, imageUrl]);

  // Calcula área visível (object-contain) dentro do palco
  const recalcDisplayBox = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !imgSize) return;
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const ir = imgSize.w / imgSize.h;
    const sr = sw / sh;
    let w: number, h: number;
    if (ir > sr) {
      w = sw;
      h = sw / ir;
    } else {
      h = sh;
      w = sh * ir;
    }
    setDisplayBox({ left: (sw - w) / 2, top: (sh - h) / 2, w, h });
  }, [imgSize]);

  useEffect(() => {
    recalcDisplayBox();
    const ro = new ResizeObserver(recalcDisplayBox);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [recalcDisplayBox, open]);

  // Trava aspect ratio quando muda
  useEffect(() => {
    const r = RATIOS.find((x) => x.key === ratioKey)?.ratio;
    if (!r || !displayBox) return;
    // ratio relativo à imagem natural: w_img / h_img = r → em coords normalizadas:
    // (rect.w * imgW) / (rect.h * imgH) = r → rect.w/rect.h = r * (imgH/imgW)
    if (!imgSize) return;
    const target = r * (imgSize.h / imgSize.w);
    setRect((p) => {
      let w = p.w;
      let h = w / target;
      if (h > 1) {
        h = 1;
        w = h * target;
      }
      const x = clamp(p.x, 0, 1 - w);
      const y = clamp(p.y, 0, 1 - h);
      return { x, y, w, h };
    });
  }, [ratioKey, displayBox, imgSize]);

  // Pointer drag (move + resize)
  const dragRef = useRef<{
    mode: "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;
    start: { x: number; y: number; rect: Rect } | null;
  }>({ mode: null, start: null });

  const onPointerDown = (mode: typeof dragRef.current.mode) => (e: React.PointerEvent) => {
    if (!displayBox) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      start: { x: e.clientX, y: e.clientY, rect: { ...rect } },
    };
    e.stopPropagation();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { mode, start } = dragRef.current;
    if (!mode || !start || !displayBox) return;
    const dx = (e.clientX - start.x) / displayBox.w;
    const dy = (e.clientY - start.y) / displayBox.h;
    setRect(() => {
      let { x, y, w, h } = start.rect;
      const r = RATIOS.find((x) => x.key === ratioKey)?.ratio;
      const aspect = r && imgSize ? r * (imgSize.h / imgSize.w) : null;
      if (mode === "move") {
        x = clamp(x + dx, 0, 1 - w);
        y = clamp(y + dy, 0, 1 - h);
      } else {
        // resize handles
        let nx = x, ny = y, nw = w, nh = h;
        if (mode.includes("e")) nw = clamp(w + dx, 0.05, 1 - x);
        if (mode.includes("s")) nh = clamp(h + dy, 0.05, 1 - y);
        if (mode.includes("w")) {
          const newX = clamp(x + dx, 0, x + w - 0.05);
          nw = w + (x - newX);
          nx = newX;
        }
        if (mode.includes("n")) {
          const newY = clamp(y + dy, 0, y + h - 0.05);
          nh = h + (y - newY);
          ny = newY;
        }
        if (aspect) {
          // mantém o aspecto travado, ajusta o eixo dependente
          if (mode === "e" || mode === "w") nh = nw / aspect;
          else if (mode === "n" || mode === "s") nw = nh * aspect;
          else {
            // diagonal: usa o maior delta como dominante
            if (Math.abs(dx) > Math.abs(dy)) nh = nw / aspect;
            else nw = nh * aspect;
          }
          // recalcula posição se estourou
          if (nx + nw > 1) nw = 1 - nx;
          if (ny + nh > 1) nh = 1 - ny;
        }
        x = nx; y = ny; w = nw; h = nh;
      }
      return { x, y, w, h };
    });
  };

  const onPointerUp = () => { dragRef.current = { mode: null, start: null }; };

  const apply = async () => {
    if (!imgSize || !imageUrl) return;
    setApplying(true);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = imageUrl;
      });
      const sx = Math.round(rect.x * img.naturalWidth);
      const sy = Math.round(rect.y * img.naturalHeight);
      const sw = Math.max(1, Math.round(rect.w * img.naturalWidth));
      const sh = Math.max(1, Math.round(rect.h * img.naturalHeight));
      // Limita output para 1600px no maior lado
      const maxOut = 1600;
      const outScale = Math.min(1, maxOut / Math.max(sw, sh));
      const ow = Math.max(1, Math.round(sw * outScale));
      const oh = Math.max(1, Math.round(sh * outScale));
      const c = document.createElement("canvas");
      c.width = ow; c.height = oh;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ow, oh);
      const dataUrl = c.toDataURL("image/webp", 0.85);
      onApply(dataUrl);
      onOpenChange(false);
    } catch (e) {
      console.error("[crop] falha", e);
      // Em caso de CORS (origem cross sem CORS), avisa o usuário
      alert("Não foi possível recortar essa imagem (origem bloqueia leitura). Faça upload ou use a biblioteca interna.");
    } finally {
      setApplying(false);
    }
  };

  const reset = () => setRect({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });

  // Coordenadas de tela do retângulo (em px relativos ao palco)
  const px = displayBox
    ? {
        left: displayBox.left + rect.x * displayBox.w,
        top: displayBox.top + rect.y * displayBox.h,
        w: rect.w * displayBox.w,
        h: rect.h * displayBox.h,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-full p-0 gap-0 max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop className="h-4 w-4" /> Recortar imagem
          </DialogTitle>
        </DialogHeader>

        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center gap-1.5 bg-muted/30">
          {RATIOS.map((r) => {
            const Icon = r.icon;
            const active = ratioKey === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRatioKey(r.key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
                title={`Aspect-ratio ${r.label}`}
              >
                <Icon className="h-3.5 w-3.5" /> {r.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={reset} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Resetar</span>
            </Button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="relative flex-1 min-h-[260px] sm:min-h-[400px] bg-black/80 overflow-hidden select-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imageUrl ? (
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Imagem para recortar"
              draggable={false}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/60 text-sm">
              Sem imagem
            </div>
          )}

          {px && (
            <>
              {/* Overlay escurecido fora do recorte (4 retângulos) */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bg-black/60" style={{ left: 0, top: 0, right: 0, height: px.top }} />
                <div className="absolute bg-black/60" style={{ left: 0, top: px.top + px.h, right: 0, bottom: 0 }} />
                <div className="absolute bg-black/60" style={{ left: 0, top: px.top, width: px.left, height: px.h }} />
                <div className="absolute bg-black/60" style={{ left: px.left + px.w, top: px.top, right: 0, height: px.h }} />
              </div>

              {/* Caixa do recorte */}
              <div
                className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                style={{ left: px.left, top: px.top, width: px.w, height: px.h, touchAction: "none" }}
                onPointerDown={onPointerDown("move")}
              >
                {/* Grade 3x3 */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                  <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                  <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                  <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
                </div>

                {/* Handles */}
                {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => {
                  const pos: React.CSSProperties = { position: "absolute" };
                  const size = 14;
                  const half = size / 2;
                  if (h.includes("n")) pos.top = -half;
                  if (h.includes("s")) pos.bottom = -half;
                  if (h.includes("w")) pos.left = -half;
                  if (h.includes("e")) pos.right = -half;
                  if (h === "n" || h === "s") { pos.left = `calc(50% - ${half}px)`; }
                  if (h === "e" || h === "w") { pos.top = `calc(50% - ${half}px)`; }
                  const cursor = {
                    n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
                    ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
                  }[h];
                  return (
                    <div
                      key={h}
                      onPointerDown={onPointerDown(h)}
                      style={{ ...pos, width: size, height: size, cursor, touchAction: "none" }}
                      className="bg-white border border-black/40 rounded-sm hover:scale-110 transition-transform"
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border bg-card flex items-center justify-between gap-2 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            {imgSize ? `${imgSize.w}×${imgSize.h}px` : "carregando..."}
            {imgSize && (
              <> · recorte: {Math.round(rect.w * imgSize.w)}×{Math.round(rect.h * imgSize.h)}px</>
            )}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} className="gap-1">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              size="sm"
              onClick={apply}
              disabled={applying || !imgSize}
              className="gap-1 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
            >
              <Check className="h-3.5 w-3.5" />
              {applying ? "Aplicando..." : "Aplicar recorte"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
