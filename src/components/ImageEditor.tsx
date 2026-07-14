import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  X,
  Check,
  Smile,
  RotateCcw,
  Grid3X3,
  Sparkles,
  Loader2,
  Image as ImageIcon,
  Minus,
  Plus,
  Trash2,
  Type,
  ArrowUp,
  ArrowDown,
  Crop as CropIcon,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { useProfile } from "@/hooks/useProfile";

interface ImageEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageFile: File;
  onSave: (editedImageUrl: string) => void;
  /** Chamado quando a imagem não pode ser decodificada (HEIC, corrompida, etc). */
  onLoadError?: (reason?: string) => void;
}


interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Sticker {
  id: string;
  kind: "emoji" | "image" | "text";
  /** emoji char OR image element OR text string */
  emoji?: string;
  image?: HTMLImageElement;
  text?: string;
  color?: string;
  x: number; // center x
  y: number; // center y
  size: number; // bounding box size (font size for emoji/text, max-dim for image)
}

const EMOJI_OPTIONS = ["😏", "🔥", "💋", "🖤", "✨", "👀", "💎", "🌙", "🎭", "💜"];
const TEXT_COLORS = ["#ffffff", "#000000", "#ff2d55", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#bf5af2"];
const TEXT_SIZE_OPTIONS = [24, 36, 48, 64, 96, 128];
/** Blur intensity (maior = mais agressivo). 28-36 dá censura forte. */
const BLUR_PIXEL_SIZE = 32;

export function ImageEditor({ open, onOpenChange, imageFile, onSave, onLoadError }: ImageEditorProps) {
  const user = useAuthStore((s) => s.user);
  const { profile } = useProfile();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayInputRef = useRef<HTMLInputElement>(null);

  // 3 posições aleatórias (sorteadas uma vez por abertura do editor)
  const watermarkAnchors = useMemo(() => {
    const zones: Array<[number, number]> = [
      [0.15 + Math.random() * 0.15, 0.10 + Math.random() * 0.15],
      [0.55 + Math.random() * 0.25, 0.40 + Math.random() * 0.20],
      [0.10 + Math.random() * 0.30, 0.78 + Math.random() * 0.12],
    ];
    return zones.sort(() => Math.random() - 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageFile]);

  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<"blur" | "sticker" | "crop" | null>(null);
  const [cropRect, setCropRect] = useState<BlurRegion | null>(null);
  const [blurRegions, setBlurRegions] = useState<BlurRegion[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [applyWatermark, setApplyWatermark] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTextPanel, setShowTextPanel] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [textSize, setTextSize] = useState(64);
  const [textColor, setTextColor] = useState<string>(TEXT_COLORS[0]);

  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<BlurRegion | null>(null);
  const [draggingSticker, setDraggingSticker] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load image when dialog opens
  useEffect(() => {
    if (!imageFile || !open) {
      setOriginalImage(null);
      return;
    }

    let cancelled = false;
    setImageLoading(true);

    // Tenta primeiro via createObjectURL (rápido). Se falhar (alguns blobs
    // de galeria Android/iOS quebram aqui), faz fallback para FileReader.
    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(imageFile);
    } catch (err) {
      console.warn("[ImageEditor] createObjectURL falhou, indo para FileReader", err);
    }

    const finalize = (img: HTMLImageElement) => {
      if (cancelled) return;
      const MAX = 1920;
      if (img.width > MAX || img.height > MAX) {
        const scale = MAX / Math.max(img.width, img.height);
        const offscreen = document.createElement("canvas");
        offscreen.width = Math.round(img.width * scale);
        offscreen.height = Math.round(img.height * scale);
        const octx = offscreen.getContext("2d");
        if (octx) octx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
        // toBlob é mais seguro que toDataURL em fotos grandes de celular
        offscreen.toBlob(
          (blob) => {
            if (cancelled) return;
            if (!blob) {
              setOriginalImage(img);
              setImageLoading(false);
              setBlurRegions([]);
              setStickers([]);
              setSelectedStickerId(null);
              return;
            }
            const url = URL.createObjectURL(blob);
            const resized = new Image();
            resized.onload = () => {
              if (cancelled) {
                URL.revokeObjectURL(url);
                return;
              }
              setOriginalImage(resized);
              setImageLoading(false);
              setBlurRegions([]);
              setStickers([]);
              setSelectedStickerId(null);
              // url só pode ser revogado depois que setOriginalImage refletir
              setTimeout(() => URL.revokeObjectURL(url), 30_000);
            };
            resized.onerror = () => {
              URL.revokeObjectURL(url);
              if (cancelled) return;
              setOriginalImage(img);
              setImageLoading(false);
            };
            resized.src = url;
          },
          "image/jpeg",
          0.92,
        );
      } else {
        setOriginalImage(img);
        setImageLoading(false);
        setBlurRegions([]);
        setStickers([]);
        setSelectedStickerId(null);
      }
    };

    const tryWithSrc = (src: string, onFail: () => void) => {
      const img = new Image();
      img.onload = () => finalize(img);
      img.onerror = (ev) => {
        console.warn("[ImageEditor] Falha ao carregar imagem", ev);
        onFail();
      };
      img.src = src;
    };

    const fallbackToReader = () => {
      const reader = new FileReader();
      reader.onload = () => {
        if (cancelled) return;
        if (typeof reader.result === "string") {
          tryWithSrc(reader.result, () => {
            if (cancelled) return;
            console.error("[ImageEditor] Não foi possível decodificar a imagem.");
            setImageLoading(false);
            onLoadError?.(
              "Formato não suportado pelo navegador (HEIC, RAW ou arquivo corrompido)."
            );
          });
        } else {
          setImageLoading(false);
          onLoadError?.("Não foi possível ler a imagem.");
        }
      };
      reader.onerror = () => {
        if (cancelled) return;
        console.error("[ImageEditor] FileReader falhou", reader.error);
        setImageLoading(false);
        onLoadError?.("Falha ao ler o arquivo da galeria.");
      };
      try {
        reader.readAsDataURL(imageFile);
      } catch (err) {
        console.error("[ImageEditor] readAsDataURL falhou", err);
        setImageLoading(false);
        onLoadError?.("Não foi possível acessar o arquivo.");
      }
    };


    if (objectUrl) {
      tryWithSrc(objectUrl, fallbackToReader);
    } else {
      fallbackToReader();
    }

    return () => {
      cancelled = true;
      // Adia a revogação para não cortar o carregamento ainda em andamento
      // em devices mobile lentos. Memória é liberada após 30s ou no GC.
      if (objectUrl) {
        const u = objectUrl;
        setTimeout(() => URL.revokeObjectURL(u), 30_000);
      }
    };
  }, [imageFile, open]);


  // Pixelate region (heavy/aggressive censorship)
  const pixelateRegion = (ctx: CanvasRenderingContext2D, region: BlurRegion, canvasW: number, canvasH: number) => {
    const pixelSize = BLUR_PIXEL_SIZE;
    const rx = Math.max(0, Math.round(region.x));
    const ry = Math.max(0, Math.round(region.y));
    const rw = Math.min(Math.round(region.width), canvasW - rx);
    const rh = Math.min(Math.round(region.height), canvasH - ry);
    if (rw <= 0 || rh <= 0) return;

    try {
      const imageData = ctx.getImageData(rx, ry, rw, rh);
      for (let y = 0; y < rh; y += pixelSize) {
        for (let x = 0; x < rw; x += pixelSize) {
          const i = (y * rw + x) * 4;
          const r = imageData.data[i], g = imageData.data[i + 1], b = imageData.data[i + 2];
          for (let py = 0; py < pixelSize && y + py < rh; py++) {
            for (let px = 0; px < pixelSize && x + px < rw; px++) {
              const pi = ((y + py) * rw + (x + px)) * 4;
              imageData.data[pi] = r;
              imageData.data[pi + 1] = g;
              imageData.data[pi + 2] = b;
            }
          }
        }
      }
      ctx.putImageData(imageData, rx, ry);

      // Camada escura semi-transparente para reforçar censura
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(rx, ry, rw, rh);
    } catch (e) {
      console.warn("Blur region error:", e);
    }
  };

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (canvas.width !== originalImage.width || canvas.height !== originalImage.height) {
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);

    blurRegions.forEach((region) => pixelateRegion(ctx, region, canvas.width, canvas.height));

    if (currentRect && activeTool === "blur") {
      ctx.strokeStyle = "rgba(255, 0, 127, 0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.width, currentRect.height);
      ctx.setLineDash([]);
    }

    // Overlay do corte: escurece área externa + retângulo claro
    if (activeTool === "crop" && cropRect && cropRect.width > 4 && cropRect.height > 4) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, canvas.height);
      ctx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      ctx.closePath();
      // @ts-ignore - evenodd para "furar" o retângulo de corte
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
      ctx.setLineDash([]);
      // Grid de regra dos terços
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const gx = cropRect.x + (cropRect.width * i) / 3;
        const gy = cropRect.y + (cropRect.height * i) / 3;
        ctx.beginPath(); ctx.moveTo(gx, cropRect.y); ctx.lineTo(gx, cropRect.y + cropRect.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cropRect.x, gy); ctx.lineTo(cropRect.x + cropRect.width, gy); ctx.stroke();
      }
      ctx.restore();
    }

    // Stickers (emoji, texto ou imagem) — centralizados em x,y, sempre 100% opacos
    ctx.globalAlpha = 1;
    stickers.forEach((sticker) => {
      ctx.globalAlpha = 1;
      if (sticker.kind === "emoji" && sticker.emoji) {
        // Fonte com fallback para emoji colorido em todas as plataformas
        ctx.font = `${sticker.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000";
        ctx.fillText(sticker.emoji, sticker.x, sticker.y);
      } else if (sticker.kind === "text" && sticker.text) {
        ctx.font = `bold ${sticker.size}px Inter, system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Contorno escuro para legibilidade sobre qualquer fundo
        ctx.lineWidth = Math.max(2, Math.round(sticker.size * 0.08));
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(sticker.text, sticker.x, sticker.y);
        ctx.fillStyle = sticker.color || "#ffffff";
        ctx.fillText(sticker.text, sticker.x, sticker.y);
      } else if (sticker.kind === "image" && sticker.image) {
        const aspect = sticker.image.width / sticker.image.height;
        const w = sticker.size;
        const h = sticker.size / aspect;
        ctx.drawImage(sticker.image, sticker.x - w / 2, sticker.y - h / 2, w, h);
      }

      // Borda de seleção
      if (sticker.id === selectedStickerId) {
        let w = sticker.size;
        let h = sticker.size;
        if (sticker.kind === "image" && sticker.image) {
          h = sticker.size / (sticker.image.width / sticker.image.height);
        } else if (sticker.kind === "text" && sticker.text) {
          ctx.font = `bold ${sticker.size}px Inter, system-ui, -apple-system, sans-serif`;
          w = ctx.measureText(sticker.text).width + sticker.size * 0.4;
          h = sticker.size * 1.2;
        }
        ctx.strokeStyle = "rgba(255, 0, 127, 0.9)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.strokeRect(sticker.x - w / 2, sticker.y - h / 2, w, h);
        ctx.setLineDash([]);
      }
    });

    // Watermark
    if (applyWatermark) {
      const rawUsername =
        (profile as any)?.username ||
        (user as any)?.username ||
        ((profile?.name || user?.name || "oculto") as string)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_]/g, "");
      const watermarkText = `OCULTO @${rawUsername}`;
      const fontSize = Math.max(14, Math.round(canvas.width * 0.022));
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      watermarkAnchors.forEach(([rx, ry]) => {
        const x = canvas.width * rx;
        const y = canvas.height * ry;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-Math.PI / 12);
        ctx.fillText(watermarkText, 0, 0);
        ctx.restore();
      });

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }
  }, [originalImage, blurRegions, stickers, applyWatermark, currentRect, activeTool, cropRect, user, profile, watermarkAnchors, selectedStickerId]);

  useEffect(() => {
    if (originalImage) requestAnimationFrame(drawCanvas);
  }, [drawCanvas, originalImage]);

  const getCanvasCoords = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  /** Encontra sticker no ponto (procura do topo para baixo da pilha). */
  const hitTestSticker = (cx: number, cy: number): Sticker | null => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i];
      let w = s.size;
      let h = s.size;
      if (s.kind === "image" && s.image) {
        h = s.size / (s.image.width / s.image.height);
      } else if (s.kind === "text" && s.text && ctx) {
        ctx.font = `bold ${s.size}px Inter, system-ui, -apple-system, sans-serif`;
        w = ctx.measureText(s.text).width + s.size * 0.4;
        h = s.size * 1.2;
      }
      const left = s.x - w / 2;
      const right = s.x + w / 2;
      const top = s.y - h / 2;
      const bottom = s.y + h / 2;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) return s;
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const coords = getCanvasCoords(e.clientX, e.clientY);

    // Sempre permite selecionar/mover sticker existente (independente da tool ativa)
    const hit = hitTestSticker(coords.x, coords.y);
    if (hit) {
      setSelectedStickerId(hit.id);
      setDraggingSticker(hit.id);
      setDragOffset({ x: coords.x - hit.x, y: coords.y - hit.y });
      return;
    }

    // Clicou fora de qualquer sticker — desseleciona
    if (selectedStickerId) setSelectedStickerId(null);

    if (activeTool === "blur" || activeTool === "crop") {
      setIsDrawing(true);
      setDrawStart(coords);
      const rect = { x: coords.x, y: coords.y, width: 0, height: 0 };
      if (activeTool === "blur") setCurrentRect(rect);
      else setCropRect(rect);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (draggingSticker) {
      setStickers((prev) =>
        prev.map((s) =>
          s.id === draggingSticker
            ? { ...s, x: coords.x - dragOffset.x, y: coords.y - dragOffset.y }
            : s
        )
      );
      return;
    }
    if (isDrawing && drawStart && (activeTool === "blur" || activeTool === "crop")) {
      const r = {
        x: Math.min(drawStart.x, coords.x),
        y: Math.min(drawStart.y, coords.y),
        width: Math.abs(coords.x - drawStart.x),
        height: Math.abs(coords.y - drawStart.y),
      };
      if (activeTool === "blur") setCurrentRect(r);
      else setCropRect(r);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (activeTool === "blur" && currentRect && currentRect.width > 10 && currentRect.height > 10) {
      setBlurRegions((prev) => [...prev, currentRect]);
    }
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentRect(null);
    setDraggingSticker(null);
  };

  const addEmojiSticker = (emoji: string) => {
    if (!originalImage) return;
    const id = `sticker-${Date.now()}`;
    // Default 64px (pode ser aumentado depois com +/-)
    setStickers((prev) => [...prev, {
      id, kind: "emoji", emoji,
      x: originalImage.width / 2,
      y: originalImage.height / 2,
      size: 64,
    }]);
    setSelectedStickerId(id);
    setShowEmojiPicker(false);
    setActiveTool(null);
  };

  const addTextSticker = () => {
    if (!originalImage || !textDraft.trim()) return;
    const id = `sticker-${Date.now()}`;
    setStickers((prev) => [...prev, {
      id, kind: "text", text: textDraft.trim(), color: textColor,
      x: originalImage.width / 2,
      y: originalImage.height / 2,
      size: textSize,
    }]);
    setSelectedStickerId(id);
    setTextDraft("");
    setShowTextPanel(false);
    setActiveTool(null);
  };

  const handleOverlayImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !originalImage) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const id = `sticker-${Date.now()}`;
      // 35% da largura da imagem base
      const size = Math.round(originalImage.width * 0.35);
      setStickers((prev) => [...prev, {
        id, kind: "image", image: img,
        x: originalImage.width / 2,
        y: originalImage.height / 2,
        size,
      }]);
      setSelectedStickerId(id);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  const adjustSelectedSize = (delta: number) => {
    if (!selectedStickerId || !originalImage) return;
    setStickers((prev) => prev.map((s) => {
      if (s.id !== selectedStickerId) return s;
      const minSize = 30;
      const maxSize = originalImage.width * 1.2;
      const next = Math.max(minSize, Math.min(maxSize, s.size + delta));
      return { ...s, size: next };
    }));
  };

  const deleteSelectedSticker = () => {
    if (!selectedStickerId) return;
    setStickers((prev) => prev.filter((s) => s.id !== selectedStickerId));
    setSelectedStickerId(null);
  };

  /** Traz o sticker selecionado para frente (topo da pilha = renderizado por último = visível por cima). */
  const bringSelectedToFront = () => {
    if (!selectedStickerId) return;
    setStickers((prev) => {
      const idx = prev.findIndex((s) => s.id === selectedStickerId);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      copy.push(item);
      return copy;
    });
  };

  /** Envia o sticker selecionado para trás (base da pilha = renderizado primeiro = atrás dos outros). */
  const sendSelectedToBack = () => {
    if (!selectedStickerId) return;
    setStickers((prev) => {
      const idx = prev.findIndex((s) => s.id === selectedStickerId);
      if (idx <= 0) return prev;
      const copy = prev.slice();
      const [item] = copy.splice(idx, 1);
      copy.unshift(item);
      return copy;
    });
  };

  /** Atualiza propriedades editáveis do sticker de texto selecionado (conteúdo, cor, tamanho). */
  const updateSelectedText = (patch: Partial<Pick<Sticker, "text" | "color" | "size">>) => {
    if (!selectedStickerId) return;
    setStickers((prev) =>
      prev.map((s) => (s.id === selectedStickerId && s.kind === "text" ? { ...s, ...patch } : s))
    );
  };

  const selectedSticker = stickers.find((s) => s.id === selectedStickerId) || null;

  const resetEdits = () => {
    setBlurRegions([]);
    setStickers([]);
    setSelectedStickerId(null);
    setCropRect(null);
  };

  /** Converte um <canvas> em HTMLImageElement (assíncrono). */
  const canvasToImage = (cnv: HTMLCanvasElement): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      cnv.toBlob((blob) => {
        if (!blob) return reject(new Error("toBlob falhou"));
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 30_000); };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      }, "image/jpeg", 0.95);
    });

  /** Aplica o corte definido por cropRect: gera nova imagem e remapeia stickers/blurs. */
  const applyCrop = async () => {
    if (!originalImage || !cropRect) return;
    const cx = Math.max(0, Math.round(cropRect.x));
    const cy = Math.max(0, Math.round(cropRect.y));
    const cw = Math.min(Math.round(cropRect.width), originalImage.width - cx);
    const ch = Math.min(Math.round(cropRect.height), originalImage.height - cy);
    if (cw < 20 || ch < 20) return;

    const off = document.createElement("canvas");
    off.width = cw;
    off.height = ch;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.drawImage(originalImage, cx, cy, cw, ch, 0, 0, cw, ch);

    try {
      const newImg = await canvasToImage(off);
      // Remapeia stickers (mantém os que ficam dentro do recorte)
      setStickers((prev) =>
        prev
          .map((s) => ({ ...s, x: s.x - cx, y: s.y - cy }))
          .filter((s) => s.x >= 0 && s.y >= 0 && s.x <= cw && s.y <= ch)
      );
      // Remapeia blurs (clamp dentro do novo canvas)
      setBlurRegions((prev) =>
        prev
          .map((b) => {
            const nx = Math.max(0, b.x - cx);
            const ny = Math.max(0, b.y - cy);
            const nw = Math.min(b.width, cw - nx);
            const nh = Math.min(b.height, ch - ny);
            return { x: nx, y: ny, width: nw, height: nh };
          })
          .filter((b) => b.width > 4 && b.height > 4)
      );
      setOriginalImage(newImg);
      setCropRect(null);
      setActiveTool(null);
    } catch (e) {
      console.error("[ImageEditor] applyCrop falhou", e);
    }
  };

  const cancelCrop = () => {
    setCropRect(null);
    setActiveTool(null);
  };

  /** Rotaciona 90° no sentido horário, remapeando stickers e blurs. */
  const rotate90 = async () => {
    if (!originalImage) return;
    const w = originalImage.width;
    const h = originalImage.height;
    const off = document.createElement("canvas");
    off.width = h;
    off.height = w;
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.translate(h, 0);
    octx.rotate(Math.PI / 2);
    octx.drawImage(originalImage, 0, 0, w, h);

    try {
      const newImg = await canvasToImage(off);
      // (x,y) → (h - y, x) para rotação 90° CW
      setStickers((prev) => prev.map((s) => ({ ...s, x: h - s.y, y: s.x })));
      setBlurRegions((prev) =>
        prev.map((b) => ({
          x: h - (b.y + b.height),
          y: b.x,
          width: b.height,
          height: b.width,
        }))
      );
      setCropRect(null);
      setOriginalImage(newImg);
    } catch (e) {
      console.error("[ImageEditor] rotate90 falhou", e);
    }
  };


  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Desseleciona antes de exportar pra não pintar a borda no JPG
    setSelectedStickerId(null);
    requestAnimationFrame(() => {
      drawCanvas();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      onSave(dataUrl);
      onOpenChange(false);
    });
  };

  const hasSelection = !!selectedStickerId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-screen h-[100dvh] max-w-none max-h-none m-0 p-0 rounded-none border-none bg-[hsl(0,0%,4%)] flex flex-col overflow-hidden [&>button]:hidden z-[200] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <VisuallyHidden.Root><DialogTitle>Editor de Imagem</DialogTitle><DialogDescription>Editar imagem</DialogDescription></VisuallyHidden.Root>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-background/80 backdrop-blur-sm border-b border-border/20 shrink-0 z-10">
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold text-foreground">Editor de Imagem</h2>
          <Button
            onClick={handleSave}
            size="sm"
            disabled={!originalImage}
            className="bg-primary hover:bg-primary/90 h-8 px-3 text-xs touch-manipulation"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Aplicar
          </Button>
        </div>

        {/* Canvas Area */}
        <div
          ref={containerRef}
          className="flex-1 flex items-center justify-center overflow-hidden px-2 py-2 min-h-0"
        >
          {imageLoading || !originalImage ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm">Carregando imagem...</span>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full object-contain rounded-lg touch-none"
              style={{ cursor: activeTool === "blur" || activeTool === "crop" ? "crosshair" : "default" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          )}
        </div>

        {/* Toolbar de seleção do sticker (aparece acima da toolbar principal) */}
        {hasSelection && selectedSticker && (
          <div className="shrink-0 bg-card/95 backdrop-blur-sm border-t border-border/30 px-3 py-2 space-y-2">
            {/* Linha 1 — ações universais (tamanho, camadas, excluir) */}
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground mr-1">Selecionado:</span>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => adjustSelectedSize(-20)} title="Diminuir">
                <Minus className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={() => adjustSelectedSize(20)} title="Aumentar">
                <Plus className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={bringSelectedToFront} title="Trazer para frente">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0" onClick={sendSelectedToBack} title="Enviar para trás">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" className="h-9 w-9 p-0 text-destructive hover:text-destructive" onClick={deleteSelectedSticker} title="Excluir">
                <Trash2 className="h-4 w-4" />
              </Button>
              <span className="text-[10px] text-muted-foreground ml-1 hidden sm:inline">Arraste para mover</span>
            </div>

            {/* Linha 2 — edição inline do sticker de TEXTO selecionado */}
            {selectedSticker.kind === "text" && (
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <input
                  type="text"
                  value={selectedSticker.text || ""}
                  onChange={(e) => updateSelectedText({ text: e.target.value })}
                  placeholder="Editar texto..."
                  maxLength={80}
                  className="w-full h-9 px-3 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
                  <span className="text-[10px] text-muted-foreground shrink-0">Tamanho:</span>
                  {TEXT_SIZE_OPTIONS.map((sz) => (
                    <button
                      key={sz}
                      onClick={() => updateSelectedText({ size: sz })}
                      className={cn(
                        "shrink-0 h-7 px-2 rounded-md border text-[11px] font-medium touch-manipulation",
                        selectedSticker.size === sz
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/60 text-foreground border-border"
                      )}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
                  <span className="text-[10px] text-muted-foreground shrink-0">Cor:</span>
                  {TEXT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => updateSelectedText({ color: c })}
                      aria-label={`Cor ${c}`}
                      className={cn(
                        "shrink-0 h-6 w-6 rounded-full border-2 touch-manipulation",
                        (selectedSticker.color || "#ffffff") === c
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}


        {/* Bottom Toolbar — padding extra garantindo que botões nunca sejam cortados */}
        <div className="shrink-0 bg-background/95 backdrop-blur-sm border-t border-border/20 px-3 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] max-h-[55dvh] overflow-y-auto overscroll-contain">
          {showEmojiPicker && (
            <div className="flex justify-center gap-1.5 mb-3 p-2 bg-card rounded-lg border border-border/50 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addEmojiSticker(emoji)}
                  className="text-2xl hover:scale-110 active:scale-95 transition-transform touch-manipulation shrink-0 w-10 h-10 flex items-center justify-center"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {showTextPanel && (
            <div className="mb-3 p-3 bg-card rounded-lg border border-border/50 space-y-2">
              <input
                type="text"
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                placeholder="Digite seu texto..."
                maxLength={80}
                className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
                <span className="text-[10px] text-muted-foreground shrink-0">Tamanho:</span>
                {TEXT_SIZE_OPTIONS.map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setTextSize(sz)}
                    className={cn(
                      "shrink-0 h-8 px-2 rounded-md border text-[11px] font-medium touch-manipulation",
                      textSize === sz ? "bg-primary text-primary-foreground border-primary" : "bg-muted/60 text-foreground border-border"
                    )}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
                <span className="text-[10px] text-muted-foreground shrink-0">Cor:</span>
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setTextColor(c)}
                    aria-label={`Cor ${c}`}
                    className={cn(
                      "shrink-0 h-7 w-7 rounded-full border-2 touch-manipulation",
                      textColor === c ? "border-primary ring-2 ring-primary/40" : "border-border"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                onClick={addTextSticker}
                disabled={!textDraft.trim()}
                className="w-full h-9 bg-primary hover:bg-primary/90"
              >
                Adicionar texto
              </Button>
            </div>
          )}

          {activeTool === "crop" && (
            <div className="flex items-center justify-center gap-2 mb-3 p-2 bg-card rounded-lg border border-border/50">
              <span className="text-[11px] text-muted-foreground">
                {cropRect && cropRect.width > 10 ? "Arraste para ajustar, depois aplique." : "Arraste sobre a imagem para definir a área de corte."}
              </span>
              <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={cancelCrop}>
                Cancelar
              </Button>
              <Button size="sm" className="h-8 px-3 text-xs bg-primary hover:bg-primary/90" onClick={applyCrop} disabled={!cropRect || cropRect.width < 20 || cropRect.height < 20}>
                <Check className="h-3.5 w-3.5 mr-1" /> Aplicar corte
              </Button>
            </div>
          )}

          <div className="flex items-center justify-around gap-2 mb-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => { setActiveTool(activeTool === "crop" ? null : "crop"); setShowEmojiPicker(false); setShowTextPanel(false); setSelectedStickerId(null); setCropRect(null); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-all touch-manipulation min-w-[58px] shrink-0",
                activeTool === "crop" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
              )}
            >
              <CropIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium">Cortar</span>
            </button>

            <button
              onClick={rotate90}
              className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-muted/60 text-foreground hover:bg-muted transition-all touch-manipulation min-w-[58px] shrink-0"
            >
              <RotateCw className="h-5 w-5" />
              <span className="text-[10px] font-medium">Girar 90°</span>
            </button>

            <button
              onClick={() => { setActiveTool(activeTool === "blur" ? null : "blur"); setShowEmojiPicker(false); setShowTextPanel(false); setSelectedStickerId(null); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-all touch-manipulation min-w-[58px] shrink-0",
                activeTool === "blur" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
              )}
            >
              <Grid3X3 className="h-5 w-5" />
              <span className="text-[10px] font-medium">Pixelizar</span>
            </button>

            <button
              onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowTextPanel(false); setActiveTool(null); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-all touch-manipulation min-w-[58px] shrink-0",
                showEmojiPicker ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
              )}
            >
              <Smile className="h-5 w-5" />
              <span className="text-[10px] font-medium">Emojis</span>
            </button>

            <button
              onClick={() => { setShowTextPanel(!showTextPanel); setShowEmojiPicker(false); setActiveTool(null); }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg transition-all touch-manipulation min-w-[58px] shrink-0",
                showTextPanel ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground hover:bg-muted"
              )}
            >
              <Type className="h-5 w-5" />
              <span className="text-[10px] font-medium">Texto</span>
            </button>

            <button
              onClick={() => overlayInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-muted/60 text-foreground hover:bg-muted transition-all touch-manipulation min-w-[58px] shrink-0"
            >
              <ImageIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium">Sobrepor</span>
            </button>

            <button
              onClick={resetEdits}
              className="flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg bg-muted/60 text-foreground hover:bg-muted transition-all touch-manipulation min-w-[58px] shrink-0"
            >
              <RotateCcw className="h-5 w-5" />
              <span className="text-[10px] font-medium">Resetar</span>
            </button>
          </div>


          <input
            ref={overlayInputRef}
            type="file"
            accept="image/*"
            onChange={handleOverlayImagePick}
            className="hidden"
          />

          <div className="flex items-center justify-center gap-2 pt-1">
            <Switch
              id="watermark"
              checked={applyWatermark}
              onCheckedChange={setApplyWatermark}
              className="scale-90"
            />
            <Label htmlFor="watermark" className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Marca D'água
            </Label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
