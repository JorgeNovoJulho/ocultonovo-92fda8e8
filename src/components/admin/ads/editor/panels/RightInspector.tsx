import { Copy, Trash2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEditorStore } from "../useEditorStore";
import { FONT_CATALOG } from "../fontsCatalog";
import { AnyLayer, TextLayer, ImageLayer, ShapeLayer, LayerAnimation } from "../layerTypes";
import { ANIMATION_OPTIONS } from "../animations";

export function RightInspector() {
  const { doc, selectedIds, updateLayer, removeLayer, duplicateLayer } = useEditorStore();
  const layer = doc.layers.find((l) => selectedIds.includes(l.id));

  if (!layer) {
    return (
      <div className="w-72 border-l border-border bg-card p-4 text-sm text-muted-foreground">
        Selecione uma camada para editar suas propriedades.
      </div>
    );
  }

  const patch = (p: Partial<AnyLayer>) => updateLayer(layer.id, p);

  return (
    <div className="w-72 border-l border-border bg-card overflow-y-auto">
      <div className="p-3 flex items-center gap-1 border-b border-border">
        <Button size="sm" variant="ghost" onClick={() => duplicateLayer(layer.id)}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeLayer(layer.id)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
        </Button>
      </div>

      <div className="p-3 space-y-3 border-b border-border">
        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={layer.x} onChange={(v) => patch({ x: v })} />
          <NumField label="Y" value={layer.y} onChange={(v) => patch({ y: v })} />
          <NumField label="W" value={layer.w} onChange={(v) => patch({ w: Math.max(20, v) })} />
          <NumField label="H" value={layer.h} onChange={(v) => patch({ h: Math.max(20, v) })} />
        </div>
        <div>
          <Label className="text-[11px]">Rotação ({layer.rotation}°)</Label>
          <Slider value={[layer.rotation]} min={-180} max={180} step={1} onValueChange={([v]) => patch({ rotation: v })} />
        </div>
        <div>
          <Label className="text-[11px]">Opacidade ({Math.round(layer.opacity * 100)}%)</Label>
          <Slider value={[layer.opacity * 100]} min={0} max={100} step={1} onValueChange={([v]) => patch({ opacity: v / 100 })} />
        </div>
      </div>

      {layer.kind === "text" && <TextProps layer={layer} patch={patch as (p: Partial<TextLayer>) => void} />}
      {layer.kind === "image" && <ImageProps layer={layer} patch={patch as (p: Partial<ImageLayer>) => void} />}
      {layer.kind === "shape" && <ShapeProps layer={layer} patch={patch as (p: Partial<ShapeLayer>) => void} />}

      <AnimationProps layer={layer} patch={patch} />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input type="number" value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value) || 0)} className="h-8 text-xs" />
    </div>
  );
}

