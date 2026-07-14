/**
 * OcultoPlayLinkComposer — UI dentro do modal de upload para criar um item do tipo
 * `link` no PLAY. Aceita YouTube, Vimeo, TikTok, magnet links e arquivos diretos (.mp4/.webm).
 *
 * Saída via `onChange`:
 *   - sourceUrl: URL crua informada pelo usuário (será salva em source_url + media_url)
 *   - provider:  'youtube' | 'vimeo' | 'tiktok' | 'direct' | 'embed' | 'magnet'
 *   - coverBlob: Blob de capa selecionada (frame capturado ou upload custom)
 *   - coverRemoteUrl: URL remota de capa (ex: thumbnail oficial do YouTube)
 *     → quando coverBlob é null mas coverRemoteUrl existe, usar este valor direto
 *       como thumb_url do item (sem reupload).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Image as ImageIcon, Camera, Link2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  parseEmbeddedVideo,
  getYouTubeThumbnailVariants,
  extractUrlFromEmbedSnippet,
  type ParsedEmbeddedVideo,
} from '@/lib/embeddedVideoUrl';
import {
  extractFramesFromDirectVideo,
  type ExtractedFrame,
} from '@/lib/ocultoPlayLinkFrames';

export interface OcultoPlayLinkComposerValue {
  sourceUrl: string;
  provider: ParsedEmbeddedVideo['kind'] | null;
  coverBlob: Blob | null;
  coverRemoteUrl: string | null;
}

interface Props {
  value: { url: string };
  onChange: (next: OcultoPlayLinkComposerValue) => void;
  /** Capa atualmente salva no banco (apenas modo edição). Quando informada,
   *  o composer exibe um painel "Capa atual" e uma prévia comparativa
   *  Atual × Nova selecionada. */
  currentThumbUrl?: string | null;
}

const PROVIDER_LABEL: Record<ParsedEmbeddedVideo['kind'], string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  tiktok: 'TikTok',
  direct: 'Arquivo direto',
  embed: 'Outro provedor',
  magnet: 'Magnet',
};

