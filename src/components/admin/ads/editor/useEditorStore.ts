import { create } from "zustand";
import { AdDoc, AnyLayer, emptyDoc, newId } from "./layerTypes";

interface HistoryEntry {
  doc: AdDoc;
  pages: AdDoc[];
  currentPageIndex: number;
}

interface EditorState {
  doc: AdDoc;
  pages: AdDoc[]; // doc é sempre pages[currentPageIndex]
  currentPageIndex: number;
  selectedIds: string[];
  zoom: number;
  past: HistoryEntry[];
  future: HistoryEntry[];

  // doc ops
  loadDoc: (doc: AdDoc) => void;
  setBackground: (color: string) => void;
  setBackgroundImage: (url: string | null) => void;

  // layer ops
  addLayer: (layer: AnyLayer) => void;
  updateLayer: (id: string, patch: Partial<AnyLayer>) => void;
  updateLayerLive: (id: string, patch: Partial<AnyLayer>) => void;
  commitLive: () => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorder: (id: string, dir: "front" | "back" | "up" | "down") => void;
  toggleLock: (id: string) => void;
  toggleHidden: (id: string) => void;

  // pages
  addPage: () => void;
  duplicatePage: (idx: number) => void;
  removePage: (idx: number) => void;
  switchPage: (idx: number) => void;

  // palette
  applyPalette: (colors: string[]) => void;

  // alignment / distribution (atua sobre selectedIds; precisa >=1, distribute >=3)
  alignSelected: (mode: "left" | "centerX" | "right" | "top" | "centerY" | "bottom") => void;
  distributeSelected: (axis: "horizontal" | "vertical") => void;

  // clipboard (in-memory) — permite copiar/colar entre páginas
  copySelection: () => void;
  pasteClipboard: () => void;

  // selection
  select: (id: string | null, additive?: boolean) => void;
  clearSelection: () => void;

  // zoom
  setZoom: (z: number) => void;

  // history
  undo: () => void;
  redo: () => void;

  // export
  getProjectDoc: () => AdDoc;
}

const MAX_HISTORY = 60;

function snapshot(state: EditorState): HistoryEntry {
  return {
    doc: structuredClone(state.doc),
    pages: structuredClone(state.pages),
    currentPageIndex: state.currentPageIndex,
  };
}

