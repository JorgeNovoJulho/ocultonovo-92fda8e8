/**
 * AdEditableSurface — wrapper que injeta drag-and-drop sobre o AdTemplateRenderer.
 *
 * - Sem libs externas. Pointer events nativos (mobile + desktop).
 * - Aplica `transform` em elementos com `data-ad-slot` (title|description|cta).
 * - Overrides são salvos por breakpoint (mobile/tablet/desktop) — "travas" exigidas.
 * - Quando `editing=false`, o renderer fica idêntico ao normal.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AdTemplateRenderer, type AdRenderData } from "./AdTemplateRenderer";

export type SlotKey = "title" | "description" | "cta";
export type Device = "mobile" | "tablet" | "desktop";

export interface SlotOverride {
  dx: number; // % do container
  dy: number;
  scale: number; // 0.5–2
}
export type DeviceOverrides = Partial<Record<SlotKey, SlotOverride>>;
export type AdOverrides = Partial<Record<Device, DeviceOverrides>>;

interface Props {
  data: AdRenderData;
  device: Device;
  overrides?: AdOverrides;
  editing?: boolean;
  selectedSlot?: SlotKey | null;
  onSelect?: (slot: SlotKey) => void;
  onChange?: (slot: SlotKey, value: SlotOverride) => void;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const AdEditableSurface = memo(function AdEditableSurface({
  data,
  device,
  overrides,
  editing = false,
  selectedSlot = null,
  onSelect,
  onChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dev = overrides?.[device] ?? {};

  // Aplica transform + estilos visuais aos slots após cada render
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-ad-slot]");
    els.forEach((el) => {
      const slot = el.dataset.adSlot as SlotKey;
      const o = dev[slot];
      el.style.transformOrigin = "0 0";
      el.style.transform = o ? `translate(${o.dx}%, ${o.dy}%) scale(${o.scale})` : "";
      el.style.willChange = editing ? "transform" : "";
      el.style.transition = editing ? "none" : "transform 200ms ease";
      el.style.cursor = editing ? "move" : "";
      el.style.touchAction = editing ? "none" : "";
      el.style.userSelect = editing ? "none" : "";
      el.style.outline =
        editing && selectedSlot === slot
          ? "2px dashed #ec4899"
          : editing
            ? "1px dashed rgba(236,72,153,0.35)"
            : "";
      el.style.outlineOffset = editing ? "2px" : "";
    });
  });

  // Drag-and-drop
  const handleDownRef = useRef<((e: PointerEvent) => void) | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !editing) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-ad-slot]"));

    const onDown = (e: PointerEvent) => {
      const target = e.currentTarget as HTMLElement;
      const slot = target.dataset.adSlot as SlotKey;
      onSelect?.(slot);
      const rect = root.getBoundingClientRect();
      const start = dev[slot] ?? { dx: 0, dy: 0, scale: 1 };
      const sx = e.clientX;
      const sy = e.clientY;
      try { target.setPointerCapture(e.pointerId); } catch {}

      const onMove = (ev: PointerEvent) => {
        const dxPct = clamp(start.dx + ((ev.clientX - sx) / rect.width) * 100, -90, 90);
        const dyPct = clamp(start.dy + ((ev.clientY - sy) / rect.height) * 100, -90, 90);
        onChange?.(slot, { dx: dxPct, dy: dyPct, scale: start.scale });
      };
      const onUp = (ev: PointerEvent) => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onUp);
        try { target.releasePointerCapture(ev.pointerId); } catch {}
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onUp);
      e.preventDefault();
      e.stopPropagation();
    };

    handleDownRef.current = onDown;
    els.forEach((el) => el.addEventListener("pointerdown", onDown));
    return () => els.forEach((el) => el.removeEventListener("pointerdown", onDown));
  }, [editing, device, dev, onChange, onSelect, data]);

  return (
    <div ref={ref} className="relative w-full h-full">
      <AdTemplateRenderer mode="preview" data={data} />
    </div>
  );
});

/** Util para mesclar overrides parciais em um draft.templatePayload */
export function setOverride(
  current: AdOverrides | undefined,
  device: Device,
  slot: SlotKey,
  value: SlotOverride | null,
): AdOverrides {
  const next: AdOverrides = { ...(current ?? {}) };
  const dev: DeviceOverrides = { ...(next[device] ?? {}) };
  if (value === null) delete dev[slot];
  else dev[slot] = value;
  if (Object.keys(dev).length === 0) delete next[device];
  else next[device] = dev;
  return next;
}
