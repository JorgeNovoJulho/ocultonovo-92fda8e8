/**
 * PdfMessage — miniatura real (1ª página) no chat + modal premium
 * com sidebar de ações colorida, thumbnails grid lazy+virtualizadas,
 * cache LRU, fila de render com concorrência limitada, cancelamento
 * automático ao sair do viewport, preload de páginas vizinhas,
 * blob-URL para imprimir / abrir em nova aba e tooltips em todos os
 * botões de ação. Scroll invisível.
 */
import { memo, useEffect, useRef, useState, useCallback } from 'react';
import {
  FileText, X, ZoomIn, ZoomOut, Download, Printer, Loader2, AlertCircle,
  ChevronLeft, ChevronRight, LayoutGrid, ExternalLink, RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PdfMessageProps {
  mediaUrl: string;
  fileName?: string;
  isMine: boolean;
}

// ─── LRU cache de miniaturas (dataURL) — limita memória em PDFs grandes ─────
const THUMB_LRU_MAX = 60; // ~60 miniaturas 120px em memória
const thumbLRU = new Map<string, string>();
const lruGet = (k: string): string | undefined => {
  const v = thumbLRU.get(k);
  if (v !== undefined) { thumbLRU.delete(k); thumbLRU.set(k, v); }
  return v;
};
const lruSet = (k: string, v: string) => {
  if (thumbLRU.has(k)) thumbLRU.delete(k);
  thumbLRU.set(k, v);
  while (thumbLRU.size > THUMB_LRU_MAX) {
    const first = thumbLRU.keys().next().value as string | undefined;
    if (!first) break;
    thumbLRU.delete(first);
  }
};

// ─── Fila global com concorrência máxima 2 (mantém UI responsiva) ──────────
const THUMB_MAX_CONCURRENT = 2;
let activeRenders = 0;
const renderQueue: Array<() => void> = [];
const pumpQueue = () => {
  while (activeRenders < THUMB_MAX_CONCURRENT && renderQueue.length > 0) {
    const next = renderQueue.shift()!;
    activeRenders++;
    next();
  }
};
const releaseSlot = () => { activeRenders = Math.max(0, activeRenders - 1); pumpQueue(); };
const scheduleRender = (run: () => Promise<void>): { cancel: () => void } => {
  let cancelled = false;
  const job = async () => {
    if (cancelled) { releaseSlot(); return; }
    try { await run(); } finally { releaseSlot(); }
  };
  if (activeRenders < THUMB_MAX_CONCURRENT) {
    activeRenders++;
    void job();
  } else {
    renderQueue.push(() => { void job(); });
  }
  return {
    cancel: () => {
      cancelled = true;
      const idx = renderQueue.indexOf(job as any);
      if (idx >= 0) renderQueue.splice(idx, 1);
    },
  };
};

// ─── Render da 1ª página (para miniatura do chat) ───────────────────────────
const renderThumb = async (url: string, width = 240): Promise<string> => {
  const key = `${url}::w${width}`;
  const cached = lruGet(key);
  if (cached) return cached;
  const loadingTask = pdfjsLib.getDocument({ url, disableAutoFetch: true, disableStream: true });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const baseVp = page.getViewport({ scale: 1 });
  const scale = width / baseVp.width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
  lruSet(key, dataUrl);
  try { pdf.destroy(); } catch {}
  return dataUrl;
};

// ─── Page thumbnail (lazy + queued + cancela ao sair do viewport) ──────────
const PageThumb = memo(function PageThumb({
  pdf, pdfUrl, pageNumber, active, onClick, preload,
}: {
  pdf: any;
  pdfUrl: string;
  pageNumber: number;
  active: boolean;
  onClick: () => void;
  /** se true, força render mesmo sem visibilidade (preload de vizinhos) */
  preload?: boolean;
}) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const cacheKey = `${pdfUrl}::p${pageNumber}`;

  // IntersectionObserver: marca visível ao entrar, e DESMARCA ao sair
  // (cancela renders pendentes e libera memória de canvas).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setVisible(true);
          else setVisible(false);
        }
      },
      { root: el.closest('aside'), rootMargin: '300px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Render do canvas: só roda se visible ou preload; usa fila + cancela ao sair
  useEffect(() => {
    if (ready) return;
    if (!visible && !preload) return;
    if (!pdf || !canvasRef.current) return;

    // Cache hit? pinta direto sem renderizar
    const cached = lruGet(cacheKey);
    if (cached) {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        setReady(true);
      };
      img.src = cached;
      return;
    }

    let renderTask: any = null;
    const slot = scheduleRender(async () => {
      // Reverifica visibilidade no momento em que o slot fica livre
      if (!visible && !preload) return;
      try {
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = 120 / base.width;
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        renderTask = page.render({ canvasContext: ctx, viewport: vp, canvas } as any);
        await renderTask.promise;
        // Cacheia versão jpeg pequena para reuso (sem segurar canvas em memória)
        try { lruSet(cacheKey, canvas.toDataURL('image/jpeg', 0.6)); } catch {}
        setReady(true);
      } catch { /* ignore */ }
    });

    return () => {
      slot.cancel();
      try { renderTask?.cancel?.(); } catch {}
    };
  }, [visible, preload, pdf, pageNumber, ready, cacheKey]);

  // Quando sai do viewport e ainda não renderizou, libera o canvas
  useEffect(() => {
    if (!visible && !preload && !ready && canvasRef.current) {
      const c = canvasRef.current;
      c.width = 0; c.height = 0;
    }
  }, [visible, preload, ready]);

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onClick}
      title={`Ir para página ${pageNumber}`}
      className={cn(
        'group relative flex flex-col items-center gap-1 p-1 rounded-lg transition-all',
        active ? 'bg-fuchsia-500/20 ring-2 ring-fuchsia-500' : 'hover:bg-white/5 ring-1 ring-white/10'
      )}
      aria-label={`Ir para página ${pageNumber}`}
    >
      <div className="relative w-[88px] h-[120px] bg-white rounded overflow-hidden flex items-center justify-center">
        {(visible || preload || ready) && (
          <canvas ref={canvasRef} className="block max-w-full max-h-full" />
        )}
        {!ready && (
          <Loader2 className="absolute h-4 w-4 animate-spin text-fuchsia-500" />
        )}
      </div>
      <span className={cn('text-[10px] tabular-nums', active ? 'text-fuchsia-300 font-bold' : 'text-white/60')}>
        {pageNumber}
      </span>
    </button>
  );
});

