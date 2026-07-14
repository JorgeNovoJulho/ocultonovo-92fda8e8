import { useEffect, useState } from 'react';

/**
 * Atrasa a montagem de um componente até depois do primeiro paint do navegador.
 * Usa `requestIdleCallback` quando disponível (Chrome/Android) e cai para
 * `setTimeout` em iOS/Safari. Essencial para liberar a thread principal em
 * dispositivos low-end (ex.: Realme C55) onde widgets secundários competem
 * com o feed principal pelo CPU/GPU/RAM.
 *
 * @param delay  Tempo mínimo antes de tentar montar (default 0 = next idle).
 */
export function useDeferredMount(delay = 0): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ric: any =
      (typeof window !== 'undefined' && (window as any).requestIdleCallback) ||
      ((cb: any) => setTimeout(cb, 200));
    const cic: any =
      (typeof window !== 'undefined' && (window as any).cancelIdleCallback) ||
      clearTimeout;

    const start = () => {
      const handle = ric(
        () => {
          if (!cancelled) setMounted(true);
        },
        { timeout: 1500 }
      );
      return handle;
    };

    let h: any;
    let t: any;
    if (delay > 0) {
      t = setTimeout(() => {
        if (!cancelled) h = start();
      }, delay);
    } else {
      h = start();
    }
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
      if (h) cic(h);
    };
  }, [delay]);

  return mounted;
}
