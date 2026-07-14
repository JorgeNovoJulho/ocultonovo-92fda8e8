/**
 * VideoPrefetcher — injeta <link rel="preload" as="video"> para os próximos
 * vídeos do feed. Faz com que, ao trocar de item no modo destaque (TikTok),
 * o navegador já tenha iniciado o download/CDN-warm do próximo.
 *
 * Estratégia leve: só preloads de até N URLs, throttled, idempotente.
 * Em mobile, NÃO pré-carrega vídeo: fetch no-cors ignora Range em vários
 * browsers e pode baixar o arquivo inteiro, competindo com o player ativo.
 */
import { useEffect } from 'react';

interface Props {
  urls: (string | null | undefined)[];
  max?: number;
}

function isLowDataConnection(): boolean {
  try {
    const nav = navigator as any;
    const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
    if (!conn) return false;
    if (conn.saveData) return true;
    const t = String(conn.effectiveType || '').toLowerCase();
    return t === '2g' || t === 'slow-2g';
  } catch { return false; }
}

function isMobileRuntime(): boolean {
  try {
    if ((navigator as any).maxTouchPoints > 1) return true;
    if (window.matchMedia?.('(pointer: coarse)').matches) return true;
    return window.innerWidth <= 768;
  } catch { return false; }
}

export function VideoPrefetcher({ urls, max = 2 }: Props) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Gargalo principal em celulares: prefetch de vídeo concorrendo com o
    // stream em reprodução. O poster já cobre a transição; vídeo só carrega
    // quando vira ativo/metadata no player.
    if (isMobileRuntime()) return;
    if (isLowDataConnection()) return;

    const targets = (urls || [])
      .filter((u): u is string => !!u && /^https?:\/\//i.test(u))
      .slice(0, max);

    if (!targets.length) return;

    const created: HTMLLinkElement[] = [];
    const idleHandle = (window as any).requestIdleCallback?.((cb: any) => {
      doPreload();
    }, { timeout: 800 }) ?? window.setTimeout(doPreload, 200);

    function doPreload() {
      for (const href of targets) {
        // Evita duplicar se já existir um preload p/ a mesma URL
        const exists = document.head.querySelector(
          `link[rel="preload"][as="video"][href="${CSS.escape(href)}"]`,
        );
        if (exists) continue;
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'video';
        link.href = href;
        // Hint: arquivo é mp4/webm — não fixamos type para deixar o servidor decidir.
        (link as any).fetchPriority = 'low';
        document.head.appendChild(link);
        created.push(link);
      }
    }

    return () => {
      try { (window as any).cancelIdleCallback?.(idleHandle); } catch { /* noop */ }
      try { window.clearTimeout(idleHandle as any); } catch { /* noop */ }
      for (const link of created) {
        try { link.remove(); } catch { /* noop */ }
      }
    };
  }, [urls.join('|'), max]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