// ─── Modal ──────────────────────────────────────────────────────────────────
const PdfViewerModal = memo(function PdfViewerModal({
  url, fileName, onClose,
}: { url: string; fileName: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<any>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showThumbs, setShowThumbs] = useState(false);

  // Blob cache: o arquivo é baixado uma vez e reaproveitado para
  // imprimir/abrir-em-nova-aba/baixar, contornando popup blockers e CORS.
  const blobUrlRef = useRef<string | null>(null);
  const ensureBlobUrl = useCallback(async (): Promise<string> => {
    if (blobUrlRef.current) return blobUrlRef.current;
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    blobUrlRef.current = objUrl;
    return objUrl;
  }, [url]);

  // Gesture pinch state
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);

  // Carrega PDF
  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const task = pdfjsLib.getDocument({ url });
        const pdf = await task.promise;
        if (cancelled) { try { pdf.destroy(); } catch {} return; }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setPdfReady(true);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Falha ao carregar PDF');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try { pdfRef.current?.destroy(); } catch {}
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [url]);

  // Renderiza página principal (mantém scale ao trocar)
  useEffect(() => {
    let cancelled = false;
    const pdf = pdfRef.current;
    if (!pdf || !canvasRef.current || !pdfReady) return;
    setLoading(true);
    let renderTask: any = null;
    (async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        const containerWidth = (stageRef.current?.clientWidth || window.innerWidth) - 16;
        const fitScale = containerWidth / baseVp.width;
        const finalScale = Math.max(0.25, Math.min(6, fitScale * scale));
        const vp = page.getViewport({ scale: finalScale });
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        renderTask = page.render({ canvasContext: ctx, viewport: vp, canvas } as any);
        await renderTask.promise;
        if (!cancelled) setLoading(false);
      } catch (e: any) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') {
          setError(e?.message || 'Falha ao renderizar página');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try { renderTask?.cancel?.(); } catch {}
    };
  }, [pageNum, scale, pdfReady]);

  // ESC fecha + setas navegam
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setPageNum(p => Math.min(numPages, p + 1));
      if (e.key === 'ArrowLeft') setPageNum(p => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, numPages]);

  // Wheel/trackpad zoom (ctrl+wheel)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale(s => Math.max(0.5, Math.min(4, +(s + (e.deltaY < 0 ? 0.15 : -0.15)).toFixed(2))));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel as any);
  }, []);

  // Touch pinch
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartScale.current = scale;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDist.current;
      const next = Math.max(0.5, Math.min(4, +(pinchStartScale.current * ratio).toFixed(2)));
      setScale(next);
    }
  };
  const onTouchEnd = () => { pinchStartDist.current = null; };

  // Baixar via blob (preserva nome)
  const handleDownload = useCallback(async () => {
    try {
      const objUrl = await ensureBlobUrl();
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = fileName || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }, [ensureBlobUrl, fileName, url]);

  // Imprimir: usa iframe oculto com blob URL — robusto, sem popup blocker,
  // e funciona em mobile sem depender de chrome do navegador.
  const handlePrint = useCallback(async () => {
    try {
      const objUrl = await ensureBlobUrl();
      const existing = document.getElementById('__pdf_print_iframe__');
      if (existing) existing.remove();
      const iframe = document.createElement('iframe');
      iframe.id = '__pdf_print_iframe__';
      iframe.style.position = 'fixed';
      iframe.style.right = '0'; iframe.style.bottom = '0';
      iframe.style.width = '0'; iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = objUrl;
      document.body.appendChild(iframe);
      const tryPrint = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          // fallback final: abre em nova aba
          window.open(objUrl, '_blank', 'noopener');
        }
      };
      iframe.onload = () => setTimeout(tryPrint, 250);
      // Failsafe se onload não disparar (alguns navegadores com pdf viewer nativo)
      setTimeout(tryPrint, 2500);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }, [ensureBlobUrl, url]);

  // Nova aba: prefere blob URL (não expira, sem CORS). Cai para URL direta.
  const openInNewTab = useCallback(async () => {
    // Abrir popup ANTES do await para evitar bloqueio em alguns navegadores
    const win = window.open('about:blank', '_blank', 'noopener');
    try {
      const objUrl = await ensureBlobUrl();
      if (win) { win.location.href = objUrl; }
      else { window.open(objUrl, '_blank', 'noopener'); }
    } catch {
      if (win) { win.location.href = url; }
      else { window.location.href = url; }
    }
  }, [ensureBlobUrl, url]);

  // Pré-carrega vizinhas (página atual ± 2) mesmo fora do viewport
  const preloadRange = new Set<number>();
  for (let i = -2; i <= 2; i++) {
    const p = pageNum + i;
    if (p >= 1 && p <= numPages) preloadRange.add(p);
  }

  // Sidebar action button (colorful) com tooltip nativo
  const ActionBtn = ({ onClick, label, tip, icon: Icon, color, disabled }: {
    onClick: () => void; label: string; tip: string; icon: any; color: string; disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tip}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 transition-all',
        'text-white text-[10px] font-semibold leading-none',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        color
      )}
      aria-label={tip}
    >
      <Icon className="h-5 w-5" />
      <span className="hidden md:inline-block">{label}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[10000] bg-black flex flex-col">
      {/* Top mini-bar: nome + fechar */}
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 bg-gradient-to-b from-black/95 to-black/60">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="h-5 w-5 text-fuchsia-400 shrink-0" />
          <span className="truncate text-sm font-medium text-white">{fileName}</span>
          {numPages > 0 && (
            <span className="shrink-0 text-[11px] text-white/60 tabular-nums">
              · {pageNum}/{numPages}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fechar (Esc)"
          className="h-10 w-10 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-fuchsia-900/50 ring-2 ring-white/20"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body: sidebar + stage + thumbnails */}
      <div className="flex-1 min-h-0 flex">
        <aside className="w-[68px] md:w-[88px] shrink-0 bg-black/80 border-r border-white/10 flex flex-col items-stretch gap-1 p-2 overflow-y-auto pdf-invisible-scroll">
          <ActionBtn
            onClick={() => setScale(s => Math.min(4, +(s + 0.25).toFixed(2)))}
            label="Mais zoom" tip="Aumentar zoom (Ctrl + roda)" icon={ZoomIn}
            color="bg-emerald-600 hover:bg-emerald-500"
          />
          <ActionBtn
            onClick={() => setScale(s => Math.max(0.5, +(s - 0.25).toFixed(2)))}
            label="Menos zoom" tip="Diminuir zoom" icon={ZoomOut}
            color="bg-emerald-700/80 hover:bg-emerald-600"
          />
          <ActionBtn
            onClick={() => setScale(1)}
            label={`${Math.round(scale * 100)}%`} tip="Redefinir zoom para 100%" icon={RotateCw}
            color="bg-sky-600 hover:bg-sky-500"
          />
          <div className="my-1 h-px bg-white/10" />
          <ActionBtn
            onClick={() => setShowThumbs(s => !s)}
            label={showThumbs ? 'Fechar' : 'Páginas'}
            tip={showThumbs ? 'Fechar grade de páginas' : 'Abrir grade de miniaturas'}
            icon={LayoutGrid}
            color={showThumbs ? 'bg-fuchsia-600 hover:bg-fuchsia-500' : 'bg-fuchsia-700/70 hover:bg-fuchsia-600'}
            disabled={numPages <= 1}
          />
          <div className="my-1 h-px bg-white/10" />
          <ActionBtn
            onClick={handleDownload} label="Baixar" tip="Baixar o PDF" icon={Download}
            color="bg-amber-600 hover:bg-amber-500"
          />
          <ActionBtn
            onClick={handlePrint} label="Imprimir" tip="Imprimir o PDF" icon={Printer}
            color="bg-indigo-600 hover:bg-indigo-500"
          />
          <ActionBtn
            onClick={openInNewTab} label="Nova aba" tip="Abrir o PDF em uma nova aba" icon={ExternalLink}
            color="bg-slate-600 hover:bg-slate-500"
          />
        </aside>

        {/* Stage */}
        <div
          ref={stageRef}
          className="flex-1 min-w-0 overflow-auto pdf-invisible-scroll flex items-start justify-center p-3"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y pinch-zoom' }}
        >
          {error ? (
            <div className="m-auto flex flex-col items-center gap-3 text-white/85 max-w-xs text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <p className="text-sm">{error}</p>
              <p className="text-xs text-white/60">Tente abrir o arquivo em uma nova aba ou baixar diretamente.</p>
              <div className="flex gap-2 mt-1">
                <button onClick={openInNewTab} title="Abrir em nova aba" className="px-3 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir em nova aba
                </button>
                <button onClick={handleDownload} title="Baixar PDF" className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold inline-flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Baixar
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <canvas ref={canvasRef} className="block rounded shadow-2xl bg-white max-w-none" />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                  <Loader2 className="h-6 w-6 animate-spin text-fuchsia-400" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Thumbnails grid (direita) — lazy + virtual + preload vizinhos */}
        {showThumbs && numPages > 1 && pdfRef.current && (
          <aside className="w-[130px] md:w-[180px] shrink-0 bg-black/80 border-l border-white/10 overflow-y-auto pdf-invisible-scroll p-2">
            <div className="grid grid-cols-1 gap-2">
              {Array.from({ length: numPages }).map((_, i) => {
                const n = i + 1;
                return (
                  <PageThumb
                    key={n}
                    pdf={pdfRef.current}
                    pdfUrl={url}
                    pageNumber={n}
                    active={pageNum === n}
                    preload={preloadRange.has(n)}
                    onClick={() => { setPageNum(n); }}
                  />
                );
              })}
            </div>
          </aside>
        )}
      </div>

      {/* Footer paginação rápida */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 bg-gradient-to-t from-black/95 to-black/60">
          <button
            type="button"
            disabled={pageNum <= 1}
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            title="Página anterior (←)"
            className="h-10 w-10 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-white/10 disabled:opacity-40 text-white flex items-center justify-center"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-xs text-white/80 tabular-nums px-2">
            {pageNum} / {numPages}
          </span>
          <button
            type="button"
            disabled={pageNum >= numPages}
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            title="Próxima página (→)"
            className="h-10 w-10 rounded-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-white/10 disabled:opacity-40 text-white flex items-center justify-center"
            aria-label="Próxima página"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Scroll invisível scoped */}
      <style>{`
        .pdf-invisible-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .pdf-invisible-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }
      `}</style>
    </div>
  );
});

