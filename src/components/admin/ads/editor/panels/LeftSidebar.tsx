import { useState } from "react";
import { Type, Image as ImageIcon, Shapes, Upload, Palette, Layers, Sparkles, Paintbrush, LayoutTemplate, QrCode, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useEditorStore } from "../useEditorStore";
import {
  AD_PALETTES,
  defaultImageLayer,
  defaultShapeLayer,
  defaultTextLayer,
  TextLayer,
  ShapeLayer,
  newId,
} from "../layerTypes";
import { FONT_CATALOG } from "../fontsCatalog";
import { StockImageLibrary } from "../../StockImageLibrary";
import { useAdAi } from "@/hooks/useAdAi";
import { Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { SVG_SHAPES, STICKER_EMOJIS, STICKER_CATEGORIES, type StickerItem } from "../shapesCatalog";
import { Search, ImagePlus, X, Mic, Video, Camera, Wand2, Sliders } from "lucide-react";
import {
  RICH_TEMPLATES,
  TEMPLATE_CATEGORY_LABEL,
  TEMPLATE_STYLE_LABEL,
  TEMPLATE_COLOR_LABEL,
  TEMPLATE_COLOR_SWATCH,
  getTemplateRecommendation,
  type RichTemplate,
  type TemplateStyle,
  type TemplateColor,
} from "../templatesLibrary";
import { generateQrDataUrl } from "../qrCode";
import { LayerRenderer } from "../LayerRenderer";
import { useUserAdTemplates } from "../hooks/useUserAdTemplates";
import { Trash2, Check, Eye, Sparkles as SparklesIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type Tool = "templates" | "design" | "text" | "image" | "stock" | "shapes" | "stickers" | "qr" | "bg" | "scheme" | "ai" | "layers";

export function LeftSidebar() {
  const [tool, setTool] = useState<Tool>("templates");
  const {
    addLayer,
    doc,
    setBackground,
    setBackgroundImage,
    selectedIds,
    select,
    removeLayer,
    toggleLock,
    toggleHidden,
    reorder,
    applyPalette,
    updateLayer,
    loadDoc,
  } = useEditorStore();

  const ICONS: { id: Tool; label: string; icon: any }[] = [
    { id: "templates", label: "Modelos", icon: LayoutTemplate },
    { id: "design", label: "Design", icon: Sliders },
    { id: "image", label: "Carregar", icon: Upload },
    { id: "stock", label: "Mídia", icon: ImageIcon },
    { id: "text", label: "Texto", icon: Type },
    { id: "shapes", label: "Formas", icon: Shapes },
    { id: "stickers", label: "Stickers", icon: Smile },
    { id: "qr", label: "QR", icon: QrCode },
    { id: "bg", label: "Fundo", icon: Palette },
    { id: "scheme", label: "Esquema", icon: Paintbrush },
    { id: "ai", label: "IA", icon: Sparkles },
    { id: "layers", label: "Camadas", icon: Layers },
  ];

  const addText = (preset: "title" | "subtitle" | "body" | "cta") => {
    if (preset === "title") {
      addLayer(defaultTextLayer({ text: "Título incrível", fontSize: 96, fontWeight: 900, w: 800, h: 130 }));
    } else if (preset === "subtitle") {
      addLayer(defaultTextLayer({ text: "Subtítulo elegante", fontSize: 48, fontWeight: 600, w: 700, h: 70 }));
    } else if (preset === "body") {
      addLayer(defaultTextLayer({ text: "Texto descritivo do anúncio.", fontSize: 28, fontWeight: 400, w: 700, h: 100 }));
    } else {
      addLayer(
        defaultTextLayer({
          text: "Clique aqui",
          fontSize: 24,
          fontWeight: 700,
          w: 260,
          h: 64,
          color: "#000",
          align: "center",
        }),
      );
    }
  };

  const selectedLayer = doc.layers.find((l) => selectedIds.includes(l.id)) ?? null;

  return (
    <div className="flex h-full bg-card border-r border-border">
      <div className="flex flex-col gap-1 p-2 border-r border-border w-16 overflow-y-auto">
        {ICONS.map((it) => (
          <button
            key={it.id}
            onClick={() => setTool(it.id)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-2 rounded-md text-[10px] transition-colors",
              tool === it.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground",
            )}
          >
            <it.icon className="h-4 w-4" />
            <span className="truncate">{it.label}</span>
          </button>
        ))}
      </div>

      <div className="w-72 max-w-[80vw] overflow-y-auto">
        {tool === "text" && (
          <div className="p-3 space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Adicionar texto</h4>
            <Button variant="outline" className="w-full justify-start text-2xl font-black h-14" onClick={() => addText("title")}>
              Título
            </Button>
            <Button variant="outline" className="w-full justify-start text-lg font-semibold h-12" onClick={() => addText("subtitle")}>
              Subtítulo
            </Button>
            <Button variant="outline" className="w-full justify-start text-sm h-10" onClick={() => addText("body")}>
              Corpo de texto
            </Button>
            <Button variant="outline" className="w-full justify-center text-xs font-bold h-10" onClick={() => addText("cta")}>
              Botão CTA
            </Button>
            <div className="pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Fontes <span className="text-muted-foreground/60 normal-case">({FONT_CATALOG.length})</span>
              </h4>
              <div className="grid grid-cols-1 gap-0.5 max-h-[420px] overflow-y-auto pr-1">
                {FONT_CATALOG.map((f) => (
                  <button
                    key={f.family}
                    onClick={() => addLayer(defaultTextLayer({ text: f.family, fontFamily: f.family, fontSize: 64 }))}
                    style={{ fontFamily: `"${f.family}", sans-serif` }}
                    className="text-left px-2 py-1.5 rounded hover:bg-muted text-base truncate"
                    title={`${f.family} · ${f.category}`}
                  >
                    {f.family}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tool === "image" && (
          <UploadsPanel
            onAddImage={(url) => addLayer(defaultImageLayer(url, { w: 600, h: 600 }))}
            onOpenAi={() => setTool("ai")}
            onOpenStock={() => setTool("stock")}
          />
        )}

        {tool === "design" && (
          <DesignPanel
            doc={doc}
            onSetBg={(c) => setBackground(c)}
            onSetBgImage={(u) => setBackgroundImage(u)}
            onOpenStock={() => setTool("stock")}
            onOpenAi={() => setTool("ai")}
          />
        )}

        {tool === "stock" && (
          <div className="p-2">
            <StockImageLibrary
              defaultQuery="abstrato"
              onPick={(url) => addLayer(defaultImageLayer(url, { w: 700, h: 700 }))}
            />
          </div>
        )}

        {tool === "templates" && (
          <TemplatesPanel
            onLoad={(d) => {
              loadDoc(d);
              toast.success("Template carregado");
            }}
            onLoadUserDoc={(d) => loadDoc(d)}
          />
        )}

        {tool === "shapes" && (
          <div className="p-3 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Básicas</h4>
            <div className="grid grid-cols-3 gap-2">
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("rect"))} label="Quadrado">
                <div className="w-8 h-8 bg-primary rounded" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("circle"))} label="Círculo">
                <div className="w-8 h-8 bg-primary rounded-full" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("line", { h: 8, w: 200 }))} label="Linha">
                <div className="w-10 h-1 bg-primary rounded" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("rect", { radius: 999, h: 80, w: 240, fill: "#facc15" }))} label="Pill">
                <div className="w-10 h-4 bg-yellow-400 rounded-full" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("rect", { fill: "#000000cc", w: 800, h: 200 }))} label="Faixa">
                <div className="w-10 h-3 bg-foreground rounded" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("rect", { radius: 24, w: 320, h: 320, fill: "#ec4899" }))} label="Card">
                <div className="w-8 h-8 bg-pink-500 rounded-lg" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("rect", { radius: 12, w: 400, h: 60, fill: "transparent", stroke: "#ec4899", strokeWidth: 3 }))} label="Outline">
                <div className="w-10 h-5 border-2 border-primary rounded" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("rect", { radius: 0, w: 80, h: 400, fill: "#ec4899" }))} label="Barra V">
                <div className="w-1.5 h-9 bg-primary" />
              </ShapeButton>
              <ShapeButton onClick={() => addLayer(defaultShapeLayer("circle", { w: 40, h: 40, fill: "#ec4899" }))} label="Ponto">
                <div className="w-3 h-3 bg-primary rounded-full" />
              </ShapeButton>
            </div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase pt-2">
              Vetoriais <span className="normal-case text-muted-foreground/60">({SVG_SHAPES.length})</span>
            </h4>
            <div className="grid grid-cols-4 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {SVG_SHAPES.map((s) => (
                <button
                  key={s.id}
                  title={s.label}
                  onClick={() =>
                    addLayer(
                      defaultShapeLayer("svg", {
                        w: 200,
                        h: 200,
                        svgPath: s.path,
                        svgViewBox: s.viewBox ?? "0 0 100 100",
                        fill: "#ec4899",
                        radius: 0,
                      }),
                    )
                  }
                  className="aspect-square flex items-center justify-center rounded border border-border hover:border-primary bg-background"
                >
                  <svg viewBox={s.viewBox ?? "0 0 100 100"} className="w-7 h-7">
                    <path d={s.path} fill="currentColor" className="text-foreground" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {tool === "stickers" && (
          <StickersPanel
            onAdd={(emoji) =>
              addLayer(
                defaultTextLayer({
                  text: emoji,
                  fontSize: 180,
                  fontWeight: 400,
                  w: 220,
                  h: 240,
                  align: "center",
                  color: "#ffffff",
                }),
              )
            }
          />
        )}

        {tool === "qr" && <QrPanel onAdd={(src) => addLayer(defaultImageLayer(src, { w: 360, h: 360, fit: "contain", radius: 8 }))} />}


        {tool === "bg" && (
          <div className="p-3 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Cor de fundo</h4>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={doc.background}
                onChange={(e) => setBackground(e.target.value)}
                className="w-12 h-10 rounded border border-border bg-transparent"
              />
              <input
                value={doc.background}
                onChange={(e) => setBackground(e.target.value)}
                className="flex-1 h-10 rounded border border-border bg-background px-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {[
                "#0b0b10","#ffffff","#ec4899","#f43f5e","#facc15","#22c55e",
                "#0ea5e9","#6366f1","#a855f7","#f97316","#1e293b","#fef3c7",
              ].map((c) => (
                <button
                  key={c}
                  onClick={() => setBackground(c)}
                  className="aspect-square rounded border border-border"
                  style={{ background: c }}
                />
              ))}
            </div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase pt-2">Imagem de fundo</h4>
            <input
              placeholder="URL da imagem (opcional)"
              value={doc.backgroundImage ?? ""}
              onChange={(e) => setBackgroundImage(e.target.value || null)}
              className="w-full h-9 rounded border border-border bg-background px-2 text-sm"
            />
            {doc.backgroundImage && (
              <Button variant="outline" size="sm" onClick={() => setBackgroundImage(null)}>
                Remover imagem
              </Button>
            )}
          </div>
        )}

        {tool === "scheme" && (
          <div className="p-3 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase">Paletas</h4>
            <p className="text-[11px] text-muted-foreground">
              Aplica fundo + cores nas camadas de texto e formas em 1 clique.
            </p>
            <div className="space-y-2">
              {AD_PALETTES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    applyPalette(p.colors);
                    toast.success(`Paleta "${p.name}" aplicada`);
                  }}
                  className="w-full p-2 rounded-md border border-border hover:border-primary hover:bg-muted/40 text-left"
                >
                  <div className="flex gap-1 mb-1.5">
                    {p.colors.map((c, i) => (
                      <div
                        key={i}
                        className="flex-1 h-8 rounded"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tool === "ai" && (
          <AiPanel
            selectedLayer={selectedLayer}
            onApplyCopy={(text) => {
              if (selectedLayer && selectedLayer.kind === "text") {
                updateLayer(selectedLayer.id, { text });
              } else {
                addLayer(defaultTextLayer({ text, fontSize: 72, fontWeight: 800, w: 800 }));
              }
            }}
            onApplyImage={(url, naturalW, naturalH) => {
              const maxSide = 900;
              const ratio = naturalW && naturalH ? naturalW / naturalH : 1;
              const w = ratio >= 1 ? maxSide : Math.round(maxSide * ratio);
              const h = ratio >= 1 ? Math.round(maxSide / ratio) : maxSide;
              addLayer(defaultImageLayer(url, { w, h, fit: "cover", radius: 0 }));
            }}
            onApplyBackground={(url) => setBackgroundImage(url)}
          />
        )}

        {tool === "layers" && (
          <div className="p-2 space-y-1">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase px-1">Camadas</h4>
            {[...doc.layers].reverse().map((l) => {
              const isSel = selectedIds.includes(l.id);
              return (
                <div
                  key={l.id}
                  className={cn(
                    "flex items-center gap-1 p-1.5 rounded text-xs cursor-pointer",
                    isSel ? "bg-primary/15 ring-1 ring-primary" : "hover:bg-muted",
                  )}
                  onClick={() => select(l.id)}
                >
                  <span className="flex-1 truncate">
                    {l.kind === "text" ? `T · ${(l as any).text?.slice(0, 18)}` : l.kind === "image" ? "Imagem" : `Forma · ${(l as any).shape}`}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); toggleHidden(l.id); }} className="text-muted-foreground hover:text-foreground">
                    {l.hidden ? "👁" : "○"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); toggleLock(l.id); }} className="text-muted-foreground hover:text-foreground">
                    {l.locked ? "🔒" : "🔓"}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); reorder(l.id, "up"); }} className="text-muted-foreground hover:text-foreground">↑</button>
                  <button onClick={(e) => { e.stopPropagation(); reorder(l.id, "down"); }} className="text-muted-foreground hover:text-foreground">↓</button>
                  <button onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }} className="text-destructive hover:text-destructive">✕</button>
                </div>
              );
            })}
            {!doc.layers.length && <p className="text-xs text-muted-foreground px-2 py-4 text-center">Nenhuma camada ainda.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="aspect-square flex flex-col items-center justify-center gap-1 rounded-md border border-border hover:border-primary hover:bg-muted text-[10px]"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function AiPanel({
  selectedLayer,
  onApplyCopy,
  onApplyImage,
  onApplyBackground,
}: {
  selectedLayer: any | null;
  onApplyCopy: (text: string) => void;
  onApplyImage: (url: string, naturalW?: number, naturalH?: number) => void;
  onApplyBackground: (url: string) => void;
}) {
  const { loading, cancel, suggestCopy, generateImage } = useAdAi();
  const [mode, setMode] = useState<"copy" | "image">("copy");
  const [product, setProduct] = useState("");
  const [tone, setTone] = useState("misterioso e elegante");
  const [variants, setVariants] = useState<{ title: string; description: string; cta: string }[]>([]);

  // Image generation state
  const [imgPrompt, setImgPrompt] = useState("");
  const [imgSize, setImgSize] = useState<"1024x1024" | "1024x1536" | "1536x1024">("1024x1024");
  const [imgQuality, setImgQuality] = useState<"low" | "medium" | "high">("medium");
  const [generatedImages, setGeneratedImages] = useState<{ url: string; size: string }[]>([]);

  async function generate() {
    if (!product.trim()) {
      toast.error("Descreva o produto ou oferta");
      return;
    }
    const next: typeof variants = [];
    for (let i = 0; i < 3; i++) {
      const r = await suggestCopy({ product, tone });
      if (!r) break;
      next.push({ title: r.title, description: r.description, cta: r.cta_text });
    }
    if (next.length) setVariants(next);
  }

  async function generateImg() {
    if (!imgPrompt.trim()) {
      toast.error("Descreva a imagem desejada");
      return;
    }
    const r = await generateImage({ prompt: imgPrompt, size: imgSize, quality: imgQuality });
    if (r) {
      setGeneratedImages((prev) => [{ url: r.dataUrl, size: r.size }, ...prev].slice(0, 6));
      toast.success("Imagem gerada");
    }
  }

  function imgSizeToWH(s: string): { w: number; h: number } {
    const [w, h] = s.split("x").map((n) => Number(n) || 1024);
    return { w, h };
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        <button
          onClick={() => setMode("copy")}
          className={cn(
            "flex-1 h-8 text-xs rounded font-medium transition-colors",
            mode === "copy" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Sparkles className="h-3 w-3 inline mr-1" /> Copy
        </button>
        <button
          onClick={() => setMode("image")}
          className={cn(
            "flex-1 h-8 text-xs rounded font-medium transition-colors",
            mode === "image" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ImagePlus className="h-3 w-3 inline mr-1" /> Imagem
        </button>
      </div>

      {mode === "copy" && (
        <>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">IA · Gerar copy</h4>
          <div>
            <Label className="text-[11px]">Produto / oferta</Label>
            <Textarea
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Ex: Plano VIP da Oculto com acesso a chats privados"
              className="h-20 text-xs"
            />
          </div>
          <div>
            <Label className="text-[11px]">Tom</Label>
            <Input value={tone} onChange={(e) => setTone(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={generate} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              Gerar 3 variações
            </Button>
            {loading && (
              <Button size="sm" variant="destructive" onClick={cancel}>
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {selectedLayer?.kind === "text" && (
            <p className="text-[10px] text-muted-foreground">
              Aplicar substituirá o texto da camada selecionada.
            </p>
          )}
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-xs space-y-1">
                <div className="font-bold leading-tight">{v.title}</div>
                <div className="text-muted-foreground">{v.description}</div>
                <div className="text-[10px] uppercase tracking-wide text-primary">{v.cta}</div>
                <div className="flex gap-1 pt-1">
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onApplyCopy(v.title)}>
                    Título
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onApplyCopy(v.description)}>
                    Descrição
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onApplyCopy(v.cta)}>
                    CTA
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "image" && (
        <>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">IA · Gerar imagem</h4>
          <p className="text-[10px] text-muted-foreground">
            Gere arte original via OpenAI (gpt-image-1). Use como fundo ou camada.
          </p>
          <div>
            <Label className="text-[11px]">Descrição da imagem</Label>
            <Textarea
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
              placeholder="Ex: Fundo noturno com luzes neon rosa e roxas, atmosfera de balada exclusiva, sem texto"
              className="h-24 text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Proporção</Label>
              <select
                value={imgSize}
                onChange={(e) => setImgSize(e.target.value as any)}
                className="w-full h-8 text-xs rounded border border-border bg-background px-2"
              >
                <option value="1024x1024">Quadrado 1:1</option>
                <option value="1024x1536">Retrato 2:3</option>
                <option value="1536x1024">Paisagem 3:2</option>
              </select>
            </div>
            <div>
              <Label className="text-[11px]">Qualidade</Label>
              <select
                value={imgQuality}
                onChange={(e) => setImgQuality(e.target.value as any)}
                className="w-full h-8 text-xs rounded border border-border bg-background px-2"
              >
                <option value="low">Rápida</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={generateImg} disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ImagePlus className="h-3.5 w-3.5 mr-1" />}
              Gerar imagem
            </Button>
            {loading && (
              <Button size="sm" variant="destructive" onClick={cancel}>
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {generatedImages.length > 0 && (
            <div className="space-y-2 pt-1">
              <h5 className="text-[11px] font-semibold text-muted-foreground uppercase">Resultados</h5>
              {generatedImages.map((img, i) => {
                const { w, h } = imgSizeToWH(img.size);
                return (
                  <div key={i} className="rounded-md border border-border overflow-hidden">
                    <img loading="lazy" decoding="async" src={img.url} alt={`gerada ${i + 1}`} className="w-full block bg-muted" />
                    <div className="flex gap-1 p-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] flex-1"
                        onClick={() => onApplyImage(img.url, w, h)}
                      >
                        Adicionar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] flex-1"
                        onClick={() => {
                          onApplyBackground(img.url);
                          toast.success("Definido como fundo");
                        }}
                      >
                        Usar como fundo
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StickersPanel({ onAdd }: { onAdd: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const q = normalize(query.trim());

  function matches(item: StickerItem): boolean {
    if (!q) return true;
    if (normalize(item.name).includes(q)) return true;
    if (item.keywords?.some((k) => normalize(k).includes(q))) return true;
    if (item.emoji === query) return true;
    return false;
  }

  const visibleCategories = STICKER_CATEGORIES
    .filter((c) => activeCat === "all" || c.id === activeCat)
    .map((c) => ({
      ...c,
      items: c.items.filter(matches),
    }))
    .filter((c) => c.items.length > 0);

  const totalVisible = visibleCategories.reduce((sum, c) => sum + c.items.length, 0);

  function handleDragStart(e: React.DragEvent, emoji: string) {
    e.dataTransfer.setData("application/x-oculto-sticker", emoji);
    e.dataTransfer.setData("text/plain", emoji);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="p-3 space-y-2.5">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">Emojis e Stickers</h4>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome (ex: coração, fogo, festa)"
          className="h-8 text-xs pl-7"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setActiveCat("all")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
            activeCat === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Todos
        </button>
        {STICKER_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
              activeCat === c.id
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            title={c.label}
          >
            {c.label.split(" ")[0]}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Clique ou arraste para o canvas · {totalVisible} {totalVisible === 1 ? "item" : "itens"}
      </p>
      {visibleCategories.length === 0 && (
        <div className="text-[11px] text-muted-foreground py-6 text-center">
          Nenhum sticker encontrado.
        </div>
      )}
      <div className="space-y-3">
        {visibleCategories.map((cat) => (
          <div key={cat.id}>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">
              {cat.label}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {cat.items.map((item) => (
                <button
                  key={cat.id + item.emoji}
                  onClick={() => onAdd(item.emoji)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.emoji)}
                  className="aspect-square text-3xl rounded hover:bg-muted border border-border cursor-grab active:cursor-grabbing"
                  title={item.name}
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function TemplateThumb({ doc }: { doc: import("../layerTypes").AdDoc }) {
  // Thumb estática escalonando o doc para um quadradinho.
  const W = 140;
  const H = (doc.height / doc.width) * W;
  const scale = W / doc.width;
  const bg = doc.backgroundImage
    ? `url(${doc.backgroundImage}) center/cover no-repeat, ${doc.background}`
    : doc.background;
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: doc.width,
          height: doc.height,
          background: bg,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {doc.layers.map((l) => (
          <LayerRenderer key={l.id} layer={l} />
        ))}
      </div>
    </div>
  );
}

function QrPanel({ onAdd }: { onAdd: (src: string) => void }) {
  const [text, setText] = useState("https://ocultoswing.com.br");
  const [fg, setFg] = useState("#000000");
  const [bg, setBg] = useState("#ffffff");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function gen() {
    if (!text.trim()) {
      toast.error("Informe a URL ou texto");
      return;
    }
    setLoading(true);
    try {
      const url = await generateQrDataUrl(text, { color: fg, background: bg, size: 512 });
      setPreview(url);
    } catch (e: any) {
      toast.error("Falha ao gerar QR Code", { description: e?.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-3 space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">QR Code</h4>
      <div>
        <Label className="text-[11px]">URL ou texto</Label>
        <Input value={text} onChange={(e) => setText(e.target.value)} className="h-8 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Cor</Label>
          <input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="w-full h-9 rounded border border-border bg-transparent" />
        </div>
        <div>
          <Label className="text-[11px]">Fundo</Label>
          <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="w-full h-9 rounded border border-border bg-transparent" />
        </div>
      </div>
      <Button size="sm" onClick={gen} disabled={loading} className="w-full">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
        Gerar pré-visualização
      </Button>
      {preview && (
        <div className="space-y-2">
          <div className="rounded border border-border p-3 flex items-center justify-center bg-white">
            <img loading="lazy" decoding="async" src={preview} alt="QR" className="w-40 h-40" />
          </div>
          <Button size="sm" className="w-full" onClick={() => onAdd(preview)}>
            Adicionar ao canvas
          </Button>
        </div>
      )}
    </div>
  );
}

function UserTemplatesBlock({ onLoad }: { onLoad: (doc: any) => void }) {
  const { templates, loading, userId, remove, refresh } = useUserAdTemplates();

  if (!userId) {
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
        Faça login para salvar e reutilizar templates próprios.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">Meus templates</h4>
        <button
          className="text-[10px] text-primary hover:underline"
          onClick={() => refresh()}
        >
          atualizar
        </button>
      </div>
      {loading && <div className="text-[11px] text-muted-foreground">Carregando…</div>}
      {!loading && templates.length === 0 && (
        <div className="text-[11px] text-muted-foreground">
          Você ainda não salvou nenhum template. Use “Salvar template” na barra superior.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {templates.map((t) => (
          <div key={t.id} className="relative group">
            <button
              onClick={() => {
                onLoad(t.doc);
                toast.success(`Template "${t.name}" carregado`);
              }}
              className="block w-full rounded-md overflow-hidden border border-border hover:border-primary aspect-[4/5] bg-muted"
              title={t.name}
            >
              {t.thumbnail ? (
                <img loading="lazy" decoding="async" src={t.thumbnail} alt={t.name} className="w-full h-full object-cover" />
              ) : (
                <TemplateThumb doc={t.doc} />
              )}
              <div className="absolute inset-x-0 bottom-0 bg-background/85 text-[10px] px-1.5 py-1 truncate text-left">
                {t.name}
              </div>
            </button>
            <button
              onClick={async (e) => {
                e.stopPropagation();
                if (!confirm(`Remover "${t.name}"?`)) return;
                try {
                  await remove(t.id);
                  toast.success("Template removido");
                } catch (err: any) {
                  toast.error(err?.message || "Falha ao remover");
                }
              }}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-background/90 rounded text-destructive"
              title="Remover"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===================== TEMPLATES PANEL com busca + filtros =====================
function TemplatesPanel({ onLoad, onLoadUserDoc }: { onLoad: (doc: any) => void; onLoadUserDoc: (doc: any) => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | keyof typeof TEMPLATE_CATEGORY_LABEL>("all");
  const [style, setStyle] = useState<"all" | TemplateStyle>("all");
  const [color, setColor] = useState<"all" | TemplateColor>("all");
  const [preview, setPreview] = useState<RichTemplate | null>(null);


  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const q = norm(query.trim());

  const list = RICH_TEMPLATES.filter((t) => {
    if (cat !== "all" && t.category !== cat) return false;
    if (style !== "all" && t.style !== style) return false;
    if (color !== "all" && !(t.colorTags ?? []).includes(color)) return false;
    if (!q) return true;
    const hay = [t.name, t.category, t.style ?? "", ...(t.keywords ?? []), ...(t.colorTags ?? [])]
      .map(norm)
      .join(" ");
    return hay.includes(q);
  });

  return (
    <div className="p-3 space-y-3">
      <UserTemplatesBlock onLoad={onLoadUserDoc} />
      <div className="h-px bg-border my-2" />
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar modelos aqui"
          className="h-9 text-xs pl-7"
        />
      </div>

      {/* Tipo */}
      <FilterRow label="Tipo">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>Todos</Chip>
        {(Object.keys(TEMPLATE_CATEGORY_LABEL) as Array<keyof typeof TEMPLATE_CATEGORY_LABEL>).map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {TEMPLATE_CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </FilterRow>

      {/* Estilo */}
      <FilterRow label="Estilo">
        <Chip active={style === "all"} onClick={() => setStyle("all")}>Todos</Chip>
        {(Object.keys(TEMPLATE_STYLE_LABEL) as TemplateStyle[]).map((s) => (
          <Chip key={s} active={style === s} onClick={() => setStyle(s)}>
            {TEMPLATE_STYLE_LABEL[s]}
          </Chip>
        ))}
      </FilterRow>

      {/* Cor */}
      <FilterRow label="Cor">
        <button
          onClick={() => setColor("all")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
            color === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Todas
        </button>
        {(Object.keys(TEMPLATE_COLOR_LABEL) as TemplateColor[]).map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            title={TEMPLATE_COLOR_LABEL[c]}
            className={cn(
              "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors",
              color === c ? "ring-2 ring-primary border-primary" : "border-border hover:border-muted-foreground",
            )}
          >
            <span className="w-3 h-3 rounded-full border border-border" style={{ background: TEMPLATE_COLOR_SWATCH[c] }} />
            <span className={cn(color === c ? "text-foreground" : "text-muted-foreground")}>{TEMPLATE_COLOR_LABEL[c]}</span>
          </button>
        ))}
      </FilterRow>

      <p className="text-[10px] text-muted-foreground">
        {list.length} {list.length === 1 ? "modelo" : "modelos"} · clique para carregar
      </p>

      {list.length === 0 ? (
        <div className="text-[11px] text-muted-foreground py-8 text-center border border-dashed border-border rounded-md">
          Nenhum modelo encontrado com esses filtros.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {list.map((t) => (
            <button
              key={t.id}
              onClick={() => setPreview(t)}
              className="group relative rounded-md overflow-hidden border border-border hover:border-primary aspect-[4/5] bg-muted"
              title={`${t.name} · ${TEMPLATE_CATEGORY_LABEL[t.category]} — clique para pré-visualizar`}
            >
              <TemplateThumb doc={t.doc} />
              <div className="absolute inset-0 bg-background/0 group-hover:bg-background/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-background/90 text-foreground px-2 py-1 rounded-full border border-border">
                  <Eye className="h-3 w-3" /> Pré-visualizar
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-background/85 text-[10px] px-1.5 py-1 truncate text-left flex items-center justify-between gap-1">
                <span className="truncate">{t.name}</span>
                <span className="text-[9px] text-muted-foreground uppercase shrink-0">{TEMPLATE_CATEGORY_LABEL[t.category]}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <TemplatePreviewDialog
        template={preview}
        onClose={() => setPreview(null)}
        onApply={(t) => {
          onLoad(t.doc);
          setPreview(null);
        }}
      />
    </div>
  );
}

function TemplatePreviewDialog({
  template,
  onClose,
  onApply,
}: {
  template: RichTemplate | null;
  onClose: () => void;
  onApply: (t: RichTemplate) => void;
}) {
  const open = !!template;
  const rec = template ? getTemplateRecommendation(template) : null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-2">
          <DialogTitle className="text-base">{template?.name ?? "Modelo"}</DialogTitle>
          <DialogDescription className="text-xs">
            {template
              ? `${TEMPLATE_CATEGORY_LABEL[template.category]}${
                  template.style ? ` · ${TEMPLATE_STYLE_LABEL[template.style]}` : ""
                } · ${template.doc.width}×${template.doc.height}px`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {template && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0 max-h-[70vh]">
            {/* Preview grande */}
            <div className="bg-muted/40 p-4 flex items-center justify-center min-h-[320px] md:min-h-[420px] border-t md:border-t-0 md:border-r border-border">
              <BigTemplatePreview doc={template.doc} maxW={520} maxH={520} />
            </div>

            {/* Recomendações */}
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary uppercase tracking-wide">
                  <SparklesIcon className="h-3.5 w-3.5" /> Recomendação de uso
                </div>
                <p className="text-sm mt-1 text-foreground/90">{rec?.headline}</p>
              </div>

              {rec && rec.tips.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Boas práticas</div>
                  <ul className="space-y-1.5">
                    {rec.tips.map((tip, i) => (
                      <li key={i} className="text-xs text-foreground/80 flex gap-2">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {template.colorTags && template.colorTags.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Paleta</div>
                  <div className="flex flex-wrap gap-1.5">
                    {template.colorTags.map((c) => (
                      <span key={c} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-border">
                        <span className="w-3 h-3 rounded-full border border-border" style={{ background: TEMPLATE_COLOR_SWATCH[c] }} />
                        {TEMPLATE_COLOR_LABEL[c]}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {template.keywords && template.keywords.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5">Indicado para</div>
                  <div className="flex flex-wrap gap-1">
                    {template.keywords.slice(0, 8).map((k) => (
                      <span key={k} className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{k}</span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
                Ao aplicar, o canvas mantém o tamanho do modelo ({template.doc.width}×{template.doc.height}px).
                Grade e guias permanecem ativas conforme sua configuração atual.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t border-border bg-card/50">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={() => template && onApply(template)} className="gap-1.5">
            <Check className="h-4 w-4" /> Aplicar no canvas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BigTemplatePreview({ doc, maxW, maxH }: { doc: import("../layerTypes").AdDoc; maxW: number; maxH: number }) {
  const ratio = Math.min(maxW / doc.width, maxH / doc.height);
  const W = doc.width * ratio;
  const H = doc.height * ratio;
  const bg = doc.backgroundImage
    ? `url(${doc.backgroundImage}) center/cover no-repeat, ${doc.background}`
    : doc.background;
  return (
    <div className="relative rounded-md overflow-hidden border border-border shadow-lg" style={{ width: W, height: H }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: doc.width,
          height: doc.height,
          background: bg,
          transform: `scale(${ratio})`,
          transformOrigin: "top left",
        }}
      >
        {doc.layers.map((l) => (
          <LayerRenderer key={l.id} layer={l} />
        ))}
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
        active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ===================== DESIGN PANEL =====================
function DesignPanel({
  doc,
  onSetBg,
  onSetBgImage,
  onOpenStock,
  onOpenAi,
}: {
  doc: any;
  onSetBg: (c: string) => void;
  onSetBgImage: (u: string | null) => void;
  onOpenStock: () => void;
  onOpenAi: () => void;
}) {
  const { updateLayer } = useEditorStore();
  const firstText = doc.layers.find((l: any) => l.kind === "text");
  const [title, setTitle] = useState<string>(firstText?.text ?? "");
  const [grelha, setGrelha] = useState(false);
  const [transbordo, setTransbordo] = useState(false);
  const [guias, setGuias] = useState(true);
  const [dobras, setDobras] = useState<"nenhum" | "terços" | "metade" | "cinco">("nenhum");

  // Sincroniza com janela do editor via CustomEvents (AdCanvasEditor ouve)
  function emit<T>(name: string, detail: T) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function sizeLabel() {
    const { width, height } = doc;
    if (width === 1080 && height === 1920) return "História do Instagram";
    if (width === 1080 && height === 1080) return "Post quadrado";
    if (width === 1080 && height === 1350) return "Post Instagram";
    return "Personalizado";
  }

  return (
    <div className="p-3 space-y-4 pb-8">
      <h4 className="text-center text-sm font-semibold">Design</h4>
      <div className="h-px bg-border" />

      {/* Tamanho */}
      <Row label="Tamanho">
        <div className="flex-1 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
          <div className="text-xs font-medium">{sizeLabel()}</div>
          <div className="text-[10px] text-muted-foreground">{doc.width}px × {doc.height}px</div>
        </div>
      </Row>

      {/* Imagem de fundo */}
      <Row label="Imagem de fundo">
        <select
          value={doc.backgroundImage ? "imagem" : "cor"}
          onChange={(e) => { if (e.target.value === "cor") onSetBgImage(null); }}
          className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="cor">🎨 Cor sólida</option>
          <option value="imagem">🖼️ Imagem</option>
        </select>
      </Row>

      {doc.backgroundImage && (
        <Row label="Fotografia">
          <div className="flex-1 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-1.5">
            <img loading="lazy" decoding="async" src={doc.backgroundImage} alt="bg" className="w-10 h-10 rounded object-cover" />
            <button
              onClick={onOpenStock}
              className="ml-auto h-7 w-7 rounded border border-border hover:bg-muted flex items-center justify-center"
              title="Substituir"
            >
              <ImageIcon className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onSetBgImage(null)}
              className="h-7 w-7 rounded border border-border hover:bg-destructive/10 hover:text-destructive flex items-center justify-center"
              title="Remover"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </Row>
      )}

      {/* Estilos (paleta rápida) */}
      <Row label="Estilos">
        <div className="flex-1 flex items-center gap-1 rounded-md border border-border p-1">
          {["#000000", "#1a1a1a", "#3d3d3d", "#6b6b6b"].map((c) => (
            <button key={c} onClick={() => onSetBg(c)} className="h-7 flex-1 rounded" style={{ background: c }} />
          ))}
          <button
            onClick={() => document.getElementById("design-bg-color")?.click()}
            className="h-7 w-7 rounded border border-border flex items-center justify-center hover:bg-muted text-base"
            title="Mais cores"
          >
            +
          </button>
          <input
            id="design-bg-color"
            type="color"
            className="sr-only"
            value={doc.background}
            onChange={(e) => onSetBg(e.target.value)}
          />
        </div>
      </Row>

      {/* Animação */}
      <Row label="Animação">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-9 text-xs"
          onClick={() => toast.info("Animação por camada disponível em breve")}
        >
          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
          Animate
        </Button>
      </Row>

      {/* Título */}
      <div>
        <div className="text-xs font-semibold mb-1.5">Título</div>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (firstText) updateLayer(firstText.id, { text: e.target.value } as any);
          }}
          placeholder="Título do design"
          className="h-9 text-xs"
        />
        {!firstText && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Adicione uma camada de texto para editar o título.
          </p>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* Esquema */}
      <div className="text-xs font-semibold">Esquema</div>

      <ToggleRow label="Grelha" value={grelha} onChange={(v) => { setGrelha(v); emit("oculto-editor:set-grid", v); }} />

      <Row label="Dobras">
        <select
          value={dobras}
          onChange={(e) => { setDobras(e.target.value as any); emit("oculto-editor:set-folds", e.target.value); }}
          className="flex-1 h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="nenhum">⊘ Nenhum</option>
          <option value="metade">Metade (1/2)</option>
          <option value="terços">Terços (1/3)</option>
          <option value="cinco">Quintos (1/5)</option>
        </select>
      </Row>

      <ToggleRow label="Transbordo" value={transbordo} onChange={(v) => { setTransbordo(v); emit("oculto-editor:set-overflow", v); }} />
      <ToggleRow label="Guias de alinhamento" value={guias} onChange={(v) => { setGuias(v); emit("oculto-editor:set-guides", v); }} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          value ? "bg-primary" : "bg-muted",
        )}
        aria-pressed={value}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-all",
            value ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

// ===================== UPLOADS PANEL =====================
function UploadsPanel({
  onAddImage,
  onOpenAi,
  onOpenStock,
}: {
  onAddImage: (url: string) => void;
  onOpenAi: () => void;
  onOpenStock: () => void;
}) {
  const fileRef = useState<HTMLInputElement | null>(null as any);
  const [activeTab, setActiveTab] = useState<"fotos" | "videos" | "audios">("fotos");

  async function pick(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    const url = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    onAddImage(url);
    toast.success("Imagem adicionada");
  }

  return (
    <div className="p-3 space-y-3">
      <h4 className="text-center text-sm font-semibold">Carregamentos</h4>
      <div className="h-px bg-border" />

      {/* Cards principais */}
      <div className="space-y-2">
        <label className="block">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="border-2 border-dashed border-primary/60 rounded-lg p-4 text-center hover:bg-primary/5 cursor-pointer transition-colors">
            <Upload className="h-6 w-6 mx-auto mb-1.5 text-primary" />
            <div className="text-xs font-semibold text-primary">Upload do dispositivo</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">JPG, PNG, WebP até 10MB</div>
          </div>
        </label>

        <button
          onClick={onOpenAi}
          className="w-full border-2 border-dashed border-purple-500/60 rounded-lg p-4 text-center hover:bg-purple-500/5 transition-colors"
        >
          <Sparkles className="h-6 w-6 mx-auto mb-1.5 text-purple-500" />
          <div className="text-xs font-semibold text-purple-500">Criar com IA</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Gerar imagens originais por prompt</div>
        </button>

        <button
          onClick={() => toast.info("Captura/gravação disponível em breve")}
          className="w-full border-2 border-dashed border-border rounded-lg p-4 text-center hover:bg-muted transition-colors"
        >
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <Camera className="h-5 w-5 text-muted-foreground" />
            <Video className="h-5 w-5 text-muted-foreground" />
            <Mic className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-xs font-semibold">Capturar / Gravar</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Câmera, vídeo ou áudio</div>
        </button>
      </div>

      {/* Integrações */}
      <div>
        <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Importar de</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: "Drive", color: "#1FA463", letter: "G" },
            { name: "Facebook", color: "#1877F2", letter: "f" },
            { name: "Dropbox", color: "#0061FF", letter: "D" },
          ].map((p) => (
            <button
              key={p.name}
              onClick={() => toast.info(`Integração com ${p.name} em breve`)}
              className="flex flex-col items-center gap-1 py-2 rounded-md border border-border hover:border-primary hover:bg-muted/40 transition-colors"
              title={p.name}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: p.color }}
              >
                {p.letter}
              </span>
              <span className="text-[10px]">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-3 border-b border-border">
          {[
            { id: "fotos", label: "Minhas fotos" },
            { id: "videos", label: "Vídeos" },
            { id: "audios", label: "Áudios" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={cn(
                "text-xs pb-1.5 -mb-px border-b-2 transition-colors",
                activeTab === t.id ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="py-6 text-center text-[11px] text-muted-foreground">
          {activeTab === "fotos" && "Personalize seus designs com suas próprias fotos."}
          {activeTab === "videos" && "Adicione seus vídeos ao projeto."}
          {activeTab === "audios" && "Importe trilhas e narrações em áudio."}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => (document.querySelector<HTMLInputElement>('input[type="file"][accept="image/*"]'))?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Carregar do dispositivo
            </Button>
            <Button variant="ghost" size="sm" className="text-xs ml-1" onClick={onOpenStock}>
              ou usar banco de mídia
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
