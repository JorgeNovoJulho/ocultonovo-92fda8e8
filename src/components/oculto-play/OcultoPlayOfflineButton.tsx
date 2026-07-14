/**
 * OcultoPlayOfflineButton — botão "Ouvir Offline" usado no modal de áudio.
 * Faz download para IndexedDB com obfuscação por usuário; reprodução só
 * funciona dentro do Oculto Play do próprio usuário logado.
 */
import { useEffect, useState, useCallback } from 'react';
import { CloudDownload, Check, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  isAudioOffline,
  saveAudioOffline,
  deleteAudioOffline,
  subscribeOfflineChanges,
  emitOfflineChange,
} from '@/lib/ocultoPlayOfflineCache';

interface Props {
  itemId: string;
  audioUrl: string | null | undefined;
  title?: string | null;
  thumbUrl?: string | null;
  durationSec?: number | null;
  className?: string;
}

export function OcultoPlayOfflineButton({
  itemId, audioUrl, title, thumbUrl, durationSec, className,
}: Props) {
  const { user } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    isAudioOffline(itemId).then((v) => { if (alive) setSaved(v); });
    const unsub = subscribeOfflineChanges((id, state) => {
      if (id === itemId) setSaved(state === 'saved');
    });
    return () => { alive = false; unsub(); };
  }, [itemId]);

  const handle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id) { toast.error('Faça login para baixar para ouvir offline.'); return; }
    if (!audioUrl) { toast.error('Áudio indisponível para download.'); return; }
    if (saved) {
      try {
        await deleteAudioOffline(itemId);
        emitOfflineChange(itemId, 'deleted');
        toast.success('Removido do offline.');
      } catch (err: any) {
        toast.error('Não foi possível remover.', { description: err?.message });
      }
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      await saveAudioOffline(itemId, user.id, audioUrl, {
        title: title ?? null,
        thumb_url: thumbUrl ?? null,
        duration_sec: durationSec ?? null,
      }, (loaded, total) => {
        if (total) setProgress(Math.round((loaded / total) * 100));
        else setProgress(null);
      });
      emitOfflineChange(itemId, 'saved');
      toast.success('Música disponível offline no Oculto Play.', {
        description: 'Acessível apenas neste app, sem permitir transferência.',
      });
    } catch (err: any) {
      toast.error('Falha ao baixar.', { description: err?.message });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [audioUrl, durationSec, itemId, saved, thumbUrl, title, user?.id]);

  const label = busy
    ? (progress != null ? `${progress}%` : 'Baixando…')
    : saved ? 'Disponível offline' : 'Ouvir Offline';
  const Icon = busy ? Loader2 : saved ? Check : CloudDownload;

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      aria-pressed={saved}
      title={saved
        ? 'Música já disponível offline — clique para remover'
        : 'Baixar para ouvir sem internet (somente dentro do Oculto Play)'}
      style={
        saved
          ? { backgroundColor: '#10b981', borderColor: '#10b981', boxShadow: '0 0 14px rgba(16, 185, 129, 0.55)' }
          : { backgroundColor: '#00BFFF', borderColor: '#00BFFF', boxShadow: '0 0 14px rgba(0, 191, 255, 0.55)' }
      }
      className={cn(
        'inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold text-black ring-2 transition-all active:scale-[0.98]',
        saved ? 'ring-emerald-300/60' : 'ring-cyan-200/60',
        busy && 'opacity-90',
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 shrink-0', busy && 'animate-spin')} />
      <span className="truncate">{label}</span>
    </button>
  );
}
