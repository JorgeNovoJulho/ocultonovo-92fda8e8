/**
 * Fallback para navegação a um post-alvo vindo de notificações.
 * O state do react-router pode ser perdido (cross-route, refresh, popover
 * fechando). Persistimos por alguns segundos no sessionStorage para que o
 * RealFeed consuma na próxima montagem/efeito.
 */
const KEY = 'oculto:feed:scrollToPost';

export interface ScrollToPostHint {
  postId: string;
  focus?: 'comments' | 'saved' | 'likes' | 'shares';
  setAt: number;
}

export function rememberScrollToPost(postId: string, focus?: ScrollToPostHint['focus']) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ postId, focus, setAt: Date.now() } as ScrollToPostHint));
  } catch {}
}

export function consumeScrollToPost(): ScrollToPostHint | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as ScrollToPostHint;
    // Expira em 15s para evitar comportamento "fantasma".
    if (!parsed?.postId || Date.now() - (parsed.setAt || 0) > 15_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function peekScrollToPost(): ScrollToPostHint | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScrollToPostHint;
    if (!parsed?.postId || Date.now() - (parsed.setAt || 0) > 15_000) return null;
    return parsed;
  } catch {
    return null;
  }
}
