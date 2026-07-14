import { useEffect, type RefObject } from "react";

type Options = {
  /** Mantém o arraste por mouse/trackpad em desktop. Touch fica nativo. */
  enabled?: boolean;
  /** Aplica inércia curta depois de soltar o mouse. */
  momentum?: boolean;
};

/**
 * Habilita arraste horizontal por mouse sem bloquear o swipe nativo mobile.
 *
 * Importante: eventos de `touch`/`pen` são ignorados de propósito; em celular
 * o navegador faz o scroll horizontal com mais fluidez quando nenhum JS chama
 * preventDefault durante o gesto.
 */
export function useHorizontalDragScroll<T extends HTMLElement = HTMLElement>(
  scrollRef: RefObject<T | null>,
  { enabled = true, momentum = true }: Options = {},
) {
  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let lock: "h" | "v" | null = null;
    let moved = false;
    let suppressNextClick = false;
    let raf = 0;

    const cancelMomentum = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const runMomentum = () => {
      if (!momentum) return;
      const step = () => {
        if (Math.abs(velocity) < 0.02) {
          raf = 0;
          return;
        }
        el.scrollLeft += velocity * 16;
        velocity *= 0.94;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      cancelMomentum();
      pointerId = event.pointerId;
      startX = lastX = event.clientX;
      startY = event.clientY;
      startScroll = el.scrollLeft;
      lastT = performance.now();
      velocity = 0;
      lock = null;
      moved = false;
      el.dataset.draggingScroll = "true";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;

      if (lock == null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          lock = "v";
          pointerId = null;
          delete el.dataset.draggingScroll;
          return;
        }
        lock = "h";
        try { el.setPointerCapture(event.pointerId); } catch { /* noop */ }
      }
      if (lock !== "h") return;

      event.preventDefault();
      moved = true;
      suppressNextClick = true;
      el.scrollLeft = startScroll - dx;

      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      velocity = -((event.clientX - lastX) / dt);
      lastX = event.clientX;
      lastT = now;
    };

    const finish = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      try { el.releasePointerCapture(event.pointerId); } catch { /* noop */ }
      pointerId = null;
      delete el.dataset.draggingScroll;
      if (lock === "h" && moved && Math.abs(velocity) > 0.05) runMomentum();
      lock = null;
      moved = false;
      window.setTimeout(() => { suppressNextClick = false; }, 80);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressNextClick) return;
      suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", finish, { passive: true });
    el.addEventListener("pointercancel", finish, { passive: true });
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("wheel", cancelMomentum, { passive: true });

    return () => {
      cancelMomentum();
      delete el.dataset.draggingScroll;
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", finish);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("wheel", cancelMomentum);
    };
  }, [enabled, momentum, scrollRef]);
}

export default useHorizontalDragScroll;