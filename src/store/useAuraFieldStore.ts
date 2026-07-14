import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BubbleOverride { x: number; y: number }

interface AuraFieldState {
  zoom: number;
  panX: number;
  panY: number;
  bubbleOverrides: Record<string, BubbleOverride>;
  setZoom: (value: number) => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;
  resetPan: () => void;
  resetView: () => void;
  setBubbleOverride: (id: string, x: number, y: number) => void;
  clearBubbleOverride: (id: string) => void;
  resetBubbleOverrides: () => void;
}

const DEFAULT_ZOOM = 0.82;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.7;
const MAX_PAN = 600;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(value) ? value : DEFAULT_ZOOM));
const clampPan = (value: number) => Math.min(MAX_PAN, Math.max(-MAX_PAN, Number.isFinite(value) ? value : 0));
const clampPct = (v: number) => Math.min(98, Math.max(2, Number.isFinite(v) ? v : 50));

export const useAuraFieldStore = create<AuraFieldState>()(
  persist(
    (set) => ({
      zoom: DEFAULT_ZOOM,
      panX: 0,
      panY: 0,
      bubbleOverrides: {},
      setZoom: (value) => set({ zoom: clampZoom(value) }),
      resetZoom: () => set({ zoom: DEFAULT_ZOOM }),
      setPan: (x, y) => set({ panX: clampPan(x), panY: clampPan(y) }),
      resetPan: () => set({ panX: 0, panY: 0 }),
      resetView: () => set({ zoom: DEFAULT_ZOOM, panX: 0, panY: 0 }),
      setBubbleOverride: (id, x, y) => set((s) => ({
        bubbleOverrides: { ...s.bubbleOverrides, [id]: { x: clampPct(x), y: clampPct(y) } },
      })),
      clearBubbleOverride: (id) => set((s) => {
        const next = { ...s.bubbleOverrides };
        delete next[id];
        return { bubbleOverrides: next };
      }),
      resetBubbleOverrides: () => set({ bubbleOverrides: {} }),
    }),
    {
      name: 'aura-field-view',
      partialize: (state) => ({
        zoom: state.zoom, panX: state.panX, panY: state.panY,
        bubbleOverrides: state.bubbleOverrides,
      }),
      version: 2,
    }
  )
);

export { DEFAULT_ZOOM as AURA_FIELD_DEFAULT_ZOOM, MAX_ZOOM as AURA_FIELD_MAX_ZOOM, MIN_ZOOM as AURA_FIELD_MIN_ZOOM };