function TextProps({ layer, patch }: { layer: TextLayer; patch: (p: Partial<TextLayer>) => void }) {
  return (
    <div className="p-3 space-y-3">
      <div>
        <Label className="text-[11px]">Texto</Label>
        <textarea
          value={layer.text}
          onChange={(e) => patch({ text: e.target.value })}
          className="w-full h-20 rounded border border-border bg-background p-2 text-sm resize-none"
        />
      </div>
      <div>
        <Label className="text-[11px]">Tipo de letra</Label>
        <Select value={layer.fontFamily} onValueChange={(v) => patch({ fontFamily: v })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72">
            {FONT_CATALOG.map((f) => (
              <SelectItem key={f.family} value={f.family} style={{ fontFamily: `"${f.family}", sans-serif` }}>
                {f.family}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Peso</Label>
          <Select value={String(layer.fontWeight)} onValueChange={(v) => patch({ fontWeight: Number(v) })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                <SelectItem key={w} value={String(w)}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumField label="Tamanho" value={layer.fontSize} onChange={(v) => patch({ fontSize: Math.max(8, v) })} />
      </div>
      <div className="flex items-center gap-1">
        <Toggle on={layer.fontWeight >= 700} onClick={() => patch({ fontWeight: layer.fontWeight >= 700 ? 400 : 800 })}><Bold className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={!!layer.italic} onClick={() => patch({ italic: !layer.italic })}><Italic className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={!!layer.underline} onClick={() => patch({ underline: !layer.underline })}><Underline className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={!!layer.strike} onClick={() => patch({ strike: !layer.strike })}><Strikethrough className="h-3.5 w-3.5" /></Toggle>
        <span className="mx-1 w-px h-5 bg-border" />
        <Toggle on={layer.align === "left"} onClick={() => patch({ align: "left" })}><AlignLeft className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={layer.align === "center"} onClick={() => patch({ align: "center" })}><AlignCenter className="h-3.5 w-3.5" /></Toggle>
        <Toggle on={layer.align === "right"} onClick={() => patch({ align: "right" })}><AlignRight className="h-3.5 w-3.5" /></Toggle>
      </div>
      <ColorRow label="Cor" value={layer.color} onChange={(v) => patch({ color: v })} />
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Contorno</Label>
          <input
            type="checkbox"
            checked={!!layer.stroke}
            onChange={(e) => patch({ stroke: e.target.checked ? { color: "#000", width: 2 } : null })}
          />
        </div>
        {layer.stroke && (
          <div className="mt-2 space-y-2">
            <ColorRow label="Cor" value={layer.stroke.color} onChange={(v) => patch({ stroke: { ...layer.stroke!, color: v } })} />
            <div>
              <Label className="text-[11px]">Espessura ({layer.stroke.width}px)</Label>
              <Slider value={[layer.stroke.width]} min={0} max={12} step={1} onValueChange={([v]) => patch({ stroke: { ...layer.stroke!, width: v } })} />
            </div>
          </div>
        )}
      </div>
      <div>
        <Label className="text-[11px]">Altura da linha ({layer.lineHeight.toFixed(2)})</Label>
        <Slider value={[layer.lineHeight * 100]} min={80} max={200} step={5} onValueChange={([v]) => patch({ lineHeight: v / 100 })} />
      </div>
      <div>
        <Label className="text-[11px]">Espaçamento ({layer.letterSpacing}px)</Label>
        <Slider value={[layer.letterSpacing]} min={-5} max={20} step={1} onValueChange={([v]) => patch({ letterSpacing: v })} />
      </div>
    </div>
  );
}

function ImageProps({ layer, patch }: { layer: ImageLayer; patch: (p: Partial<ImageLayer>) => void }) {
  return (
    <div className="p-3 space-y-3">
      <div>
        <Label className="text-[11px]">URL · Substituir</Label>
        <Input value={layer.src} onChange={(e) => patch({ src: e.target.value })} className="h-9 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px]">Ajuste</Label>
          <Select value={layer.fit} onValueChange={(v: any) => patch({ fit: v })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cover">Preencher</SelectItem>
              <SelectItem value="contain">Conter</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumField label="Arredondado" value={layer.radius ?? 0} onChange={(v) => patch({ radius: Math.max(0, v) })} />
      </div>

      <div className="pt-1 border-t border-border">
        <h4 className="text-[11px] uppercase font-semibold text-muted-foreground mt-2 mb-1">Efeitos rápidos</h4>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <FilterToggle label="P&B" on={(layer.grayscale ?? 0) >= 100} onClick={() => patch({ grayscale: (layer.grayscale ?? 0) >= 100 ? 0 : 100 })} />
          <FilterToggle label="Sépia" on={(layer.sepia ?? 0) >= 100} onClick={() => patch({ sepia: (layer.sepia ?? 0) >= 100 ? 0 : 100 })} />
          <FilterToggle label="Inverter" on={(layer.invert ?? 0) >= 100} onClick={() => patch({ invert: (layer.invert ?? 0) >= 100 ? 0 : 100 })} />
          <FilterToggle label="Vinheta" on={!!layer.vignette} onClick={() => patch({ vignette: !layer.vignette })} />
        </div>
      </div>

      <div className="pt-1 border-t border-border">
        <h4 className="text-[11px] uppercase font-semibold text-muted-foreground mt-2 mb-1">Ajustes</h4>
        <SliderRow label="Luminosidade" value={layer.brightness ?? 100} min={0} max={200} onChange={(v) => patch({ brightness: v })} />
        <SliderRow label="Contraste" value={layer.contrast ?? 100} min={0} max={200} onChange={(v) => patch({ contrast: v })} />
        <SliderRow label="Saturação" value={layer.saturation ?? 100} min={0} max={200} onChange={(v) => patch({ saturation: v })} />
        <SliderRow label="Tom (Hue)" value={layer.hue ?? 0} min={-180} max={180} onChange={(v) => patch({ hue: v })} suffix="°" />
        <SliderRow label="Desfoque" value={layer.filterBlur ?? 0} min={0} max={40} onChange={(v) => patch({ filterBlur: v })} suffix="px" />
        <SliderRow label="Escurecer" value={Math.round((layer.filterDarken ?? 0) * 100)} min={0} max={80} onChange={(v) => patch({ filterDarken: v / 100 })} suffix="%" />
      </div>

      <div className="pt-1 border-t border-border">
        <h4 className="text-[11px] uppercase font-semibold text-muted-foreground mt-2 mb-1">Borda</h4>
        <div className="grid grid-cols-2 gap-2">
          <NumField label="Espessura" value={layer.borderWidth ?? 0} onChange={(v) => patch({ borderWidth: Math.max(0, v) })} />
          <div>
            <Label className="text-[11px]">Estilo</Label>
            <Select value={layer.borderStyle ?? "solid"} onValueChange={(v: any) => patch({ borderStyle: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Sólida</SelectItem>
                <SelectItem value="dashed">Tracejada</SelectItem>
                <SelectItem value="dotted">Pontilhada</SelectItem>
                <SelectItem value="double">Dupla</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {(layer.borderWidth ?? 0) > 0 && (
          <ColorRow label="Cor da borda" value={layer.borderColor ?? "#000000"} onChange={(v) => patch({ borderColor: v })} />
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumField label="Margem" value={layer.margin ?? 0} onChange={(v) => patch({ margin: Math.max(0, v) })} />
          {(layer.margin ?? 0) > 0 && (
            <ColorRow label="Cor margem" value={layer.marginColor ?? "#ffffff"} onChange={(v) => patch({ marginColor: v })} />
          )}
        </div>
      </div>

      <div className="pt-1 border-t border-border">
        <h4 className="text-[11px] uppercase font-semibold text-muted-foreground mt-2 mb-1">Sombra & Brilho</h4>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-[11px]">Sombra</Label>
          <input
            type="checkbox"
            checked={!!layer.shadow}
            onChange={(e) => patch({ shadow: e.target.checked ? { x: 0, y: 8, blur: 24, color: "#00000099" } : null })}
          />
        </div>
        {layer.shadow && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <NumField label="X" value={layer.shadow.x} onChange={(v) => patch({ shadow: { ...layer.shadow!, x: v } })} />
              <NumField label="Y" value={layer.shadow.y} onChange={(v) => patch({ shadow: { ...layer.shadow!, y: v } })} />
              <NumField label="Blur" value={layer.shadow.blur} onChange={(v) => patch({ shadow: { ...layer.shadow!, blur: Math.max(0, v) } })} />
            </div>
            <ColorRow label="Cor" value={layer.shadow.color} onChange={(v) => patch({ shadow: { ...layer.shadow!, color: v } })} />
          </div>
        )}
        <div className="flex items-center justify-between mt-3 mb-1">
          <Label className="text-[11px]">Brilho</Label>
          <input
            type="checkbox"
            checked={!!layer.glow}
            onChange={(e) => patch({ glow: e.target.checked ? { blur: 30, color: "#ec4899" } : null })}
          />
        </div>
        {layer.glow && (
          <div className="space-y-2">
            <SliderRow label="Intensidade" value={layer.glow.blur} min={0} max={120} onChange={(v) => patch({ glow: { ...layer.glow!, blur: v } })} suffix="px" />
            <ColorRow label="Cor" value={layer.glow.color} onChange={(v) => patch({ glow: { ...layer.glow!, color: v } })} />
          </div>
        )}
      </div>

      <div className="pt-1 border-t border-border">
        <h4 className="text-[11px] uppercase font-semibold text-muted-foreground mt-2 mb-1">Interatividade</h4>
        <Label className="text-[11px]">Link</Label>
        <Input
          placeholder="https://..."
          value={layer.link ?? ""}
          onChange={(e) => patch({ link: e.target.value || null })}
          className="h-9 text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Disponível quando o anúncio for publicado como página web ou link incorporado.
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => patch({
          brightness: 100, contrast: 100, saturation: 100, hue: 0,
          sepia: 0, grayscale: 0, invert: 0, filterBlur: 0, filterDarken: 0,
          vignette: false, shadow: null, glow: null, borderWidth: 0, margin: 0,
        })}
      >
        Resetar efeitos
      </Button>
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="mb-1.5">
      <Label className="text-[11px]">{label} ({value}{suffix})</Label>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function FilterToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-2 rounded border text-[11px] ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}

function AnimationProps({ layer, patch }: { layer: AnyLayer; patch: (p: Partial<AnyLayer>) => void }) {
  const a: LayerAnimation = layer.animation ?? { kind: "none", duration: 600, delay: 0 };
  const setA = (next: Partial<LayerAnimation>) => patch({ animation: { ...a, ...next } });
  return (
    <div className="p-3 space-y-3 border-t border-border">
      <h4 className="text-[11px] uppercase font-semibold text-muted-foreground">Animação</h4>
      <Select value={a.kind} onValueChange={(v: any) => setA({ kind: v })}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ANIMATION_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {a.kind !== "none" && (
        <>
          <div>
            <Label className="text-[11px]">Duração ({a.duration}ms)</Label>
            <Slider value={[a.duration]} min={100} max={3000} step={50} onValueChange={([v]) => setA({ duration: v })} />
          </div>
          <div>
            <Label className="text-[11px]">Atraso ({a.delay}ms)</Label>
            <Slider value={[a.delay]} min={0} max={3000} step={50} onValueChange={([v]) => setA({ delay: v })} />
          </div>
        </>
      )}
    </div>
  );
}

function ShapeProps({ layer, patch }: { layer: ShapeLayer; patch: (p: Partial<ShapeLayer>) => void }) {
  return (
    <div className="p-3 space-y-3">
      <ColorRow label="Preenchimento" value={layer.fill} onChange={(v) => patch({ fill: v })} />
      {layer.shape === "rect" && (
        <div>
          <Label className="text-[11px]">Arredondamento ({layer.radius ?? 0}px)</Label>
          <Slider value={[layer.radius ?? 0]} min={0} max={400} step={2} onValueChange={([v]) => patch({ radius: v })} />
        </div>
      )}
      <div>
        <Label className="text-[11px]">Contorno ({layer.strokeWidth ?? 0}px)</Label>
        <Slider value={[layer.strokeWidth ?? 0]} min={0} max={20} step={1} onValueChange={([v]) => patch({ strokeWidth: v, stroke: layer.stroke ?? "#000" })} />
      </div>
      {(layer.strokeWidth ?? 0) > 0 && (
        <ColorRow label="Cor do contorno" value={layer.stroke ?? "#000"} onChange={(v) => patch({ stroke: v })} />
      )}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={value.startsWith("#") ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="w-10 h-9 rounded border border-border bg-transparent" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs" />
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 w-8 flex items-center justify-center rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}
