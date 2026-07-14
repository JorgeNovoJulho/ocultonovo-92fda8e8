import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { canUseCanvas } from "@/lib/profileMediaValidate";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  aspectRatio: number; // 1 = avatar, 3 = banner
  outputWidth: number;
  title: string;
  /** chave usada p/ salvar último recorte (ex: "avatar" | "banner") */
  storageKey?: string;
  /** chamado com o blob recortado OU com o arquivo original caso o canvas falhe */
  onConfirm: (blob: Blob, usedFallback: boolean) => Promise<void> | void;
}

type CropState = { zoom: number; offsetX: number; offsetY: number };

const DEFAULT_CROP: CropState = { zoom: 1, offsetX: 50, offsetY: 50 };
const LS_PREFIX = "oculto:mobileCrop:";
const SIZE_WARN_BYTES = 9 * 1024 * 1024;

function readCrop(key?: string): CropState {
  if (!key) return DEFAULT_CROP;
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return DEFAULT_CROP;
    const parsed = JSON.parse(raw);
    return {
      zoom: typeof parsed.zoom === "number" ? parsed.zoom : 1,
      offsetX: typeof parsed.offsetX === "number" ? parsed.offsetX : 50,
      offsetY: typeof parsed.offsetY === "number" ? parsed.offsetY : 50,
    };
  } catch {
    return DEFAULT_CROP;
  }
}

function writeCrop(key: string, s: CropState) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(s)); } catch {}
}

/**
 * Editor de recorte ultraleve para mobile:
 * - Zoom + posição X/Y manuais via slider
 * - Persiste último recorte por kind e restaura ao reabrir
 * - Pré-visualização com tamanho estimado (MB) e aviso antes do upload
 * - Fallback automático ao arquivo original se canvas falhar
 */
