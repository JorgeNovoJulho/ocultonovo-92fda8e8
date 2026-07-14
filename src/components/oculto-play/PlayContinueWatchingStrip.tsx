/**
 * PlayContinueWatchingStrip — Etapa 33
 *
 * Strip horizontal com itens em "Continuar Assistindo". Mostra barra de
 * progresso, tempo salvo, duração total e % concluída. Ações: Continuar,
 * Reiniciar (com confirmação) e Marcar como assistido.
 */
import { useState } from 'react';
import { Play, X, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useOcultoPlayContinueWatching } from '@/hooks/useOcultoPlayContinueWatching';
import { openPlayItemDeepLink } from '@/components/oculto-play/PlayItemDeepLinkSheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlayContinueWatchingStrip() {
  const { data, isLoading, remove, resetProgress, markCompleted } =
    useOcultoPlayContinueWatching({ limit: 24 });
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2 text-[12px] font-semibold text-emerald-200">
        <Play className="h-3.5 w-3.5" />
        Continuar Assistindo
        <span className="text-[10px] text-muted-foreground font-normal">
          ({data.length})
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {data.map((it) => {
          const ratio = Math.max(0, Math.min(1, it.progress_ratio ?? 0));
          const progress = Number(it.progress_seconds) || 0;
          const duration = it.duration_seconds != null ? Number(it.duration_seconds) : null;
          const pct = Math.round(ratio * 100);
          return (
            <div
              key={it.item_id}
              className="relative shrink-0 w-[130px] cursor-pointer group"
              onClick={() => openPlayItemDeepLink(it.item_id)}
            >
              <div className="relative w-[130px] h-[170px] rounded-lg overflow-hidden bg-card border border-emerald-500/30">
                {it.thumb_url || it.media_url ? (
                  <img
                    src={it.thumb_url || it.media_url || ''}
                    alt={it.title ?? ''}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                    <Play className="h-6 w-6" />
                  </div>
                )}

                {/* Play overlay */}
                <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="grid place-items-center h-9 w-9 rounded-full bg-emerald-500/85 text-white">
                    <Play className="h-4 w-4 ml-0.5" fill="currentColor" />
                  </div>
                </div>

                {/* Badge de % no canto superior esquerdo */}
                <div className="absolute top-1 left-1 text-[9px] font-semibold bg-emerald-500/85 text-white px-1.5 py-0.5 rounded">
                  {pct}%
                </div>

                {/* Tempo salvo / duração */}
                <div className="absolute bottom-2 left-1 right-1 flex items-center justify-between text-[9px] text-white">
                  <span className="bg-black/65 px-1 py-0.5 rounded font-mono">
                    {fmt(progress)}
                    {duration ? ` / ${fmt(duration)}` : ''}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(it.item_id);
                  }}
                  className="absolute top-1 right-1 grid place-items-center h-5 w-5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remover da fila"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Ações */}
              <div className="mt-1 grid grid-cols-3 gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openPlayItemDeepLink(it.item_id);
                  }}
                  className="col-span-3 inline-flex items-center justify-center gap-1 h-6 rounded-md bg-emerald-500/90 hover:bg-emerald-500 text-white text-[10px] font-semibold uppercase tracking-wide"
                  title="Continuar de onde parou"
                >
                  <Play className="h-3 w-3" fill="currentColor" />
                  Continuar
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmResetId(it.item_id);
                  }}
                  className="inline-flex items-center justify-center gap-0.5 h-6 rounded-md bg-card border border-border/60 hover:border-emerald-400/60 text-[9px] text-muted-foreground hover:text-foreground"
                  title="Reiniciar do começo"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markCompleted.mutate(it.item_id);
                  }}
                  className="col-span-2 inline-flex items-center justify-center gap-1 h-6 rounded-md bg-card border border-emerald-500/40 hover:bg-emerald-500/20 text-[9px] text-emerald-300"
                  title="Marcar como assistido"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Assistido
                </button>
              </div>

              {it.title && (
                <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-tight">
                  {it.title}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!confirmResetId}
        onOpenChange={(o) => { if (!o) setConfirmResetId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar do começo?</AlertDialogTitle>
            <AlertDialogDescription>
              Seu progresso salvo será apagado e a próxima reprodução começará do início.
              Isso não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmResetId) resetProgress.mutate(confirmResetId);
                setConfirmResetId(null);
              }}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              Reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
