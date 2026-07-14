/**
 * Mini store global para sincronizar o status do autosave da letra
 * entre o modal de edição e o player (CoverLightbox).
 *
 * Status por itemId. Quem edita (OcultoPlayEditModal) publica os estados
 * em tempo real; quem visualiza (CoverLightbox/Player) lê via hook.
 */
import { useSyncExternalStore } from 'react';

export type LyricsAutosaveStatus =
  | 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface LyricsAutosaveState {
  status: LyricsAutosaveStatus;
  lastSavedAt: number | null;
}

const DEFAULT_STATE: LyricsAutosaveState = { status: 'idle', lastSavedAt: null };

const states = new Map<string, LyricsAutosaveState>();
const listeners = new Map<string, Set<() => void>>();

function emit(itemId: string) {
  const set = listeners.get(itemId);
  if (!set) return;
  set.forEach((l) => l());
}

export function getLyricsAutosaveState(itemId: string): LyricsAutosaveState {
  return states.get(itemId) ?? DEFAULT_STATE;
}

export function setLyricsAutosaveStatus(
  itemId: string,
  status: LyricsAutosaveStatus,
  opts?: { lastSavedAt?: number | null },
) {
  if (!itemId) return;
  const prev = states.get(itemId) ?? DEFAULT_STATE;
  const next: LyricsAutosaveState = {
    status,
    lastSavedAt:
      opts?.lastSavedAt !== undefined ? opts.lastSavedAt : prev.lastSavedAt,
  };
  if (next.status === prev.status && next.lastSavedAt === prev.lastSavedAt) return;
  states.set(itemId, next);
  emit(itemId);
}

export function resetLyricsAutosave(itemId: string) {
  if (!itemId) return;
  states.delete(itemId);
  emit(itemId);
}

export function subscribeLyricsAutosave(itemId: string, cb: () => void) {
  let set = listeners.get(itemId);
  if (!set) {
    set = new Set();
    listeners.set(itemId, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (set!.size === 0) listeners.delete(itemId);
  };
}

export function useLyricsAutosaveState(itemId: string | null | undefined): LyricsAutosaveState {
  const id = itemId ?? '';
  return useSyncExternalStore(
    (cb) => (id ? subscribeLyricsAutosave(id, cb) : () => {}),
    () => (id ? getLyricsAutosaveState(id) : DEFAULT_STATE),
    () => DEFAULT_STATE,
  );
}

export function formatLastSavedTime(ts: number | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}
