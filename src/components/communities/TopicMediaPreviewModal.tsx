/**
 * TopicMediaPreviewModal — abre um modal exibindo a mídia (foto/vídeo/áudio)
 * de um tópico SEM expor o link original no HTML do listing.
 *
 * • A URL real é resolvida apenas quando o modal abre (consulta DB por topic_id).
 * • A URL nunca é gravada no React state público (fica em ref) e nem em console.
 * • Vídeo é renderizado pelo CommunityVideoPlayer (que respeita trim/outro).
 */
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { CommunityVideoPlayer } from './CommunityVideoPlayer';

type Kind = 'image' | 'video' | 'audio';

export function TopicMediaPreviewModal({
  open,
  onOpenChange,
  topicId,
  kind,
  coverUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  topicId: string;
  kind: Kind;
  coverUrl?: string | null;
}) {
  // URL real só vive numa ref (nunca em state que poderia ser logado/serializado).
  const urlRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      urlRef.current = null;
      setReady(false);
      setError(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('oculto_community_media')
          .select('url,trim_start_seconds,trim_end_seconds')
          .eq('topic_id', topicId)
          .eq('kind', kind)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const row = data as { url?: string; trim_start_seconds?: number | null; trim_end_seconds?: number | null } | null;
        if (!row?.url) { setError(true); return; }
        // Embute fragmento de tempo (#t=start,end) para corte nativo no <video>.
        let u = row.url;
        if (kind === 'video' && (row.trim_start_seconds != null || row.trim_end_seconds != null)) {
          const s = Math.max(0, Number(row.trim_start_seconds ?? 0));
          const e = row.trim_end_seconds != null ? Number(row.trim_end_seconds) : null;
          const frag = e != null ? `#t=${s},${e}` : `#t=${s}`;
          u = `${row.url.split('#')[0]}${frag}`;
        }
        urlRef.current = u;
        setReady(true);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, topicId, kind]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-2xl p-0 overflow-hidden rounded-xl bg-black/95 border-border">
        <DialogTitle className="sr-only">Visualizar mídia do tópico</DialogTitle>
        <div className="relative min-h-[40vh] flex items-center justify-center">
          {!ready && !error && (
            <div className="absolute inset-0 grid place-items-center text-white/80">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          )}
          {error && (
            <div className="px-6 py-10 text-sm text-white/70 text-center">
              Não foi possível carregar esta mídia.
            </div>
          )}
          {ready && urlRef.current && (
            <SecureMedia kind={kind} url={urlRef.current} coverUrl={coverUrl ?? null} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Renderiza a mídia em si. A URL é passada por prop diretamente
 * para o elemento — não fica em state que possa vazar via devtools/console.
 */
function SecureMedia({
  kind,
  url,
  coverUrl,
}: {
  kind: Kind;
  url: string;
  coverUrl: string | null;
}) {
  if (kind === 'video') {
    return <CommunityVideoPlayer url={url} coverUrl={coverUrl} className="w-full" />;
  }
  if (kind === 'image') {
    return (
      <img
        src={url}
        alt=""
        className="max-h-[85vh] w-auto max-w-full object-contain select-none"
        draggable={false}
        referrerPolicy="no-referrer"
        onContextMenu={(e) => e.preventDefault()}
      />
    );
  }
  return (
    <audio
      src={url}
      controls
      controlsList="nodownload"
      preload="metadata"
      className="w-full max-w-md m-6"
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
