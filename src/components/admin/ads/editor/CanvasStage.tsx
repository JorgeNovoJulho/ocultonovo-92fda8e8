import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "./useEditorStore";
import { LayerRenderer } from "./LayerRenderer";
import { AnyLayer, defaultTextLayer } from "./layerTypes";
import { cn } from "@/lib/utils";

type DragMode =
  | { type: "move"; startX: number; startY: number; layers: { id: string; x: number; y: number }[] }
  | {
      type: "resize";
      handle: string;
      startX: number;
      startY: number;
      orig: { x: number; y: number; w: number; h: number };
      id: string;
    }
  | { type: "rotate"; cx: number; cy: number; id: string; startAngle: number; origRot: number }
  | null;

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const SNAP_THRESHOLD = 6;

export function CanvasStage({ previewKey = 0, showGrid = false }: { previewKey?: number; showGrid?: boolean } = {}) {
  const { doc, zoom, selectedIds, select, updateLayerLive, commitLive, addLayer } = useEditorStore();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragMode>(null);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const selected = doc.layers.find((l) => selectedIds.includes(l.id) && !l.locked);

  // snap helpers
  const snapTargets = useCallback(
    (excludeId?: string) => {
      const xs: number[] = [0, doc.width / 2, doc.width];
      const ys: number[] = [0, doc.height / 2, doc.height];
      doc.layers.forEach((l) => {
        if (l.id === excludeId || l.hidden) return;
        xs.push(l.x, l.x + l.w / 2, l.x + l.w);
        ys.push(l.y, l.y + l.h / 2, l.y + l.h);
      });
      return { xs, ys };
    },
    [doc],
  );

  const snap = useCallback(
    (val: number, candidates: number[]) => {
      for (const c of candidates) {
        if (Math.abs(val - c) < SNAP_THRESHOLD / zoom) return { v: c, hit: c };
      }
      return { v: val, hit: null as number | null };
    },
    [zoom],
  );

  const onPointerDownLayer = (e: React.PointerEvent, layer: AnyLayer) => {
    if (layer.locked) return;
    e.stopPropagation();
    const additive = e.shiftKey;
    select(layer.id, additive);
    const ids = additive ? Array.from(new Set([...selectedIds, layer.id])) : [layer.id];
    const layers = doc.layers.filter((l) => ids.includes(l.id)).map((l) => ({ id: l.id, x: l.x, y: l.y }));
    setDrag({ type: "move", startX: e.clientX, startY: e.clientY, layers });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerDownHandle = (e: React.PointerEvent, handle: string) => {
    if (!selected) return;
    e.stopPropagation();
    setDrag({
      type: "resize",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: selected.x, y: selected.y, w: selected.w, h: selected.h },
      id: selected.id,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerDownRotate = (e: React.PointerEvent) => {
    if (!selected) return;
    e.stopPropagation();
    const stage = stageRef.current!.getBoundingClientRect();
    const cx = stage.left + (selected.x + selected.w / 2) * zoom;
    const cy = stage.top + (selected.y + selected.h / 2) * zoom;
    const start = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
    setDrag({ type: "rotate", cx, cy, id: selected.id, startAngle: start, origRot: selected.rotation });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (drag.type === "move") {
        const dx = (e.clientX - drag.startX) / zoom;
        const dy = (e.clientY - drag.startY) / zoom;
        const targets = snapTargets(drag.layers[0].id);
        let snapDx = dx;
        let snapDy = dy;
        const newGuidesX: number[] = [];
        const newGuidesY: number[] = [];
        if (drag.layers.length === 1) {
          const l = doc.layers.find((x) => x.id === drag.layers[0].id)!;
          const nx = drag.layers[0].x + dx;
          const ny = drag.layers[0].y + dy;
          const xLeft = snap(nx, targets.xs);
          const xMid = snap(nx + l.w / 2, targets.xs);
          const xRight = snap(nx + l.w, targets.xs);
          if (xLeft.hit !== null) {
            snapDx = xLeft.v - drag.layers[0].x;
            newGuidesX.push(xLeft.hit);
          } else if (xMid.hit !== null) {
            snapDx = xMid.v - l.w / 2 - drag.layers[0].x;
            newGuidesX.push(xMid.hit);
          } else if (xRight.hit !== null) {
            snapDx = xRight.v - l.w - drag.layers[0].x;
            newGuidesX.push(xRight.hit);
          }
          const yTop = snap(ny, targets.ys);
          const yMid = snap(ny + l.h / 2, targets.ys);
          const yBot = snap(ny + l.h, targets.ys);
          if (yTop.hit !== null) {
            snapDy = yTop.v - drag.layers[0].y;
            newGuidesY.push(yTop.hit);
          } else if (yMid.hit !== null) {
            snapDy = yMid.v - l.h / 2 - drag.layers[0].y;
            newGuidesY.push(yMid.hit);
          } else if (yBot.hit !== null) {
            snapDy = yBot.v - l.h - drag.layers[0].y;
            newGuidesY.push(yBot.hit);
          }
        }
        setGuides({ x: newGuidesX, y: newGuidesY });
        drag.layers.forEach(({ id, x, y }) => updateLayerLive(id, { x: x + snapDx, y: y + snapDy }));
      } else if (drag.type === "resize") {
        const dx = (e.clientX - drag.startX) / zoom;
        const dy = (e.clientY - drag.startY) / zoom;
        let { x, y, w, h } = drag.orig;
        if (drag.handle.includes("e")) w = Math.max(20, drag.orig.w + dx);
        if (drag.handle.includes("s")) h = Math.max(20, drag.orig.h + dy);
        if (drag.handle.includes("w")) {
          w = Math.max(20, drag.orig.w - dx);
          x = drag.orig.x + (drag.orig.w - w);
        }
        if (drag.handle.includes("n")) {
          h = Math.max(20, drag.orig.h - dy);
          y = drag.orig.y + (drag.orig.h - h);
        }
        updateLayerLive(drag.id, { x, y, w, h });
      } else if (drag.type === "rotate") {
        const a = (Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx) * 180) / Math.PI;
        let rot = drag.origRot + (a - drag.startAngle);
        if (e.shiftKey) rot = Math.round(rot / 15) * 15;
        updateLayerLive(drag.id, { rotation: Math.round(rot) });
      }
    };
    const onUp = () => {
      setDrag(null);
      setGuides({ x: [], y: [] });
      commitLive();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, zoom, doc.layers, snapTargets, snap, updateLayerLive, commitLive]);

  // teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      const { selectedIds: sids, doc: d, removeLayer, duplicateLayer, updateLayer, reorder, undo, redo } = useEditorStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && sids[0]) {
        e.preventDefault();
        duplicateLayer(sids[0]);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "]" && sids[0]) {
        e.preventDefault();
        reorder(sids[0], e.shiftKey ? "front" : "up");
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "[" && sids[0]) {
        e.preventDefault();
        reorder(sids[0], e.shiftKey ? "back" : "down");
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sids[0]) {
        e.preventDefault();
        sids.forEach((id) => removeLayer(id));
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const layer = d.layers.find((l) => sids[0] === l.id);
      if (!layer) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        updateLayer(layer.id, { x: layer.x - step });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        updateLayer(layer.id, { x: layer.x + step });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        updateLayer(layer.id, { y: layer.y - step });
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        updateLayer(layer.id, { y: layer.y + step });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const bg: React.CSSProperties = {
    background: doc.backgroundImage
      ? `url(${doc.backgroundImage}) center/cover no-repeat, ${doc.background}`
      : doc.background,
  };

  return (
    <div
      className="flex items-center justify-center w-full h-full overflow-auto bg-muted/30"
      style={{ contain: "strict" as any }}
      onPointerDown={() => select(null)}
    >
      <div style={{ padding: 48, transform: `scale(${zoom})`, transformOrigin: "center center" }}>
        <div
          ref={stageRef}
          className="relative shadow-2xl"
          style={{ width: doc.width, height: doc.height, ...bg }}
          onPointerDown={(e) => e.stopPropagation()}
          onDragOver={(e) => {
            // Aceita drops de stickers/emojis vindos da sidebar
            if (
              e.dataTransfer.types.includes("application/x-oculto-sticker") ||
              e.dataTransfer.types.includes("text/plain")
            ) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const emoji =
              e.dataTransfer.getData("application/x-oculto-sticker") ||
              e.dataTransfer.getData("text/plain");
            if (!emoji) return;
            e.preventDefault();
            const rect = stageRef.current!.getBoundingClientRect();
            // Posição em coords do doc, descontando o zoom da viewport.
            const px = (e.clientX - rect.left) / zoom;
            const py = (e.clientY - rect.top) / zoom;
            const w = 220;
            const h = 240;
            addLayer(
              defaultTextLayer({
                text: emoji,
                fontSize: 180,
                fontWeight: 400,
                w,
                h,
                x: Math.max(0, Math.min(doc.width - w, px - w / 2)),
                y: Math.max(0, Math.min(doc.height - h, py - h / 2)),
                align: "center",
                color: "#ffffff",
              }),
            );
          }}
        >
          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, hsl(var(--foreground) / 0.08) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground) / 0.08) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
          )}
          {doc.layers.map((l) => {
            const isSelected = selectedIds.includes(l.id);
            return (
              <div
                key={l.id}
                className={cn("absolute", l.locked ? "cursor-not-allowed" : "cursor-move")}
                style={{
                  left: l.x,
                  top: l.y,
                  width: l.w,
                  height: l.h,
                  transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined,
                  transformOrigin: "center center",
                  outline: isSelected ? "2px solid hsl(var(--primary))" : undefined,
                  outlineOffset: 0,
                }}
                onPointerDown={(e) => onPointerDownLayer(e, l)}
              >
                <div className="absolute inset-0 pointer-events-none">
                  <LayerProxy layer={l} animKey={previewKey} />
                </div>
              </div>
            );
          })}

          {/* alças de seleção */}
          {selected && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: selected.x,
                top: selected.y,
                width: selected.w,
                height: selected.h,
                transform: selected.rotation ? `rotate(${selected.rotation}deg)` : undefined,
                transformOrigin: "center center",
              }}
            >
              {HANDLES.map((h) => {
                const style: React.CSSProperties = {
                  position: "absolute",
                  width: 12 / zoom,
                  height: 12 / zoom,
                  background: "hsl(var(--background))",
                  border: `${2 / zoom}px solid hsl(var(--primary))`,
                  borderRadius: 2,
                  pointerEvents: "auto",
                };
                if (h.includes("n")) style.top = -6 / zoom;
                if (h.includes("s")) style.bottom = -6 / zoom;
                if (h.includes("w")) style.left = -6 / zoom;
                if (h.includes("e")) style.right = -6 / zoom;
                if (h === "n" || h === "s") {
                  style.left = "50%";
                  style.transform = "translateX(-50%)";
                }
                if (h === "e" || h === "w") {
                  style.top = "50%";
                  style.transform = "translateY(-50%)";
                }
                const cursors: Record<string, string> = {
                  n: "ns-resize",
                  s: "ns-resize",
                  e: "ew-resize",
                  w: "ew-resize",
                  ne: "nesw-resize",
                  sw: "nesw-resize",
                  nw: "nwse-resize",
                  se: "nwse-resize",
                };
                style.cursor = cursors[h];
                return (
                  <div
                    key={h}
                    style={style}
                    onPointerDown={(e) => onPointerDownHandle(e, h)}
                  />
                );
              })}
              {/* rotação */}
              <div
                onPointerDown={onPointerDownRotate}
                style={{
                  position: "absolute",
                  top: -36 / zoom,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 16 / zoom,
                  height: 16 / zoom,
                  borderRadius: "50%",
                  background: "hsl(var(--primary))",
                  cursor: "grab",
                  pointerEvents: "auto",
                  border: `${2 / zoom}px solid hsl(var(--background))`,
                }}
              />
            </div>
          )}

          {/* guias de snap */}
          {guides.x.map((gx, i) => (
            <div
              key={`gx${i}`}
              className="absolute pointer-events-none"
              style={{
                left: gx - 0.5,
                top: 0,
                width: 1,
                height: doc.height,
                background: "hsl(var(--primary))",
              }}
            />
          ))}
          {guides.y.map((gy, i) => (
            <div
              key={`gy${i}`}
              className="absolute pointer-events-none"
              style={{
                top: gy - 0.5,
                left: 0,
                height: 1,
                width: doc.width,
                background: "hsl(var(--primary))",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Renderiza o conteúdo da layer relativo ao wrapper (sem position absolute do LayerRenderer). */
function LayerProxy({ layer, animKey }: { layer: AnyLayer; animKey?: number }) {
  const l = { ...layer, x: 0, y: 0, w: layer.w, h: layer.h, rotation: 0 } as AnyLayer;
  return <LayerRenderer layer={l} animate={!!animKey} animKey={animKey} />;
}
