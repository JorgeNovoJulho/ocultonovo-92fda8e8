/**
 * LazyVisible — só monta `children` quando o elemento entra na viewport
 * (ou está a uma distância configurável). Mantém um placeholder com a
 * altura mínima para evitar layout shift e libera memória/CPU dos cards
 * fora da tela. Uma vez visível, mantém montado (não desmonta ao sair)
 * para preservar estado do player e evitar flicker.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  rootMargin?: string;
  minHeight?: number;
  className?: string;
  /** Se true, desmonta quando sai (default: false — mantém montado). */
  unmountOnHide?: boolean;
}

export function LazyVisible({
  children,
  rootMargin = '600px 0px',
  minHeight = 480,
  className,
  unmountOnHide = false,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            if (!unmountOnHide) io.disconnect();
          } else if (unmountOnHide) {
            setVisible(false);
          }
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, unmountOnHide]);

  return (
    <div ref={ref} className={className} style={{ minHeight }}>
      {visible ? children : null}
    </div>
  );
}
