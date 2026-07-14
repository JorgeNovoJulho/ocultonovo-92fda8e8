/**
 * OcultoPlayOfflinePage — listagem e reprodução de músicas salvas
 * offline (IndexedDB scrambled). Acessível mesmo sem internet.
 *
 * Lê via @/lib/ocultoPlayOfflineCache (sem rede). Identifica o usuário
 * pelo cache local de auth do Supabase (também offline).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Pause, Trash2, WifiOff, Music, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import {
  listOfflineAudios,
  getOfflinePlaybackUrl,
  deleteAudioOffline,
  subscribeOfflineChanges,
  emitOfflineChange,
} from '@/lib/ocultoPlayOfflineCache';
import {
  playSharedAudio,
  pauseSharedAudio,
  subscribeActiveAudio,
  getActiveAudioState,
  type ActiveAudioState,
} from '@/lib/ocultoPlayAudioSession';
import { enableOcultoPlayMiniPlayer } from '@/lib/ocultoPlayMiniPlayerState';

type OfflineRow = {
  id: string;
  title: string | null;
  thumb_url: string | null;
  duration_sec: number | null;
  bytes: number;
  saved_at: number;
};

function fmtDuration(sec?: number | null) {
  if (!sec || sec < 1) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtSize(bytes: number) {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function OcultoPlayOfflinePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OfflineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveAudioState | null>(() => getActiveAudioState());
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listOfflineAudios(user?.id ?? null);
      console.info('[oculto-play offline] carregadas', list.length, 'faixas');
      setRows(list.map((r) => ({
        id: r.id,
        title: r.title,
        thumb_url: r.thumb_url,
        duration_sec: r.duration_sec,
        bytes: r.bytes,
        saved_at: r.saved_at,
      })).sort((a, b) => b.saved_at - a.saved_at));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [user?.id]);
  useEffect(() => subscribeOfflineChanges(() => { void reload(); }), [user?.id]);
  useEffect(() => subscribeActiveAudio(setActive), []);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const playingId = active?.playing ? active.id : null;

  const handlePlay = async (row: OfflineRow) => {
    try {
      // Mesmo item: alterna play/pause na sessão compartilhada (mini player).
      if (active?.id === row.id) {
        if (active.playing) {
          pauseSharedAudio(row.id);
        } else {
          await playSharedAudio(row.id, undefined, {
            title: row.title || 'Música offline',
            artwork: row.thumb_url || undefined,
          });
        }
        return;
      }
      // Nova faixa: resolve a URL offline (blob) e entrega para a sessão
      // compartilhada — assim o mini player global assume a reprodução.
      const url = await getOfflinePlaybackUrl(row.id, user?.id ?? undefined);
      if (!url) { toast.error('Não foi possível abrir a música offline.'); return; }
      await playSharedAudio(row.id, url, {
        title: row.title || 'Música offline',
        artwork: row.thumb_url || undefined,
      });
      enableOcultoPlayMiniPlayer();
    } catch (e: any) {
      toast.error('Falha ao reproduzir.', { description: e?.message });
    }
  };

  const handleDelete = async (row: OfflineRow) => {
    if (active?.id === row.id) {
      try { pauseSharedAudio(row.id); } catch { /* noop */ }
    }
    await deleteAudioOffline(row.id);
    emitOfflineChange(row.id, 'deleted');
    toast.success('Removido do offline.');
  };

  const totalSize = useMemo(() => rows.reduce((acc, r) => acc + (r.bytes || 0), 0), [rows]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            to="/oculto-play"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/60 hover:bg-muted"
            aria-label="Voltar ao Oculto Play"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">Modo offline</h1>
            <p className="text-[11px] text-muted-foreground">
              {rows.length} música{rows.length === 1 ? '' : 's'} salva{rows.length === 1 ? '' : 's'} · {fmtSize(totalSize)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted"
            aria-label="Atualizar lista"
            title="Atualizar lista"
          >
            Atualizar
          </button>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
              online
                ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/40'
                : 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/40'
            }`}
          >
            <WifiOff className="h-3 w-3" />
            {online ? 'Online' : 'Sem internet'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {!online && (
          <div className="mb-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Você está sem conexão. Aqui ficam disponíveis apenas as músicas que você já baixou para ouvir offline.
          </div>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-muted/30 p-8 text-center">
            <Music className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-semibold">Nenhuma música offline ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No Oculto Play, abra uma música e toque em <span className="font-semibold text-foreground">Ouvir Offline</span> para baixá-la.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const isPlaying = playingId === row.id;
              return (
                <li
                  key={row.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 p-2.5"
                >
                  <button
                    type="button"
                    onClick={() => handlePlay(row)}
                    aria-label={isPlaying ? 'Pausar' : 'Tocar'}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00BFFF] text-black shadow-[0_0_14px_rgba(0,191,255,0.55)] active:scale-95"
                  >
                    {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                  </button>
                  {row.thumb_url ? (
                    <img
                      src={row.thumb_url}
                      alt=""
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Music className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {row.title || 'Música sem título'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDuration(row.duration_sec)} · {fmtSize(row.bytes)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(row)}
                    aria-label="Remover do offline"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
