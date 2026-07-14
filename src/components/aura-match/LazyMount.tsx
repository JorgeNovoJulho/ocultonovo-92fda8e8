import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Margem antes de entrar na viewport para começar a renderizar */
  rootMargin?: string;
  /** Altura mínima do placeholder enquanto não monta */
  minHeight?: number;
  /** Conteúdo a renderizar quando visível */
  children: ReactNode;
  /** Forçar renderização imediata após N ms mesmo sem scroll (fallback iOS) */
  fallbackMs?: number;
  /** Classe extra para o wrapper */
  className?: string;
}

/**
 * Renderiza filhos apenas quando o wrapper se aproxima da viewport.
 * Usa IntersectionObserver + requestIdleCallback. Sem realtime, sem libs.
 */
export function LazyMount({
  rootMargin = '320px 0px',
  minHeight = 96,
  children,
  fallbackMs = 4000,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    let timeoutId: number | undefined;

    const reveal = () => {
      const idle = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: any) => number)
        | undefined;
      if (idle) idle(() => setVisible(true), { timeout: 200 });
      else setVisible(true);
    };

    if (typeof IntersectionObserver === 'undefined') {
      reveal();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal();
            io.disconnect();
            if (timeoutId) window.clearTimeout(timeoutId);
            break;
          }
        }
      },
      { rootMargin },
    );
    io.observe(node);
    timeoutId = window.setTimeout(() => {
      reveal();
      io.disconnect();
    }, fallbackMs);
    return () => {
      io.disconnect();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [visible, rootMargin, fallbackMs]);

  return (
    <div ref={ref} className={className} style={!visible ? { minHeight } : undefined}>
      {visible ? (
        <Suspense fallback={<div style={{ minHeight }} />}>{children}</Suspense>
      ) : null}
    </div>
  );
}
