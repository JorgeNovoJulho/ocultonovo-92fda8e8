/**
 * DiscoveryDebugOverlay — Painel de debug VISÍVEL APENAS para o Admin Master
 * (ocultomaster, sem impersonação). Outros usuários não veem nada.
 *
 * Registra em tempo real:
 *  - pointerdown / pointerup (cliques)
 *  - touchstart / touchend / touchmove (swipes em mobile)
 *  - scroll do container (deltas horizontais)
 *  - quando um swipe falha em mover o scroll (provável travamento)
 *
 * Renderiza um overlay fixo no canto inferior-direito sobre a seção, sem
 * interferir nas interações reais (pointer-events-none). Inclui contadores
 * e uma mini "fita" com os últimos eventos.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { useShowDebugPanels } from "@/hooks/useShowDebugPanels";

interface Props {
  /** Container rolável horizontalmente (scrollRef do carrossel). */
  scrollRef: RefObject<HTMLElement | null>;
  /** Label da seção, exibido no cabeçalho do overlay. */
  label?: string;
}

interface EventLine {
  id: number;
  ts: number;
  text: string;
  kind: 'tap' | 'swipe' | 'scroll' | 'warn' | 'info';
}

let __uid = 0;

export function DiscoveryDebugOverlay({ scrollRef, label = "Explorar misteriosos" }: Props) {
  const show = useShowDebugPanels();
  const [collapsed, setCollapsed] = useState(false);
  const [counts, setCounts] = useState({
    taps: 0,
    swipes: 0,
    swipeStuck: 0,
    scrolls: 0,
    lastDx: 0,
    lastScrollLeft: 0,
    maxScrollLeft: 0,
  });
  const [lines, setLines] = useState<EventLine[]>([]);
  const touchRef = useRef<{
    x: number; y: number; t: number;
    startScrollLeft: number;
    lastDx: number;
  } | null>(null);

  const push = (text: string, kind: EventLine['kind']) => {
    setLines((prev) => {
      const next: EventLine = { id: ++__uid, ts: Date.now(), text, kind };
      const out = [next, ...prev];
      return out.slice(0, 14);
    });
  };

  useEffect(() => {
    if (!show) return;
    const el = scrollRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      setCounts((c) => ({ ...c, taps: c.taps + 1 }));
      push(`tap ${e.pointerType} @ ${Math.round(e.clientX)},${Math.round(e.clientY)}`, 'tap');
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      touchRef.current = {
        x: t.clientX,
        y: t.clientY,
        t: performance.now(),
        startScrollLeft: el.scrollLeft,
        lastDx: 0,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!touchRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - touchRef.current.x;
      touchRef.current.lastDx = dx;
      setCounts((c) => ({ ...c, lastDx: Math.round(dx) }));
    };
    const onTouchEnd = () => {
      if (!touchRef.current) return;
      const dur = Math.round(performance.now() - touchRef.current.t);
      const moved = el.scrollLeft - touchRef.current.startScrollLeft;
      const dx = touchRef.current.lastDx;
      const intent = Math.abs(dx) > 20;
      if (intent) {
        setCounts((c) => ({ ...c, swipes: c.swipes + 1 }));
        if (Math.abs(moved) < 4) {
          setCounts((c) => ({ ...c, swipeStuck: c.swipeStuck + 1 }));
          push(`⚠ swipe travado dx=${Math.round(dx)}px sLeft Δ=${Math.round(moved)} (${dur}ms)`, 'warn');
        } else {
          push(`swipe ok dx=${Math.round(dx)}px sLeft Δ=${Math.round(moved)} (${dur}ms)`, 'swipe');
        }
      }
      touchRef.current = null;
    };

    let rafPending = false;
    const onScroll = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        setCounts((c) => ({
          ...c,
          scrolls: c.scrolls + 1,
          lastScrollLeft: Math.round(el.scrollLeft),
          maxScrollLeft: Math.max(Math.round(el.scrollWidth - el.clientWidth), 0),
        }));
      });
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });

    push('debug ativo', 'info');

    return () => {
      el.removeEventListener('pointerdown', onPointerDown as any);
      el.removeEventListener('touchstart', onTouchStart as any);
      el.removeEventListener('touchmove', onTouchMove as any);
      el.removeEventListener('touchend', onTouchEnd as any);
      el.removeEventListener('touchcancel', onTouchEnd as any);
      el.removeEventListener('scroll', onScroll as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, scrollRef.current]);

  if (!show) return null;

  return (
    <div
      className="pointer-events-auto w-full max-w-full sm:max-w-[320px] rounded-xl border border-fuchsia-400/40 bg-black/85 text-[10px] leading-tight text-fuchsia-100 backdrop-blur"
      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-fuchsia-500/20 px-2.5 py-1.5 text-left font-semibold text-fuchsia-200"
      >
        <span>🐛 debug · {label}</span>
        <span className="text-fuchsia-300">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 px-2.5 py-2">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <span>taps: <b>{counts.taps}</b></span>
            <span>scrolls: <b>{counts.scrolls}</b></span>
            <span>swipes: <b>{counts.swipes}</b></span>
            <span className={counts.swipeStuck > 0 ? 'text-red-300' : ''}>
              travados: <b>{counts.swipeStuck}</b>
            </span>
            <span>dx: <b>{counts.lastDx}px</b></span>
            <span>sLeft: <b>{counts.lastScrollLeft}</b></span>
            <span>max: <b>{counts.maxScrollLeft}</b></span>
            <span className={counts.maxScrollLeft <= 4 ? 'text-amber-200' : ''}>
              faixa: <b>{counts.maxScrollLeft > 4 ? 'rolável' : 'curta'}</b>
            </span>
          </div>
          <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-black/40 p-1.5">
            {lines.length === 0 ? (
              <div className="opacity-60">aguardando interação…</div>
            ) : (
              lines.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.kind === 'warn' ? 'text-red-300'
                    : l.kind === 'swipe' ? 'text-emerald-300'
                    : l.kind === 'tap' ? 'text-sky-300'
                    : l.kind === 'scroll' ? 'text-amber-200'
                    : 'text-fuchsia-200/80'
                  }
                >
                  · {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
