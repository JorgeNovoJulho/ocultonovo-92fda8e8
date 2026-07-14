import { useState } from "react";
import {
  Eye, EyeOff, Lock, Unlock, Copy, Trash2, ChevronUp, ChevronDown,
  Type, Image as ImageIcon, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "../useEditorStore";
import { AnyLayer } from "../layerTypes";
import { cn } from "@/lib/utils";

function labelFor(l: AnyLayer): string {
  if (l.kind === "text") return (l as any).text?.trim().slice(0, 28) || "Texto";
  if (l.kind === "image") return "Imagem";
  if (l.kind === "shape") {
    const s = l as any;
    if (s.shape === "svg") return s.svgName || "Vetor";
    return s.shape === "rect" ? "Retângulo" : s.shape === "circle" ? "Círculo" : "Linha";
  }
  return "Camada";
}

function IconFor({ l }: { l: AnyLayer }) {
  if (l.kind === "text") return <Type className="h-3.5 w-3.5" />;
  if (l.kind === "image") return <ImageIcon className="h-3.5 w-3.5" />;
  return <Square className="h-3.5 w-3.5" />;
}

export function LayersPanel() {
  const {
    doc, selectedIds, select, toggleHidden, toggleLock,
    removeLayer, duplicateLayer, reorder,
  } = useEditorStore();
  const [dragId, setDragId] = useState<string | null>(null);

  // Renderiza topo-do-stack primeiro (a última camada do array fica visualmente em cima)
  const layers = [...doc.layers].reverse();

  return (
    <div className="w-56 border-l border-border bg-card flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-border text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Camadas
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {layers.length === 0 && (
          <div className="px-3 py-6 text-xs text-muted-foreground text-center">
            Adicione textos, imagens ou formas para vê-los aqui.
          </div>
        )}
        {layers.map((l) => {
          const isSel = selectedIds.includes(l.id);
          return (
            <div
              key={l.id}
              draggable
              onDragStart={() => setDragId(l.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragId || dragId === l.id) return;
                // Move dragId para a posição de l (visualmente)
                // Como a lista visual está invertida, mover "para cima" na lista = "front" no array.
                const srcIdx = doc.layers.findIndex((x) => x.id === dragId);
                const dstIdx = doc.layers.findIndex((x) => x.id === l.id);
                if (srcIdx < 0 || dstIdx < 0) return;
                // up/down repetido até atingir destino
                const steps = Math.abs(dstIdx - srcIdx);
                const dir = dstIdx > srcIdx ? "up" : "down";
                for (let i = 0; i < steps; i++) reorder(dragId, dir as any);
                setDragId(null);
              }}
              onClick={(e) => select(l.id, e.shiftKey)}
              className={cn(
                "group flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded cursor-pointer text-xs",
                isSel ? "bg-primary/15 text-foreground" : "hover:bg-muted/60 text-foreground/80",
                l.hidden && "opacity-50",
              )}
            >
              <span className="shrink-0 text-muted-foreground">
                <IconFor l={l} />
              </span>
              <span className="flex-1 truncate" title={labelFor(l)}>
                {labelFor(l)}
              </span>
              <button
                className="opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); toggleHidden(l.id); }}
                title={l.hidden ? "Mostrar" : "Ocultar"}
              >
                {l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                className="opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); toggleLock(l.id); }}
                title={l.locked ? "Destravar" : "Travar"}
              >
                {l.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
            </div>
          );
        })}
      </div>

      {selectedIds.length === 1 && (
        <div className="border-t border-border p-2 flex items-center gap-1">
          <Button size="icon" variant="ghost" title="Trazer para frente" onClick={() => reorder(selectedIds[0], "front")}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" title="Enviar para trás" onClick={() => reorder(selectedIds[0], "back")}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <span className="mx-1 w-px h-5 bg-border" />
          <Button size="icon" variant="ghost" title="Duplicar" onClick={() => duplicateLayer(selectedIds[0])}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            title="Eliminar"
            onClick={() => removeLayer(selectedIds[0])}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
