const MINI_PLAYER_KEY = 'oculto-play:show-mini-player';
const EVENT = 'oculto-play:mini-player-changed';

function emit() {
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* noop */ }
}

export function enableOcultoPlayMiniPlayer() {
  try { sessionStorage.setItem(MINI_PLAYER_KEY, '1'); } catch { /* noop */ }
  emit();
}

export function disableOcultoPlayMiniPlayer() {
  try { sessionStorage.removeItem(MINI_PLAYER_KEY); } catch { /* noop */ }
  emit();
}

export function isOcultoPlayMiniPlayerEnabled(): boolean {
  try { return sessionStorage.getItem(MINI_PLAYER_KEY) === '1'; } catch { return false; }
}

export function subscribeOcultoPlayMiniPlayer(cb: (enabled: boolean) => void): () => void {
  const handler = () => cb(isOcultoPlayMiniPlayerEnabled());
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