// ─── Miniatura no chat ──────────────────────────────────────────────────────
export const PdfMessage = memo(function PdfMessage({ mediaUrl, fileName, isMine }: PdfMessageProps) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState(false);
  const [open, setOpen] = useState(false);
  const displayName = fileName || 'Documento PDF';

  useEffect(() => {
    let cancelled = false;
    setThumb(null);
    setThumbError(false);
    renderThumb(mediaUrl)
      .then(d => { if (!cancelled) setThumb(d); })
      .catch(() => { if (!cancelled) setThumbError(true); });
    return () => { cancelled = true; };
  }, [mediaUrl]);

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-2xl border border-border/50 bg-muted/60 p-2 mb-1 max-w-[260px]',
          isMine ? 'rounded-tr-sm' : 'rounded-tl-sm'
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Abrir visualizador de PDF"
          className="relative w-full h-[180px] rounded-lg overflow-hidden bg-background/60 flex items-center justify-center hover:opacity-90 transition-opacity"
        >
          {thumb && !thumbError ? (
            <img
              src={thumb}
              alt={displayName}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-contain"
            />
          ) : thumbError ? (
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <FileText className="h-12 w-12 text-fuchsia-400/70" />
              <span className="text-[10px]">Pré-visualização indisponível</span>
            </div>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-white">PDF</div>
        </button>

        <div className="flex items-center gap-2 px-1">
          <FileText className="h-4 w-4 text-fuchsia-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground">Toque para visualizar</p>
          </div>
        </div>

        {/* Fallback sempre disponível */}
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir o PDF em uma nova aba"
          className="inline-flex items-center justify-center gap-1.5 text-[10px] font-semibold text-fuchsia-400 hover:text-fuchsia-300 px-1 py-0.5"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir em nova aba
        </a>
      </div>

      {open && (
        <PdfViewerModal
          url={mediaUrl}
          fileName={displayName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
});
