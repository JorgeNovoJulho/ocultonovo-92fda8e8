/**
 * OcultoPlayDownloadsPage — Etapa 40
 * Lista os itens baixados para uso offline. Tap reproduz via blob URL local.
 */
import { useEffect, useMemo, useState } from 'react';
import { useOcultoPlayOffline, resolveOfflineUrl, type OfflineDownload } from '@/hooks/useOcultoPlayOffline';
import { Button } from '@/components/ui/button';
import { Trash2, Download, Play, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function OfflineCard({ item, onRemove, busy }: {
  item: OfflineDownload;
  onRemove: (id: string) => void;
  busy: boolean;
}) {
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

  const handlePlay = async () => {
    setOpening(true);
    try {
      const url = await resolveOfflineUrl(item.media_url);
      if (!url) {
        window.open(item.media_url, '_blank', 'noopener');
        return;
      }
      setLocalUrl(url);
    } finally {
      setOpening(false);
    }
  };

  const isVideo = item.kind === 'short_video' || /\.(mp4|webm|mov)(\?|$)/i.test(item.media_url);
  const isAudio = item.kind === 'audio' || /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(item.media_url);

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-3 flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="h-20 w-20 rounded-md overflow-hidden bg-muted shrink-0 grid place-items-center">
          {item.thumb_url ? (
            <img src={item.thumb_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Download className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{item.title || 'Sem título'}</div>
          <div className="text-[11px] text-muted-foreground">
            {item.kind} · {formatSize(item.size_bytes)}
            {item.is_paid && <span className="ml-1 text-amber-400">· PPV</span>}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(item.downloaded_at).toLocaleString('pt-BR')}
          </div>
        </div>
      </div>

      {localUrl && (
        <div className="rounded-md overflow-hidden bg-black">
          {isVideo ? (
            <video src={localUrl} controls autoPlay playsInline className="w-full max-h-[60vh]" />
          ) : isAudio ? (
            <audio src={localUrl} controls autoPlay className="w-full" />
          ) : (
            <img src={localUrl} alt={item.title ?? ''} className="w-full max-h-[60vh] object-contain" />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="secondary" onClick={handlePlay} disabled={opening}>
          <Play className="h-4 w-4 mr-1" /> {localUrl ? 'Reproduzir novamente' : 'Reproduzir offline'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => onRemove(item.item_id)}
          disabled={busy}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function OcultoPlayDownloadsPage() {
  const { downloads, loading, removeItem, busyItemId } = useOcultoPlayOffline();

  const totalSize = useMemo(
    () => downloads.reduce((acc, d) => acc + (d.size_bytes ?? 0), 0),
    [downloads],
  );

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border/40 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WifiOff className="h-5 w-5 text-fuchsia-400" />
          <div>
            <h1 className="text-base font-semibold">Downloads offline</h1>
            <p className="text-[11px] text-muted-foreground">
              {downloads.length} {downloads.length === 1 ? 'item' : 'itens'}
              {totalSize > 0 && ` · ${formatSize(totalSize)}`}
            </p>
          </div>
        </div>
        <Link to="/oculto-play" className="text-xs text-fuchsia-300 hover:underline">
          Voltar ao Play
        </Link>
      </header>

      <main className="px-4 py-4 max-w-3xl mx-auto space-y-3">
        {loading && (
          <div className="text-center text-sm text-muted-foreground py-8">Carregando…</div>
        )}
        {!loading && downloads.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-12">
            <Download className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhum item baixado ainda.
            <div className="text-[11px] mt-1">
              Use o ícone de download no player para guardar mídia para assistir offline.
            </div>
          </div>
        )}
        {downloads.map(item => (
          <OfflineCard
            key={item.id}
            item={item}
            onRemove={removeItem}
            busy={busyItemId === item.item_id}
          />
        ))}
      </main>
    </div>
  );
}
