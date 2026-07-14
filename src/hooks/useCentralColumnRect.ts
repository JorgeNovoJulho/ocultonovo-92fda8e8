import { useEffect, useState } from "react";

/**
 * Retorna o bounding rect (left/width) da coluna central do app
 * (`.feed-coluna-central` no DashboardLayout). Usado por modais que devem
 * ficar contidos dentro da coluna, sem invadir o chat à direita ou a
 * sidebar à esquerda no desktop.
 *
 * • Vertical: sempre 0 → 100dvh (modal SEMPRE visível, sem precisar rolar)
 * • Horizontal: alinhado com a coluna central. Se não houver coluna
 *   (mobile ou rota fora do layout), usa viewport inteira.
 *
 * Recalcula em resize, scroll e quando o usuário troca de breakpoint.
 */
export function useCentralColumnRect(open: boolean) {
  const [rect, setRect] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const measure = () => {
      const el = document.querySelector(".feed-coluna-central") as HTMLElement | null;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      // Em telas pequenas (< sm), a coluna ocupa tudo — devolve null para fullscreen
      if (window.innerWidth < 640 || r.width <= 0) { setRect(null); return; }
      const prevSibling = el.previousElementSibling as HTMLElement | null;
      const nextSibling = el.nextElementSibling as HTMLElement | null;
      const prevRect = prevSibling?.getBoundingClientRect();
      const nextRect = nextSibling?.getBoundingClientRect();
      const safeLeft = prevRect && prevRect.width > 0 ? Math.max(r.left, prevRect.right) : r.left;
      const safeRight = nextRect && nextRect.width > 0 ? Math.min(r.right, nextRect.left) : r.right;
      const safeWidth = Math.max(0, safeRight - safeLeft);
      if (safeWidth <= 0) { setRect(null); return; }
      setRect((prev) => {
        if (prev && Math.abs(prev.left - safeLeft) < 0.5 && Math.abs(prev.width - safeWidth) < 0.5) return prev;
        return { left: safeLeft, width: safeWidth };
      });
    };

    // Mede imediatamente e novamente após o body lock/scrollbar reflow
    measure();
    const raf1 = requestAnimationFrame(measure);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(measure));
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 200);

    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("scroll", measure, { passive: true });
    const ro = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
    if (ro) {
      const el = document.querySelector(".feed-coluna-central");
      if (el) ro.observe(el);
      ro.observe(document.body);
      ro.observe(document.documentElement);
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [open]);

  return rect;
}
