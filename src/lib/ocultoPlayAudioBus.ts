/**
 * ocultoPlayAudioBus — singleton leve para pausar áudios do Play
 * que estejam tocando quando outro inicia. Sem libs externas, sem store.
 *
 * Uso: `register(itemId, pauseFn)` no mount; `play(itemId)` ao tocar;
 * `unregister(itemId)` no unmount. Não autoplay.
 */
type PauseFn = () => void;

const registry = new Map<string, PauseFn>();
let current: string | null = null;
const listeners = new Set<(currentId: string | null) => void>();

export function registerAudio(itemId: string, pause: PauseFn) {
  registry.set(itemId, pause);
  return () => {
    registry.delete(itemId);
    if (current === itemId) {
      current = null;
      listeners.forEach((l) => l(null));
    }
  };
}

export function notifyAudioPlaying(itemId: string) {
  // pausa todos os outros
  registry.forEach((pause, id) => {
    if (id !== itemId) {
      try { pause(); } catch { /* noop */ }
    }
  });
  current = itemId;
  listeners.forEach((l) => l(itemId));
}

export function notifyAudioPaused(itemId: string) {
  if (current === itemId) {
    current = null;
    listeners.forEach((l) => l(null));
  }
}

export function pauseAllAudios() {
  registry.forEach((pause) => { try { pause(); } catch { /* noop */ } });
  current = null;
  listeners.forEach((l) => l(null));
}

export function subscribeCurrentAudio(cb: (id: string | null) => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