function syncDocToPages(doc: AdDoc, pages: AdDoc[], idx: number): AdDoc[] {
  const next = pages.slice();
  next[idx] = doc;
  return next;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: emptyDoc(),
  pages: [emptyDoc()],
  currentPageIndex: 0,
  selectedIds: [],
  zoom: 0.5,
  past: [],
  future: [],

  loadDoc: (doc) => {
    // doc.pages contém páginas adicionais (sem a página 0). Página 0 = doc próprio.
    const root: AdDoc = { ...structuredClone(doc), pages: undefined };
    const extras = (doc.pages ?? []).map((p) => structuredClone(p));
    const pages = [root, ...extras];
    set({
      doc: pages[0],
      pages,
      currentPageIndex: 0,
      selectedIds: [],
      past: [],
      future: [],
    });
  },

  setBackground: (color) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const doc = { ...s.doc, background: color };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] };
    });
  },

  setBackgroundImage: (url) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const doc = { ...s.doc, backgroundImage: url };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] };
    });
  },

  addLayer: (layer) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const doc = { ...s.doc, layers: [...s.doc.layers, layer] };
      return {
        doc,
        pages: syncDocToPages(doc, s.pages, s.currentPageIndex),
        past,
        future: [],
        selectedIds: [layer.id],
      };
    });
  },

  updateLayer: (id, patch) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const doc = {
        ...s.doc,
        layers: s.doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as AnyLayer) : l)),
      };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] };
    });
  },

  updateLayerLive: (id, patch) => {
    set((s) => {
      const doc = {
        ...s.doc,
        layers: s.doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as AnyLayer) : l)),
      };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex) };
    });
  },

  commitLive: () => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set({ past, future: [] });
  },

  removeLayer: (id) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const doc = { ...s.doc, layers: s.doc.layers.filter((l) => l.id !== id) };
      return {
        doc,
        pages: syncDocToPages(doc, s.pages, s.currentPageIndex),
        selectedIds: s.selectedIds.filter((sid) => sid !== id),
        past,
        future: [],
      };
    });
  },

  duplicateLayer: (id) => {
    const layer = get().doc.layers.find((l) => l.id === id);
    if (!layer) return;
    const clone = {
      ...structuredClone(layer),
      id: newId(layer.kind[0]),
      x: layer.x + 24,
      y: layer.y + 24,
    };
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const doc = { ...s.doc, layers: [...s.doc.layers, clone] };
      return {
        doc,
        pages: syncDocToPages(doc, s.pages, s.currentPageIndex),
        selectedIds: [clone.id],
        past,
        future: [],
      };
    });
  },

  reorder: (id, dir) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const idx = s.doc.layers.findIndex((l) => l.id === id);
      if (idx < 0) return s;
      const layers = [...s.doc.layers];
      const [item] = layers.splice(idx, 1);
      if (dir === "front") layers.push(item);
      else if (dir === "back") layers.unshift(item);
      else if (dir === "up") layers.splice(Math.min(idx + 1, layers.length), 0, item);
      else layers.splice(Math.max(idx - 1, 0), 0, item);
      const doc = { ...s.doc, layers };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] };
    });
  },

  toggleLock: (id) =>
    set((s) => {
      const doc = {
        ...s.doc,
        layers: s.doc.layers.map((l) => (l.id === id ? ({ ...l, locked: !l.locked } as AnyLayer) : l)),
      };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex) };
    }),

  toggleHidden: (id) =>
    set((s) => {
      const doc = {
        ...s.doc,
        layers: s.doc.layers.map((l) => (l.id === id ? ({ ...l, hidden: !l.hidden } as AnyLayer) : l)),
      };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex) };
    }),

  addPage: () => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const blank = emptyDoc(s.doc.width, s.doc.height);
      blank.background = s.doc.background;
      const pages = [...s.pages, blank];
      return {
        pages,
        doc: pages[pages.length - 1],
        currentPageIndex: pages.length - 1,
        selectedIds: [],
        past,
        future: [],
      };
    });
  },

  duplicatePage: (idx) => {
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const clone = structuredClone(s.pages[idx]);
      // novos IDs para evitar conflitos
      clone.layers = clone.layers.map((l) => ({ ...l, id: newId(l.kind[0]) }));
      const pages = [...s.pages.slice(0, idx + 1), clone, ...s.pages.slice(idx + 1)];
      return {
        pages,
        doc: pages[idx + 1],
        currentPageIndex: idx + 1,
        selectedIds: [],
        past,
        future: [],
      };
    });
  },

  removePage: (idx) => {
    if (get().pages.length <= 1) return;
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const pages = s.pages.filter((_, i) => i !== idx);
      const newIdx = Math.max(0, Math.min(idx, pages.length - 1));
      return {
        pages,
        doc: pages[newIdx],
        currentPageIndex: newIdx,
        selectedIds: [],
        past,
        future: [],
      };
    });
  },

  switchPage: (idx) => {
    const { pages } = get();
    if (idx < 0 || idx >= pages.length) return;
    set({
      doc: pages[idx],
      currentPageIndex: idx,
      selectedIds: [],
    });
  },

  applyPalette: (colors) => {
    if (!colors.length) return;
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    set((s) => {
      const [bg, ...accents] = colors;
      const acc = accents.length ? accents : [colors[0]];
      let txtIdx = 0;
      let shapeIdx = 0;
      const layers = s.doc.layers.map((l) => {
        if (l.kind === "text") {
          const c = acc[txtIdx % acc.length];
          txtIdx++;
          return { ...l, color: c };
        }
        if (l.kind === "shape") {
          const c = acc[shapeIdx % acc.length];
          shapeIdx++;
          return { ...l, fill: c };
        }
        return l;
      });
      const doc = { ...s.doc, background: bg, layers };
      return { doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] };
    });
  },

  select: (id, additive) => {
    if (id === null) return set({ selectedIds: [] });
    set((s) => {
      if (additive) {
        return s.selectedIds.includes(id)
          ? { selectedIds: s.selectedIds.filter((x) => x !== id) }
          : { selectedIds: [...s.selectedIds, id] };
      }
      return { selectedIds: [id] };
    });
  },

  clearSelection: () => set({ selectedIds: [] }),

  setZoom: (z) => set({ zoom: Math.min(3, Math.max(0.1, z)) }),

  undo: () => {
    const { past } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set((s) => ({
      doc: prev.doc,
      pages: prev.pages,
      currentPageIndex: prev.currentPageIndex,
      past: past.slice(0, -1),
      future: [...s.future, snapshot(s)],
    }));
  },

  redo: () => {
    const { future } = get();
    if (!future.length) return;
    const next = future[future.length - 1];
    set((s) => ({
      doc: next.doc,
      pages: next.pages,
      currentPageIndex: next.currentPageIndex,
      future: future.slice(0, -1),
      past: [...s.past, snapshot(s)],
    }));
  },

  getProjectDoc: () => {
    const { pages } = get();
    const [first, ...rest] = pages;
    return { ...first, pages: rest.length ? rest.map((p) => ({ ...p, pages: undefined })) : undefined };
  },

  alignSelected: (mode) => {
    const s = get();
    const sel = s.doc.layers.filter((l) => s.selectedIds.includes(l.id) && !l.locked);
    if (!sel.length) return;
    const past = [...s.past, snapshot(s)].slice(-MAX_HISTORY);

    // Referência: bounding box conjunto (>=2) ou canvas (1 item)
    let refL = 0, refT = 0, refR = s.doc.width, refB = s.doc.height;
    if (sel.length >= 2) {
      refL = Math.min(...sel.map((l) => l.x));
      refT = Math.min(...sel.map((l) => l.y));
      refR = Math.max(...sel.map((l) => l.x + l.w));
      refB = Math.max(...sel.map((l) => l.y + l.h));
    }
    const refCX = (refL + refR) / 2;
    const refCY = (refT + refB) / 2;

    const layers = s.doc.layers.map((l) => {
      if (!s.selectedIds.includes(l.id) || l.locked) return l;
      switch (mode) {
        case "left": return { ...l, x: refL };
        case "right": return { ...l, x: refR - l.w };
        case "centerX": return { ...l, x: Math.round(refCX - l.w / 2) };
        case "top": return { ...l, y: refT };
        case "bottom": return { ...l, y: refB - l.h };
        case "centerY": return { ...l, y: Math.round(refCY - l.h / 2) };
      }
      return l;
    });
    const doc = { ...s.doc, layers };
    set({ doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] });
  },

  distributeSelected: (axis) => {
    const s = get();
    const sel = s.doc.layers.filter((l) => s.selectedIds.includes(l.id) && !l.locked);
    if (sel.length < 3) return;
    const past = [...s.past, snapshot(s)].slice(-MAX_HISTORY);

    const sorted = [...sel].sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const span =
      axis === "horizontal"
        ? last.x + last.w - first.x - sorted.reduce((acc, l) => acc + l.w, 0)
        : last.y + last.h - first.y - sorted.reduce((acc, l) => acc + l.h, 0);
    const gap = span / (sorted.length - 1);
    const positions = new Map<string, number>();
    let cursor = axis === "horizontal" ? first.x : first.y;
    sorted.forEach((l, i) => {
      positions.set(l.id, Math.round(cursor));
      cursor += (axis === "horizontal" ? l.w : l.h) + gap;
    });
    const layers = s.doc.layers.map((l) => {
      if (!positions.has(l.id)) return l;
      const v = positions.get(l.id)!;
      return axis === "horizontal" ? { ...l, x: v } : { ...l, y: v };
    });
    const doc = { ...s.doc, layers };
    set({ doc, pages: syncDocToPages(doc, s.pages, s.currentPageIndex), past, future: [] });
  },

  copySelection: () => {
    const s = get();
    const sel = s.doc.layers.filter((l) => s.selectedIds.includes(l.id));
    if (!sel.length) return;
    clipboard = sel.map((l) => structuredClone(l));
  },

  pasteClipboard: () => {
    if (!clipboard?.length) return;
    const past = [...get().past, snapshot(get())].slice(-MAX_HISTORY);
    const newLayers = clipboard.map((l) => ({
      ...structuredClone(l),
      id: newId(l.kind[0]),
      x: l.x + 24,
      y: l.y + 24,
    }));
    set((s) => {
      const doc = { ...s.doc, layers: [...s.doc.layers, ...newLayers] };
      return {
        doc,
        pages: syncDocToPages(doc, s.pages, s.currentPageIndex),
        selectedIds: newLayers.map((l) => l.id),
        past,
        future: [],
      };
    });
  },
}));

// Clipboard em memória — persistente entre páginas dentro da mesma sessão do editor
let clipboard: AnyLayer[] = [];

export function getCurrentDoc(): AdDoc {
  return useEditorStore.getState().getProjectDoc();
}
