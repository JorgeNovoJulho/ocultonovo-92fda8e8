import { useEffect, useMemo, useRef, useState, useCallback, PointerEvent as RPointerEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RotateCw, RotateCcw, ZoomIn, ZoomOut, Type, Smile, Crop, Trash2,
  Check, X, Palette, Move,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================
   Editor de mídia para FOTO DO PERFIL (1:1) e BANNER (3:1)
   - Recorte: imagem se ajusta dentro de uma "stage" com aspect fixo
   - Reposicionar: arraste com pointer
   - Zoom: slider/+/-
   - Rotacionar: 90°↶, 90°↷ + slider livre (-180..180)
   - Emojis (stickers): tamanho editável + drag + delete
   - Texto: fonte, tamanho, cor, posição (drag), delete
   - Salvar: renderiza a stage em um canvas no tamanho final
   ============================================================ */

interface Sticker {
  id: string;
  emoji: string;
  x: number; // em coords de stage
  y: number;
  size: number;
  rotation: number;
}

interface TextEl {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontFamily: string;
  rotation: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  file: File | null;
  aspectRatio: number;      // 1 para avatar, 3 para banner
  outputWidth: number;      // px — largura final da exportação
  title?: string;
  onSave: (blob: Blob) => void | Promise<void>;
}

const EMOJIS = ["😀","😍","🔥","💋","❤️","👀","💦","🍑","🍆","💯","✨","🌟","💖","😈","🥵","💪","🎉","👑","🌈","🦋"];
const COLORS = ["#ffffff","#000000","#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];
const FONTS = [
  { label: "Sans", value: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "ui-monospace, Menlo, monospace" },
  { label: "Cursive", value: "'Brush Script MT', cursive" },
  { label: "Impact", value: "Impact, 'Arial Black', sans-serif" },
];

const STAGE_MAX_W = 560; // largura visual máx. da stage em telas grandes
const STAGE_MAX_H = 460;

export function ProfileMediaEditorModal({
  open, onOpenChange, file, aspectRatio, outputWidth, title, onSave,
}: Props) {
  /* ---------------- Imagem base ---------------- */
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!file || !open) return;
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => {
      console.error('[ProfileMediaEditor] image load failed');
      setImg(null);
      onOpenChange(false);
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, open, onOpenChange]);


  /* ---------------- Transformações da imagem ---------------- */
  const [scale, setScale] = useState(1);       // 1 = "fit" (cobre stage)
  const [rotation, setRotation] = useState(0); // graus
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // em coords de stage

  // Stickers e textos (coords em stage)
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [texts, setTexts] = useState<TextEl[]>([]);
  const [selected, setSelected] = useState<{ type: "sticker" | "text"; id: string } | null>(null);

  // Inputs de texto
  const [newText, setNewText] = useState("");
  const [fontFamily, setFontFamily] = useState(FONTS[0].value);
  const [fontSize, setFontSize] = useState(36);
  const [color, setColor] = useState("#ffffff");

  /* ---------------- Tamanho da stage (responsivo) ---------------- */
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const [stageArea, setStageArea] = useState({ w: STAGE_MAX_W, h: STAGE_MAX_H });
  useEffect(() => {
    if (!open) return;
    const el = stageWrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const pad = 16;
      const w = Math.max(160, r.width - pad);
      const h = Math.max(160, r.height - pad);
      setStageArea({ w, h });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [open]);

  const stage = useMemo(() => {
    let w = stageArea.w;
    let h = w / aspectRatio;
    if (h > stageArea.h) { h = stageArea.h; w = h * aspectRatio; }
    return { w: Math.max(80, Math.round(w)), h: Math.max(80, Math.round(h)) };
  }, [aspectRatio, stageArea.w, stageArea.h]);

  // Reset quando troca de arquivo
  useEffect(() => {
    if (!open) return;
    setScale(1); setRotation(0); setOffset({ x: 0, y: 0 });
    setStickers([]); setTexts([]); setSelected(null);
  }, [file, open]);

  /* ---------------- Cálculo do "fit" base da imagem ----------------
     Queremos que a imagem (em scale=1, rotation=0) preencha a stage
     (cover). Calculamos o tamanho base. */
  const baseImg = useMemo(() => {
    if (!img) return { w: 0, h: 0 };
    const ir = img.width / img.height;
    const sr = stage.w / stage.h;
    // cover: se imagem mais larga que stage, altura = stage.h
    if (ir > sr) {
      const h = stage.h;
      const w = h * ir;
      return { w, h };
    }
    const w = stage.w;
    const h = w / ir;
    return { w, h };
  }, [img, stage.w, stage.h]);

  /* ---------------- Drag da imagem ---------------- */
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ kind: "image" | "sticker" | "text"; id?: string; sx: number; sy: number; ox: number; oy: number } | null>(null);

  const stageCoords = (e: RPointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onImgPointerDown = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = stageCoords(e);
    dragRef.current = { kind: "image", sx: p.x, sy: p.y, ox: offset.x, oy: offset.y };
    setSelected(null);
  };
  const onStickerPointerDown = (e: RPointerEvent, s: Sticker) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = stageCoords(e);
    dragRef.current = { kind: "sticker", id: s.id, sx: p.x, sy: p.y, ox: s.x, oy: s.y };
    setSelected({ type: "sticker", id: s.id });
  };
  const onTextPointerDown = (e: RPointerEvent, t: TextEl) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = stageCoords(e);
    dragRef.current = { kind: "text", id: t.id, sx: p.x, sy: p.y, ox: t.x, oy: t.y };
    setSelected({ type: "text", id: t.id });
  };

  const onPointerMove = (e: RPointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const p = stageCoords(e);
    const dx = p.x - d.sx, dy = p.y - d.sy;
    if (d.kind === "image") setOffset({ x: d.ox + dx, y: d.oy + dy });
    else if (d.kind === "sticker") setStickers(arr => arr.map(s => s.id === d.id ? { ...s, x: d.ox + dx, y: d.oy + dy } : s));
    else if (d.kind === "text") setTexts(arr => arr.map(t => t.id === d.id ? { ...t, x: d.ox + dx, y: d.oy + dy } : t));
  };
  const onPointerUp = () => { dragRef.current = null; };

  /* ---------------- Helpers ---------------- */
  const addSticker = (emoji: string) => {
    const s: Sticker = { id: crypto.randomUUID(), emoji, x: stage.w / 2, y: stage.h / 2, size: Math.round(stage.h * 0.18), rotation: 0 };
    setStickers(a => [...a, s]); setSelected({ type: "sticker", id: s.id });
  };
  const addText = () => {
    if (!newText.trim()) return;
    const t: TextEl = { id: crypto.randomUUID(), text: newText.trim(), x: stage.w / 2, y: stage.h / 2, color, fontSize, fontFamily, rotation: 0 };
    setTexts(a => [...a, t]); setSelected({ type: "text", id: t.id }); setNewText("");
  };
  const removeSelected = () => {
    if (!selected) return;
    if (selected.type === "sticker") setStickers(a => a.filter(s => s.id !== selected.id));
    else setTexts(a => a.filter(t => t.id !== selected.id));
    setSelected(null);
  };
  const selStick = selected?.type === "sticker" ? stickers.find(s => s.id === selected.id) ?? null : null;
  const selText = selected?.type === "text" ? texts.find(t => t.id === selected.id) ?? null : null;

  const updateSelStickerSize = (v: number) => selStick && setStickers(a => a.map(s => s.id === selStick.id ? { ...s, size: v } : s));
  const updateSelStickerRot = (v: number) => selStick && setStickers(a => a.map(s => s.id === selStick.id ? { ...s, rotation: v } : s));
  const updateSelTextSize = (v: number) => selText && setTexts(a => a.map(t => t.id === selText.id ? { ...t, fontSize: v } : t));
  const updateSelTextRot = (v: number) => selText && setTexts(a => a.map(t => t.id === selText.id ? { ...t, rotation: v } : t));
  const updateSelTextColor = (c: string) => selText && setTexts(a => a.map(t => t.id === selText.id ? { ...t, color: c } : t));
  const updateSelTextFont = (f: string) => selText && setTexts(a => a.map(t => t.id === selText.id ? { ...t, fontFamily: f } : t));
  const updateSelTextValue = (txt: string) => selText && setTexts(a => a.map(t => t.id === selText.id ? { ...t, text: txt } : t));

  /* ---------------- Salvar ---------------- */
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const outW = outputWidth;
      const outH = Math.round(outW / aspectRatio);
      const canvas = document.createElement("canvas");
      canvas.width = outW; canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      // Fundo preto evita transparência caso a imagem não cubra todo o frame
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, outW, outH);

      // Razão de escala stage→output
      const k = outW / stage.w;

      // Desenha imagem com rotação + escala + offset
      const cx = (stage.w / 2 + offset.x) * k;
      const cy = (stage.h / 2 + offset.y) * k;
      const drawW = baseImg.w * scale * k;
      const drawH = baseImg.h * scale * k;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      // Stickers
      stickers.forEach(s => {
        ctx.save();
        ctx.translate(s.x * k, s.y * k);
        ctx.rotate((s.rotation * Math.PI) / 180);
        ctx.font = `${s.size * k}px ${FONTS[0].value}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(s.emoji, 0, 0);
        ctx.restore();
      });

      // Textos
      texts.forEach(t => {
        ctx.save();
        ctx.translate(t.x * k, t.y * k);
        ctx.rotate((t.rotation * Math.PI) / 180);
        ctx.font = `bold ${t.fontSize * k}px ${t.fontFamily}`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(1, 2 * k);
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(t.text, 0, 0);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
      });

      const blob: Blob | null = await new Promise((r) =>
        canvas.toBlob((b) => r(b), 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Falha ao gerar imagem');
      await onSave(blob);
      onOpenChange(false);
    } catch (err) {
      console.error('[ProfileMediaEditor] save failed', err);
    } finally { setSaving(false); }
  };


  /* ---------------- UI ---------------- */
  // posicao da imagem CSS
  const imgStyle = useMemo(() => {
    if (!img) return {};
    const left = stage.w / 2 + offset.x;
    const top = stage.h / 2 + offset.y;
    return {
      position: "absolute" as const,
      left, top,
      width: baseImg.w, height: baseImg.h,
      transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`,
      transformOrigin: "center center",
      userSelect: "none" as const,
      pointerEvents: "auto" as const,
      touchAction: "none" as const,
    };
  }, [img, baseImg.w, baseImg.h, offset.x, offset.y, rotation, scale, stage.w, stage.h]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="p-0 gap-0 w-screen h-[100dvh] max-w-[100vw] sm:w-[95vw] sm:h-auto sm:max-w-5xl sm:max-h-[95vh] sm:rounded-lg rounded-none overflow-hidden flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Crop className="h-4 w-4" /> {title || "Editar imagem"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 pt-3 flex flex-col md:flex-row gap-3 md:gap-4">
          {/* Stage */}
          <div
            ref={stageWrapRef}
            className="w-full md:flex-1 flex items-center justify-center bg-black/60 rounded-lg p-2 sm:p-3"
            style={{ minHeight: 'min(55vh, 420px)' }}
          >
            <div
              ref={stageRef}
              className="relative overflow-hidden bg-neutral-900 ring-2 ring-primary/30"
              style={{
                width: stage.w, height: stage.h,
                borderRadius: aspectRatio === 1 ? "9999px" : 16,
                touchAction: "none",
              }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {img && (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  onPointerDown={onImgPointerDown}
                  style={imgStyle}
                />
              )}

              {/* Stickers */}
              {stickers.map(s => (
                <div
                  key={s.id}
                  onPointerDown={(e) => onStickerPointerDown(e, s)}
                  className={cn(
                    "absolute select-none cursor-move",
                    selected?.type === "sticker" && selected.id === s.id && "outline outline-2 outline-primary outline-offset-2 rounded"
                  )}
                  style={{
                    left: s.x, top: s.y,
                    transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                    fontSize: s.size, lineHeight: 1, touchAction: "none",
                  }}
                >{s.emoji}</div>
              ))}

              {/* Texts */}
              {texts.map(t => (
                <div
                  key={t.id}
                  onPointerDown={(e) => onTextPointerDown(e, t)}
                  className={cn(
                    "absolute select-none cursor-move whitespace-pre",
                    selected?.type === "text" && selected.id === t.id && "outline outline-2 outline-primary outline-offset-2 rounded"
                  )}
                  style={{
                    left: t.x, top: t.y,
                    transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
                    color: t.color,
                    fontSize: t.fontSize,
                    fontFamily: t.fontFamily,
                    fontWeight: 700,
                    textShadow: "0 2px 4px rgba(0,0,0,.7), 0 0 2px rgba(0,0,0,.9)",
                    touchAction: "none",
                  }}
                >{t.text}</div>
              ))}
            </div>
          </div>

          {/* Painel de ferramentas */}
          <div className="w-full md:w-72 shrink-0 pb-3">
            <Tabs defaultValue="image" className="w-full">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="image"><Move className="h-4 w-4 mr-1" />Imagem</TabsTrigger>
                <TabsTrigger value="text"><Type className="h-4 w-4 mr-1" />Texto</TabsTrigger>
                <TabsTrigger value="emoji"><Smile className="h-4 w-4 mr-1" />Emoji</TabsTrigger>
              </TabsList>

              {/* IMAGEM */}
              <TabsContent value="image" className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label className="text-xs">Zoom: {Math.round(scale * 100)}%</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.max(0.3, +(s - 0.1).toFixed(2)))}><ZoomOut className="h-4 w-4" /></Button>
                    <Slider value={[scale * 100]} onValueChange={([v]) => setScale(v / 100)} min={30} max={400} step={5} className="flex-1" />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setScale(s => Math.min(4, +(s + 0.1).toFixed(2)))}><ZoomIn className="h-4 w-4" /></Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Rotação: {rotation}°</Label>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setRotation(r => ((r - 90) + 360) % 360 - (r - 90 >= 0 ? 0 : 0))}><RotateCcw className="h-4 w-4" /></Button>
                    <Slider value={[rotation]} onValueChange={([v]) => setRotation(v)} min={-180} max={180} step={1} className="flex-1" />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setRotation(r => ((r + 90) % 360))}><RotateCw className="h-4 w-4" /></Button>
                  </div>
                </div>

                <Button variant="outline" size="sm" className="w-full" onClick={() => { setScale(1); setRotation(0); setOffset({ x: 0, y: 0 }); }}>
                  Resetar enquadramento
                </Button>

                <p className="text-[11px] text-muted-foreground">
                  Arraste a imagem para reposicionar dentro do recorte ({aspectRatio === 1 ? "círculo" : `${aspectRatio}:1`}).
                </p>
              </TabsContent>

              {/* TEXTO */}
              <TabsContent value="text" className="space-y-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Texto</Label>
                  <Input value={newText} onChange={e => setNewText(e.target.value)} placeholder="Digite e adicione…" onKeyDown={e => e.key === "Enter" && addText()} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Fonte</Label>
                    <select className="w-full h-9 rounded-md bg-background border border-input text-sm px-2" value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                      {FONTS.map(f => <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tamanho: {fontSize}</Label>
                    <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={12} max={120} step={2} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Palette className="h-3 w-3" />Cor</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setColor(c)}
                        className={cn("w-6 h-6 rounded-full border-2", color === c ? "border-primary" : "border-transparent")}
                        style={{ backgroundColor: c }} />
                    ))}
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-6 w-8 cursor-pointer rounded" />
                  </div>
                </div>
                <Button onClick={addText} disabled={!newText.trim()} className="w-full" size="sm">
                  <Type className="h-4 w-4 mr-1" /> Adicionar texto
                </Button>

                {selText && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <Label className="text-xs">Editar texto selecionado</Label>
                    <Input value={selText.text} onChange={e => updateSelTextValue(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px]">Tamanho: {selText.fontSize}</Label>
                        <Slider value={[selText.fontSize]} onValueChange={([v]) => updateSelTextSize(v)} min={12} max={160} step={2} />
                      </div>
                      <div>
                        <Label className="text-[10px]">Rotação: {selText.rotation}°</Label>
                        <Slider value={[selText.rotation]} onValueChange={([v]) => updateSelTextRot(v)} min={-180} max={180} step={1} />
                      </div>
                    </div>
                    <select className="w-full h-8 rounded-md bg-background border border-input text-xs px-2" value={selText.fontFamily} onChange={e => updateSelTextFont(e.target.value)}>
                      {FONTS.map(f => <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-1.5">
                      {COLORS.map(c => (
                        <button key={c} type="button" onClick={() => updateSelTextColor(c)}
                          className={cn("w-5 h-5 rounded-full border-2", selText.color === c ? "border-primary" : "border-transparent")}
                          style={{ backgroundColor: c }} />
                      ))}
                      <input type="color" value={selText.color} onChange={e => updateSelTextColor(e.target.value)} className="h-5 w-7 cursor-pointer rounded" />
                    </div>
                    <Button variant="destructive" size="sm" className="w-full" onClick={removeSelected}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remover texto
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* EMOJIS */}
              <TabsContent value="emoji" className="space-y-3 pt-3">
                <Label className="text-xs">Clique para adicionar</Label>
                <div className="grid grid-cols-6 gap-1.5">
                  {EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => addSticker(e)}
                      className="h-9 text-xl rounded-md hover:bg-muted transition-colors">{e}</button>
                  ))}
                </div>
                {selStick && (
                  <div className="border-t border-border pt-3 space-y-2">
                    <Label className="text-xs">Emoji selecionado: {selStick.emoji}</Label>
                    <div>
                      <Label className="text-[10px]">Tamanho: {selStick.size}</Label>
                      <Slider value={[selStick.size]} onValueChange={([v]) => updateSelStickerSize(v)} min={16} max={Math.round(stage.h * 0.9)} step={2} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Rotação: {selStick.rotation}°</Label>
                      <Slider value={[selStick.rotation]} onValueChange={([v]) => updateSelStickerRot(v)} min={-180} max={180} step={1} />
                    </div>
                    <Button variant="destructive" size="sm" className="w-full" onClick={removeSelected}>
                      <Trash2 className="h-4 w-4 mr-1" /> Remover emoji
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 px-4 py-3 border-t border-border/40 bg-background flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="flex-1 sm:flex-initial">
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!img || saving} className="flex-1 sm:flex-initial">
            <Check className="h-4 w-4 mr-1" /> {saving ? "Salvando…" : "Salvar e aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProfileMediaEditorModal;
