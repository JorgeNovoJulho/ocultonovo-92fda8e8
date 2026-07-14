import { AdDoc } from "./layerTypes";

const KEY = "oculto:ads:editor:draft:v1";

export interface DraftPayload {
  doc: AdDoc;
  savedAt: number;
}

export function saveDraft(doc: AdDoc) {
  try {
    const payload: DraftPayload = { doc, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota cheia ou indisponível — ignora */
  }
}

export function loadDraft(): DraftPayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    if (!parsed?.doc?.layers) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