export function MobileLightCropModal({
  open,
  onOpenChange,
  file,
  aspectRatio,
  outputWidth,
  title,
  storageKey,
  onConfirm,
}: Props) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetY, setOffsetY] = useState(50);
  const [offsetX, setOffsetX] = useState(50);
  const [busy, setBusy] = useState(false);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [estBytes, setEstBytes] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
  const urlRef = useRef<string | null>(null);
  const estTimerRef = useRef<number | null>(null);

  // Open / file change: carregar imagem e restaurar último crop salvo
  useEffect(() => {
    if (!open || !file) return;
    const u = URL.createObjectURL(file);
    urlRef.current = u;
    setImgUrl(u);
    const last = readCrop(storageKey);
    setZoom(last.zoom);
    setOffsetX(last.offsetX);
    setOffsetY(last.offsetY);
    setEstBytes(null);
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setImgUrl(null);
      setImgEl(null);
      if (estTimerRef.current) {
        window.clearTimeout(estTimerRef.current);
        estTimerRef.current = null;
      }
    };
  }, [open, file, storageKey]);

  // Persistir cada alteração
  useEffect(() => {
    if (!open || !storageKey) return;
    writeCrop(storageKey, { zoom, offsetX, offsetY });
  }, [open, storageKey, zoom, offsetX, offsetY]);

  // Recorta no canvas conforme parâmetros atuais
  const cropToCanvas = (preview: boolean): HTMLCanvasElement | null => {
    if (!imgEl) return null;
    const srcW = imgEl.naturalWidth;
    const srcH = imgEl.naturalHeight;
    if (!srcW || !srcH) return null;
    const targetRatio = aspectRatio;
    let cropW = Math.min(srcW, srcH * targetRatio) / zoom;
    let cropH = cropW / targetRatio;
    if (cropH > srcH) {
      cropH = srcH / zoom;
      cropW = cropH * targetRatio;
    }
    const maxOffX = Math.max(0, srcW - cropW);
    const maxOffY = Math.max(0, srcH - cropH);
    const sx = (offsetX / 100) * maxOffX;
    const sy = (offsetY / 100) * maxOffY;
    const baseW = preview ? Math.min(480, outputWidth) : outputWidth;
    const outW = Math.min(baseW, Math.round(cropW));
    const outH = Math.round(outW / targetRatio);
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imgEl, sx, sy, cropW, cropH, 0, 0, outW, outH);
    return canvas;
  };

  // Estimar tamanho final (debounced) — usa canvas reduzido e extrapola
  useEffect(() => {
    if (!open || !imgEl || !canUseCanvas()) {
      setEstBytes(null);
      return;
    }
    if (estTimerRef.current) window.clearTimeout(estTimerRef.current);
    setEstimating(true);
    estTimerRef.current = window.setTimeout(() => {
      try {
        const c = cropToCanvas(true);
        if (!c) { setEstBytes(null); setEstimating(false); return; }
        c.toBlob((b) => {
          if (b) {
            const ratio = (outputWidth * outputWidth) / (c.width * c.width);
            setEstBytes(Math.round(b.size * Math.max(1, ratio)));
          } else {
            setEstBytes(null);
          }
          setEstimating(false);
          c.width = 0; c.height = 0;
        }, "image/jpeg", 0.85);
      } catch {
        setEstBytes(null);
        setEstimating(false);
      }
    }, 250);
    return () => {
      if (estTimerRef.current) window.clearTimeout(estTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imgEl, zoom, offsetX, offsetY, aspectRatio, outputWidth]);

  const estLabel = useMemo(() => {
    if (estBytes == null) return null;
    return `${(estBytes / 1024 / 1024).toFixed(2)} MB`;
  }, [estBytes]);

  const tooLarge = estBytes != null && estBytes > SIZE_WARN_BYTES;

  const resetCrop = () => {
    setZoom(1); setOffsetX(50); setOffsetY(50);
  };

  const handleConfirm = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (!canUseCanvas() || !imgEl) {
        await onConfirm(file, true);
        onOpenChange(false);
        return;
      }
      const canvas = cropToCanvas(false);
      if (!canvas) {
        await onConfirm(file, true);
        onOpenChange(false);
        return;
      }
      const blob: Blob | null = await new Promise((resolve) => {
        try {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
        } catch {
          resolve(null);
        }
      });
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) {
        await onConfirm(file, true);
      } else {
        await onConfirm(blob, false);
      }
      onOpenChange(false);
    } catch {
      try {
        if (file) await onConfirm(file, true);
      } catch {}
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="max-w-md p-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div
          className="relative w-full overflow-hidden rounded-lg bg-black/50"
          style={{ aspectRatio: String(aspectRatio) }}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              onLoad={(e) => setImgEl(e.currentTarget)}
              onError={() => {
                if (file) void onConfirm(file, true);
                onOpenChange(false);
              }}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: `${offsetX}% ${offsetY}%`,
                transform: `scale(${zoom})`,
                transformOrigin: `${offsetX}% ${offsetY}%`,
                willChange: "transform",
              }}
              draggable={false}
            />
          )}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">
            Pré-visualização ({aspectRatio === 1 ? "quadrada" : "banner"})
          </span>
          <span className={tooLarge ? "text-destructive font-medium" : "text-muted-foreground"}>
            {estimating ? "Calculando tamanho..." : estLabel ? `~ ${estLabel}` : ""}
          </span>
        </div>
        {tooLarge && (
          <div className="mt-1 flex items-start gap-1 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Tamanho estimado acima de 9 MB. O sistema vai recomprimir, mas pode demorar mais. Considere reduzir o zoom.</span>
          </div>
        )}

        <div className="space-y-3 mt-3">
          <div>
            <label className="text-xs text-muted-foreground">Zoom</label>
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0])}
              disabled={busy}
            />
          </div>
          {aspectRatio !== 1 && (
            <div>
              <label className="text-xs text-muted-foreground">Posição vertical</label>
              <Slider
                min={0}
                max={100}
                step={1}
                value={[offsetY]}
                onValueChange={(v) => setOffsetY(v[0])}
                disabled={busy}
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Posição horizontal</label>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[offsetX]}
              onValueChange={(v) => setOffsetX(v[0])}
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetCrop}
            disabled={busy}
            className="text-xs"
          >
            Resetar
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleConfirm} disabled={busy}>
            {busy ? "Processando..." : "Aplicar e enviar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
