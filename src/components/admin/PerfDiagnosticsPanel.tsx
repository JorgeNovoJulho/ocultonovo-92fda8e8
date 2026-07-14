/**
 * PerfDiagnosticsPanel — Painel flutuante de diagnóstico de performance.
 * Visível APENAS para o master admin (@ocultomaster). Mede:
 *   • FCP / LCP (PerformanceObserver)
 *   • Tempo por rota (navegação SPA)
 *   • Quantidade de chunks carregados (resource timing tipo "script")
 *   • Heap JS (quando disponível)
 *
 * Botão flutuante no canto inferior direito; clique para expandir.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { Activity, X, Eraser, ChevronDown, ChevronUp } from 'lucide-react';
import { useDraggableFab } from '@/hooks/useDraggableFab';

interface RouteTime {
  path: string;
  ms: number;
  at: number;
}

function fmt(n: number | null) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`;
}

export function PerfDiagnosticsPanel() {
  const { data: isMaster = false } = useIsMasterAdmin();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fcp, setFcp] = useState<number | null>(null);
  const [lcp, setLcp] = useState<number | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [chunkBytes, setChunkBytes] = useState(0);
  const [routeTimes, setRouteTimes] = useState<RouteTime[]>([]);
  const [heap, setHeap] = useState<{ used: number; total: number } | null>(null);
  const lastPathRef = useRef<string>(location.pathname);
  const lastPathStartRef = useRef<number>(performance.now());

  // FCP / LCP observers
  useEffect(() => {
    if (!isMaster) return;
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.entryType === 'paint' && (e as any).name === 'first-contentful-paint') {
            setFcp(e.startTime);
          }
          if (e.entryType === 'largest-contentful-paint') {
            setLcp((e as any).renderTime || (e as any).loadTime || e.startTime);
          }
        }
      });
      po.observe({ type: 'paint', buffered: true } as any);
      po.observe({ type: 'largest-contentful-paint', buffered: true } as any);
      return () => po.disconnect();
    } catch {}
  }, [isMaster]);

  // Chunks (resource timing — scripts JS)
  useEffect(() => {
    if (!isMaster) return;
    const measure = () => {
      try {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const scripts = entries.filter(
          (e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name),
        );
        setChunkCount(scripts.length);
        setChunkBytes(scripts.reduce((sum, s) => sum + (s.transferSize || s.encodedBodySize || 0), 0));
      } catch {}
    };
    measure();
    const t = setInterval(measure, 2000);
    return () => clearInterval(t);
  }, [isMaster]);

  // Heap JS (Chromium)
  useEffect(() => {
    if (!isMaster) return;
    const update = () => {
      const m = (performance as any).memory;
      if (m) setHeap({ used: m.usedJSHeapSize, total: m.totalJSHeapSize });
    };
    update();
    const t = setInterval(update, 2000);
    return () => clearInterval(t);
  }, [isMaster]);

  // Tempo por rota (entre mudanças de pathname)
  useEffect(() => {
    if (!isMaster) return;
    const now = performance.now();
    const elapsed = now - lastPathStartRef.current;
    if (lastPathRef.current && elapsed > 30) {
      setRouteTimes((prev) => {
        const next = [
          { path: lastPathRef.current, ms: elapsed, at: Date.now() },
          ...prev,
        ].slice(0, 12);
        return next;
      });
    }
    lastPathRef.current = location.pathname;
    lastPathStartRef.current = now;
  }, [location.pathname, isMaster]);

  const heapStr = useMemo(() => {
    if (!heap) return '—';
    return `${(heap.used / 1024 / 1024).toFixed(1)} / ${(heap.total / 1024 / 1024).toFixed(1)} MB`;
  }, [heap]);

  const drag = useDraggableFab('perf-diag-fab-pos');

  if (!isMaster) return null;

  if (!open) {
    return (
      <button
        ref={drag.ref}
        style={drag.style}
        {...drag.dragHandlers}
        onClick={() => setOpen(true)}
        title="Diagnóstico de performance (master) — arraste para mover"
        className="fixed bottom-3 right-3 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-black shadow-lg ring-2 ring-amber-300/60 hover:scale-105 transition cursor-grab active:cursor-grabbing"
      >
        <Activity className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div
      ref={drag.ref}
      style={drag.style}
      className="fixed bottom-3 right-3 z-[9999] w-[320px] max-w-[92vw] rounded-xl border border-amber-400/40 bg-black/85 backdrop-blur-md text-white shadow-2xl"
    >
      <div
        {...drag.dragHandlers}
        className="flex items-center justify-between border-b border-amber-400/30 px-3 py-2 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Activity className="h-4 w-4" />
          Diagnóstico — master
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="rounded p-1 text-amber-300 hover:bg-amber-400/10"
            title={collapsed ? 'Expandir' : 'Reduzir'}
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setRouteTimes([])}
            className="rounded p-1 text-amber-300 hover:bg-amber-400/10"
            title="Limpar histórico de rotas"
          >
            <Eraser className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-amber-300 hover:bg-amber-400/10"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="FCP" value={fmt(fcp)} />
            <Metric label="LCP" value={fmt(lcp)} />
            <Metric label="Chunks JS" value={String(chunkCount)} />
            <Metric label="Bytes JS" value={`${(chunkBytes / 1024).toFixed(0)} KB`} />
            <Metric label="Heap" value={heapStr} className="col-span-2" />
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-amber-300/80 mb-1">
              Tempo por rota (recente)
            </div>
            {routeTimes.length === 0 ? (
              <div className="text-[10px] text-white/50 italic">
                Navegue entre páginas para coletar tempos.
              </div>
            ) : (
              <ul className="space-y-0.5 max-h-40 overflow-auto pr-1">
                {routeTimes.map((r, i) => (
                  <li
                    key={`${r.at}-${i}`}
                    className="flex justify-between gap-2 border-b border-white/5 py-0.5"
                  >
                    <span className="truncate text-white/80">{r.path}</span>
                    <span
                      className={
                        r.ms > 1500
                          ? 'text-red-400 font-mono'
                          : r.ms > 600
                          ? 'text-amber-300 font-mono'
                          : 'text-emerald-300 font-mono'
                      }
                    >
                      {fmt(r.ms)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-[10px] text-white/40">
            Rota atual: <span className="text-white/70">{location.pathname}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-md border border-white/10 bg-white/5 px-2 py-1.5 ${className}`}>
      <div className="text-[9px] uppercase tracking-wider text-white/50">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  );
}

export default PerfDiagnosticsPanel;