export function OcultoPlayLinkComposer({ value, onChange, currentThumbUrl }: Props) {
  const [url, setUrl] = useState(value.url || '');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [framesError, setFramesError] = useState<string | null>(null);
  const [selectedFrameIdx, setSelectedFrameIdx] = useState<number | null>(null);
  const [selectedRemoteThumb, setSelectedRemoteThumb] = useState<string | null>(null);
  const lastEmittedRef = useRef<string>('');

  // Sincroniza com mudanças externas do `value.url` (ex.: edição abre o modal,
  // pai busca dados frescos do banco e injeta a URL já salva). Sem isso, o
  // composer ficaria preso à string vazia inicial e nem o preview nem os
  // seletores de capa apareceriam.
  useEffect(() => {
    const incoming = value.url ?? '';
    setUrl((cur) => (cur === incoming ? cur : incoming));
  }, [value.url]);

  const parsed = useMemo(() => parseEmbeddedVideo(url.trim()), [url]);

  // Variantes remotas conhecidas para escolher como capa (YouTube)
  const remoteThumbs = useMemo<string[]>(() => {
    if (!parsed) return [];
    if (parsed.kind === 'youtube') return getYouTubeThumbnailVariants(parsed.id);
    if (parsed.thumbnailUrl) return [parsed.thumbnailUrl];
    return [];
  }, [parsed]);

  // Preview do upload custom
  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const u = URL.createObjectURL(coverFile);
    setCoverPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [coverFile]);

  // Limpa frames anteriores ao trocar de URL
  useEffect(() => {
    setFrames((prev) => { prev.forEach((f) => URL.revokeObjectURL(f.url)); return []; });
    setSelectedFrameIdx(null);
    setFramesError(null);
    // pré-seleciona a primeira thumb remota disponível
    setSelectedRemoteThumb(remoteThumbs[0] ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed?.id, parsed?.kind]);

  // Emite mudanças para o pai
  useEffect(() => {
    const coverBlob =
      coverFile ? coverFile :
      (selectedFrameIdx != null ? frames[selectedFrameIdx]?.blob ?? null : null);
    const next: OcultoPlayLinkComposerValue = {
      sourceUrl: url.trim(),
      provider: parsed?.kind ?? null,
      coverBlob,
      coverRemoteUrl: coverBlob ? null : selectedRemoteThumb,
    };
    const sig = `${next.sourceUrl}|${next.provider}|${coverBlob ? 'blob' : ''}|${next.coverRemoteUrl ?? ''}`;
    if (sig === lastEmittedRef.current) return;
    lastEmittedRef.current = sig;
    onChange(next);
  }, [url, parsed?.kind, coverFile, selectedFrameIdx, frames, selectedRemoteThumb, onChange, parsed]);

  const captureFrames = async () => {
    if (!parsed || parsed.kind !== 'direct') return;
    setFramesLoading(true);
    setFramesError(null);
    try {
      const fs = await extractFramesFromDirectVideo(parsed.embedSrc, 10);
      if (fs.length === 0) setFramesError('Não foi possível extrair frames (CORS ou formato).');
      setFrames(fs);
      setSelectedFrameIdx(fs.length ? 0 : null);
      if (fs.length) {
        setCoverFile(null);
        setSelectedRemoteThumb(null);
      }
    } catch (e: any) {
      setFramesError(e?.message ?? 'Falha ao extrair frames.');
    } finally {
      setFramesLoading(false);
    }
  };

  // Resolve a prévia da capa NOVA selecionada (blob / frame / remota), usada
  // tanto no destaque "Nova capa" quanto no card de comparação Atual × Nova.
  const selectedNewPreview = useMemo<{ src: string; label: string } | null>(() => {
    if (coverFile && coverPreview) return { src: coverPreview, label: 'Upload personalizado' };
    if (selectedFrameIdx != null && frames[selectedFrameIdx]) {
      return { src: frames[selectedFrameIdx].url, label: `Frame ${(frames[selectedFrameIdx].timeSec).toFixed(1)}s` };
    }
    if (selectedRemoteThumb) return { src: selectedRemoteThumb, label: 'Capa sugerida' };
    return null;
  }, [coverFile, coverPreview, selectedFrameIdx, frames, selectedRemoteThumb]);

  const isUsingCurrent = !!currentThumbUrl && !selectedNewPreview;

  const handleKeepCurrent = () => {
    setCoverFile(null);
    setSelectedFrameIdx(null);
    setSelectedRemoteThumb(null);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> URL ou código de embed (YouTube, Vimeo, TikTok, magnet, .mp4 direto ou outros)
        </label>
        <Input
          value={url}
          onChange={(e) => {
            const raw = e.target.value;
            // Se for um snippet (<iframe …>, <script …>, etc.), extrai o src automaticamente.
            const extracted = extractUrlFromEmbedSnippet(raw);
            setUrl(extracted === raw ? raw : extracted);
          }}
          placeholder="https://… ou cole o código <iframe src=…>"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
        />
        {url.trim() && !parsed && (
          <div className="mt-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-[11px] text-rose-100 space-y-1">
            <p className="flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3 w-3" />
              URL inválida
            </p>
            <p className="text-rose-200/85 leading-snug">
              Cole uma URL completa começando com https:// ou magnet:?xt=urn:btih:...
            </p>
          </div>
        )}
        {parsed && (
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">{PROVIDER_LABEL[parsed.kind]}</Badge>
            <span className="text-[10px] text-muted-foreground">
              {parsed.kind === 'magnet'
                ? 'Será salvo como link externo e aberto por um app compatível do dispositivo.'
                : parsed.kind === 'embed'
                ? 'Tentaremos embutir; se o site bloquear, abre externamente.'
                : 'Detectado automaticamente'}
            </span>
          </div>
        )}
      </div>

      {/* Capa atual (apenas em edição) — destaque + opção de manter */}
      {currentThumbUrl && (
        <div className={cn(
          'rounded-lg border p-2.5 flex items-center gap-3 transition-colors',
          isUsingCurrent
            ? 'border-emerald-400/60 bg-emerald-500/10'
            : 'border-border/40 bg-muted/30',
        )}>
          <div className="relative aspect-video w-28 shrink-0 rounded-md overflow-hidden border border-border/40 bg-black/60">
            <img src={currentThumbUrl} alt="Capa atual" className="absolute inset-0 h-full w-full object-cover" />
            {isUsingCurrent && (
              <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/90 text-white px-1.5 py-0.5 rounded">
                Em uso
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">Capa atual</p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              {isUsingCurrent
                ? 'Esta capa será mantida se você salvar agora.'
                : 'Você selecionou uma nova capa abaixo. Para reverter, clique em "Manter capa atual".'}
            </p>
            {!isUsingCurrent && (
              <Button
                type="button" size="sm" variant="outline"
                onClick={handleKeepCurrent}
                className="h-7 mt-1.5 text-[11px]"
              >
                Manter capa atual
              </Button>
            )}
          </div>
        </div>
      )}


      {/* Preview do player */}
      {parsed && (
        <div className="rounded-lg overflow-hidden border border-border/40 bg-black aspect-video relative">
          {parsed.kind === 'magnet' ? (
            <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-white/85">
              Link magnet detectado. O navegador não reproduz diretamente; no player, o usuário poderá abrir no app compatível do dispositivo.
            </div>
          ) : parsed.kind === 'direct' ? (
            <video src={parsed.embedSrc} controls controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} className="absolute inset-0 h-full w-full" />
          ) : (
            <iframe
              src={parsed.embedSrc}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              loading="lazy"
              title="Prévia do vídeo"
            />
          )}
        </div>
      )}

      {/* Thumbnails remotas (YouTube tem 4 variantes; Vimeo/TikTok deixamos só upload manual) */}
      {parsed && remoteThumbs.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Capa sugerida</p>
          <div className="grid grid-cols-4 gap-2">
            {remoteThumbs.map((t) => {
              const active = selectedRemoteThumb === t && !coverFile && selectedFrameIdx == null;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setSelectedRemoteThumb(t);
                    setCoverFile(null);
                    setSelectedFrameIdx(null);
                  }}
                  className={cn(
                    'relative aspect-video rounded-md overflow-hidden border bg-black/50',
                    active ? 'border-fuchsia-400 ring-1 ring-fuchsia-400/60' : 'border-border/40',
                  )}
                >
                  <img src={t} alt="Capa" className="absolute inset-0 h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Frames automáticos (arquivos diretos) */}
      {parsed?.kind === 'direct' && (
        <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-fuchsia-100 flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" /> Capturar frames como capa
            </p>
            <Button
              type="button" size="sm" variant="secondary"
              onClick={captureFrames} disabled={framesLoading}
              className="h-7 text-[11px]"
            >
              {framesLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {frames.length > 0 ? 'Recapturar' : 'Capturar até 10 frames'}
            </Button>
          </div>
          {framesError && (
            <p className="text-[10px] text-rose-300">{framesError}</p>
          )}
          {frames.length > 0 && (
            <div className="grid grid-cols-5 gap-2">
              {frames.map((f, idx) => {
                const active = selectedFrameIdx === idx && !coverFile;
                return (
                  <button
                    key={idx} type="button"
                    onClick={() => { setSelectedFrameIdx(idx); setCoverFile(null); setSelectedRemoteThumb(null); }}
                    className={cn(
                      'relative aspect-video rounded-md overflow-hidden border bg-black/50',
                      active ? 'border-fuchsia-400 ring-1 ring-fuchsia-400/60' : 'border-border/40',
                    )}
                  >
                    <img src={f.url} alt={`Frame ${idx + 1}`} className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 text-[9px] text-white/90 bg-black/60 text-center py-[1px] tabular-nums">
                      {f.timeSec.toFixed(1)}s
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Upload de capa personalizada */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> Capa personalizada (opcional — sobrepõe sugestões)
        </label>
        <Input
          type="file" accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setCoverFile(f);
            if (f) { setSelectedFrameIdx(null); setSelectedRemoteThumb(null); }
          }}
        />
        {coverPreview && (
          <div className="mt-2 relative aspect-video w-40 rounded-md overflow-hidden border border-border/40 bg-black/40">
            <img src={coverPreview} alt="Capa personalizada" className="absolute inset-0 h-full w-full object-cover" />
          </div>
        )}
      </div>

      {/* Comparativo Atual × Nova (apenas em edição com nova capa escolhida) */}
      {currentThumbUrl && selectedNewPreview && (
        <div className="rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/5 p-3">
          <p className="text-xs font-semibold text-fuchsia-100 mb-2">
            Comparar capa — antes × depois
          </p>
          <div className="grid grid-cols-2 gap-2">
            <figure className="space-y-1">
              <div className="relative aspect-video rounded-md overflow-hidden border border-border/40 bg-black/60">
                <img src={currentThumbUrl} alt="Capa atual" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-black/70 text-white px-1.5 py-0.5 rounded">
                  Atual
                </span>
              </div>
              <figcaption className="text-[10px] text-muted-foreground text-center">Salva no banco</figcaption>
            </figure>
            <figure className="space-y-1">
              <div className="relative aspect-video rounded-md overflow-hidden border border-fuchsia-400/70 ring-1 ring-fuchsia-400/40 bg-black/60">
                <img src={selectedNewPreview.src} alt="Nova capa" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-fuchsia-500/90 text-white px-1.5 py-0.5 rounded">
                  Nova
                </span>
              </div>
              <figcaption className="text-[10px] text-fuchsia-200 text-center">{selectedNewPreview.label}</figcaption>
            </figure>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
            Ao salvar, a capa "Nova" substituirá a atual. Clique em "Manter capa atual" acima para cancelar a troca.
          </p>
        </div>
      )}
    </div>

  );
}
