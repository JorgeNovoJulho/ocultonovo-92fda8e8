import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ImagePlus, Video, Music, X, Loader2, Paperclip, Film, Check, Scissors } from 'lucide-react';
import {
  useCreateTopic,
  useUpdateTopic,
  useUploadCommunityMedia,
  useCommunitySettings,
  useCommunityChannels,
  useCommunityTopicMedia,
} from '@/hooks/useCommunities';
import { MentionTextarea } from './MentionTextarea';
import { extractVideoFramesCandidates, captureVideoFrameAt, dataUrlToFile, type FrameCandidate } from '@/lib/videoFrameCandidates';
import { cn } from '@/lib/utils';
import outroAsset from '@/assets/oculto-video-outro.png.asset.json';

const DEFAULT_OUTRO_URL = (outroAsset as { url: string }).url;

type Kind = 'image' | 'video' | 'audio';
interface Attached {
  kind: Kind;
  url: string;            // URL remota final OU object URL local enquanto sobe
  coverUrl?: string | null;
  uploading?: boolean;
  progress?: number;      // 0..100 — barra em tempo real
  tempId?: string;        // chave estável durante upload
  duration?: number;      // duração total do vídeo (s)
  trimStart?: number;     // início do corte (s)
  trimEnd?: number;       // fim do corte (s)
}


const MAX_BYTES: Record<Kind, number> = {
  image: 8 * 1024 * 1024,
  video: 60 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

const MAX_IMAGES = 8;

function detectKind(file: File): Kind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

function toMarkdown(att: Attached): string {
  if (att.kind === 'image') return `![imagem](${att.url})`;
  if (att.kind === 'video') {
    // Embute corte como fragmento #t=start,end — o <video> nativo respeita
    // o range mesmo sem lookup no banco, garantindo que o corte funcione.
    const hasTrim = (att.trimStart != null && att.trimStart > 0) ||
      (att.trimEnd != null && att.duration != null && att.trimEnd < att.duration - 0.05);
    if (hasTrim) {
      const s = Math.max(0, att.trimStart ?? 0).toFixed(2);
      const e = att.trimEnd != null ? Number(att.trimEnd).toFixed(2) : '';
      const frag = e ? `#t=${s},${e}` : `#t=${s}`;
      return `[vídeo](${att.url}${frag})`;
    }
    return `[vídeo](${att.url})`;
  }
  return `[áudio](${att.url})`;
}

/** Extrai mídia em markdown do final do corpo e devolve o texto "limpo". */
function parseBodyMedia(rawBody: string | null | undefined): { text: string; attached: Attached[] } {
  if (!rawBody) return { text: '', attached: [] };
  const attached: Attached[] = [];
  let text = rawBody;
  const patterns: Array<{ kind: Kind; re: RegExp }> = [
    { kind: 'image', re: /!\[[^\]]*\]\(([^)]+)\)/g },
    { kind: 'video', re: /\[(?:vídeo|video)\]\(([^)]+)\)/gi },
    { kind: 'audio', re: /\[(?:áudio|audio)\]\(([^)]+)\)/gi },
  ];
  for (const { kind, re } of patterns) {
    text = text.replace(re, (_m, url) => {
      attached.push({ kind, url: String(url) });
      return '';
    });
  }
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), attached };
}

function mergeAttached(...groups: Attached[][]): Attached[] {
  const seen = new Set<string>();
  const merged: Attached[] = [];
  for (const item of groups.flat()) {
    const key = `${item.kind}|${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

interface InitialTopic {
  id: string;
  title: string;
  body?: string | null;
  is_adult?: boolean | null;
  channel_id?: string | null;
}

export function CreateTopicModal({
  open,
  onOpenChange,
  communityId,
  defaultChannelId,
  mode = 'create',
  initialTopic,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  communityId: string;
  defaultChannelId?: string | null;
  mode?: 'create' | 'edit';
  initialTopic?: InitialTopic | null;
}) {
  const isEdit = mode === 'edit' && !!initialTopic;
  const { data: persistedMediaData } = useCommunityTopicMedia(isEdit ? initialTopic?.id : undefined);

  const initial = useMemo(() => {
    if (isEdit) {
      const parsed = parseBodyMedia(initialTopic!.body);
      const structured = (persistedMediaData ?? []).map((m) => ({
        kind: m.kind,
        url: m.url,
        coverUrl: m.cover_url ?? null,
      }));
      return {
        title: initialTopic!.title || '',
        body: parsed.text,
        isAdult: !!initialTopic!.is_adult,
        channelId: initialTopic!.channel_id ?? null,
        attached: mergeAttached(parsed.attached, structured),
      };
    }
    return {
      title: '',
      body: '',
      isAdult: false,
      channelId: defaultChannelId ?? null,
      attached: [] as Attached[],
    };
  }, [isEdit, initialTopic, defaultChannelId, persistedMediaData]);

  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [isAdult, setIsAdult] = useState(initial.isAdult);
  const [channelId, setChannelId] = useState<string | null>(initial.channelId);
  const [attached, setAttached] = useState<Attached[]>(initial.attached);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  // Estado do seletor de capa do vídeo
  const [coverPicker, setCoverPicker] = useState<{
    videoUrl: string;
    frames: FrameCandidate[];
    selectedIdx: number;
    loading: boolean;
    scrubTime: number;     // tempo da scrub-bar (segundos)
    capturing: boolean;    // capturando frame customizado
  } | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);


  // Reset/rehydrate quando abrir ou trocar de tópico em edição.
  useEffect(() => {
    if (!open) return;
    setTitle(initial.title);
    setBody(initial.body);
    setIsAdult(initial.isAdult);
    setChannelId(initial.channelId);
    setAttached(initial.attached);
    setCoverPicker(null);
  }, [open, initial]);

  const create = useCreateTopic(communityId);
  const update = useUpdateTopic(communityId);
  const upload = useUploadCommunityMedia();
  const { data: settings } = useCommunitySettings();
  const { data: channels = [] } = useCommunityChannels(communityId);

  const anyUploading = attached.some((a) => a.uploading);
  const pending = create.isPending || update.isPending;
  const canSubmit = title.trim().length >= 3 && !pending && !uploadingCover && !anyUploading;


  // Mídia: sempre liberadas na UI do modal. Imagem/vídeo/áudio são
  // suportados por padrão; settings da comunidade só afetam moderação.
  const allowVideos = true;
  const allowAudio = true;
  const allowImages = true;



  const hasVideoOrAudio = attached.some((a) => a.kind !== 'image');
  const imageCount = attached.filter((a) => a.kind === 'image').length;
  const canAddMore = !hasVideoOrAudio && imageCount < MAX_IMAGES;

  const accept = [
    allowImages ? 'image/*' : null,
    !attached.length && allowAudio ? 'audio/*' : null,
  ].filter(Boolean).join(',');

  // Após anexar um vídeo, abre o seletor de frames automaticamente.
  const openCoverPicker = async (videoUrl: string) => {
    setCoverPicker({ videoUrl, frames: [], selectedIdx: 0, loading: true, scrubTime: 0, capturing: false });
    try {
      const frames = await extractVideoFramesCandidates(videoUrl, {
        count: 10,
        maxWidth: 480,
        quality: 0.7,
      });
      setCoverPicker((cur) => (cur && cur.videoUrl === videoUrl
        ? { ...cur, frames, loading: false, scrubTime: frames[0]?.time ?? 0 }
        : cur));
    } catch {
      setCoverPicker((cur) => (cur && cur.videoUrl === videoUrl
        ? { ...cur, loading: false }
        : cur));
    }
  };


  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let nextImageCount = imageCount;
    let nextHasVideoOrAudio = hasVideoOrAudio;
    for (const f of Array.from(files)) {
      const kind = detectKind(f);
      if (!kind) continue;
      if (kind === 'image' && !allowImages) continue;
      if (kind === 'video' && !allowVideos) continue;
      if (kind === 'audio' && !allowAudio) continue;
      if (f.size > MAX_BYTES[kind]) continue;
      if (kind !== 'image' && attached.length > 0) continue;
      if (kind !== 'image' && nextImageCount > 0) continue;
      if (kind === 'image' && nextHasVideoOrAudio) continue;
      if (kind === 'image' && nextImageCount >= MAX_IMAGES) break;

      // 1) Preview imediato com object URL local + barra de progresso.
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const localUrl = URL.createObjectURL(f);
      setAttached((prev) => [...prev, {
        kind, url: localUrl, uploading: true, progress: 4, tempId,
      }]);

      // 2) Progresso simulado em tempo real (avança até 92% conforme o tempo
      //    estimado pelo tamanho do arquivo; finaliza em 100% no onSuccess).
      const estMs = Math.min(20000, Math.max(1500, f.size / 80)); // ~80 B/ms
      const start = Date.now();
      const tick = window.setInterval(() => {
        const pct = Math.min(92, 4 + ((Date.now() - start) / estMs) * 88);
        setAttached((prev) => prev.map((a) =>
          a.tempId === tempId ? { ...a, progress: pct } : a,
        ));
      }, 120);

      try {
        const { url } = await upload.mutateAsync(f);
        window.clearInterval(tick);
        setAttached((prev) => prev.map((a) =>
          a.tempId === tempId
            ? { ...a, url, uploading: false, progress: 100, tempId: undefined }
            : a,
        ));
        try { URL.revokeObjectURL(localUrl); } catch { /* noop */ }
        if (kind === 'video') {
          // Dispara o seletor de capa (10 frames) em paralelo.
          openCoverPicker(url);
        }
        if (kind !== 'image') {
          nextHasVideoOrAudio = true;
          break;
        }
        nextImageCount += 1;
      } catch {
        window.clearInterval(tick);
        setAttached((prev) => prev.filter((a) => a.tempId !== tempId));
        try { URL.revokeObjectURL(localUrl); } catch { /* noop */ }
      }
    }
    if (fileRef.current) fileRef.current.value = '';
    if (videoFileRef.current) videoFileRef.current.value = '';
  };

  const removeAt = (idx: number) => {
    setAttached((prev) => {
      const removed = prev[idx];
      if (removed?.kind === 'video') setCoverPicker(null);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Captura um quadro customizado no tempo escolhido pela scrub-bar
  // e o adiciona à grade de candidatos como nova capa selecionável.
  const captureCustomFrame = async () => {
    if (!coverPicker || coverPicker.capturing) return;
    setCoverPicker((cur) => cur ? { ...cur, capturing: true } : cur);
    try {
      const frame = await captureVideoFrameAt(coverPicker.videoUrl, coverPicker.scrubTime, {
        maxWidth: 480,
        quality: 0.75,
      });
      if (frame) {
        setCoverPicker((cur) => {
          if (!cur) return cur;
          const frames = [...cur.frames, frame];
          return { ...cur, frames, selectedIdx: frames.length - 1, capturing: false };
        });
      } else {
        setCoverPicker((cur) => cur ? { ...cur, capturing: false } : cur);
      }
    } catch {
      setCoverPicker((cur) => cur ? { ...cur, capturing: false } : cur);
    }
  };



  const confirmCover = async () => {
    if (!coverPicker || coverPicker.loading || !coverPicker.frames.length) {
      setCoverPicker(null);
      return;
    }
    const frame = coverPicker.frames[coverPicker.selectedIdx];
    if (!frame) { setCoverPicker(null); return; }
    setUploadingCover(true);
    try {
      const file = dataUrlToFile(frame.dataUrl, `cover-${Date.now()}.jpg`);
      if (!file) throw new Error('frame_invalid');
      const { url: coverUrl } = await upload.mutateAsync(file);
      setAttached((prev) => prev.map((a) =>
        a.kind === 'video' && a.url === coverPicker.videoUrl
          ? { ...a, coverUrl }
          : a,
      ));
    } catch { /* hook trata */ }
    finally {
      setUploadingCover(false);
      setCoverPicker(null);
    }
  };

  const buildMediaPayload = (a: Attached | undefined) => {
    if (!a) return null;
    const base: any = { kind: a.kind, url: a.url, cover_url: a.coverUrl ?? null };
    if (a.kind === 'video') {
      if (a.trimStart != null && a.trimStart > 0) base.trim_start_seconds = a.trimStart;
      if (a.trimEnd != null) base.trim_end_seconds = a.trimEnd;
      base.outro_url = DEFAULT_OUTRO_URL;
    }
    return base;
  };

  // Garante que todo vídeo anexado tenha cover_url ANTES de publicar.
  // Se o usuário não escolheu capa, capturamos um frame automaticamente
  // (1s ou 1/3 da duração) e fazemos upload — para o listing nunca
  // exibir o quadro preto com ícone.
  const ensureAutoCovers = async (list: Attached[]): Promise<Attached[]> => {
    const out: Attached[] = [];
    for (const a of list) {
      if (a.kind !== 'video' || a.coverUrl || a.uploading) { out.push(a); continue; }
      try {
        const t = a.duration && a.duration > 0
          ? Math.min(1, Math.max(0.2, a.duration / 3))
          : 0.5;
        const frame = await captureVideoFrameAt(a.url, t, { maxWidth: 480, quality: 0.7 });
        const file = frame ? dataUrlToFile(frame.dataUrl, `cover-${Date.now()}.jpg`) : null;
        if (!file) { out.push(a); continue; }
        const { url: coverUrl } = await upload.mutateAsync(file);
        out.push({ ...a, coverUrl });
      } catch { out.push(a); }
    }
    return out;
  };

  const handleSubmit = async () => {
    setUploadingCover(true);
    let finalAttached: Attached[] = attached;
    try {
      finalAttached = await ensureAutoCovers(attached);
      if (finalAttached !== attached) setAttached(finalAttached);
    } finally {
      setUploadingCover(false);
    }
    const mediaMd = finalAttached.map(toMarkdown).join('\n\n');
    const trimmed = body.trim();
    const fullBody = mediaMd
      ? `${trimmed}${trimmed ? '\n\n' : ''}${mediaMd}`
      : (trimmed || undefined);

    try {
      if (isEdit) {
        await update.mutateAsync({
          topic_id: initialTopic!.id,
          title: title.trim(),
          body: fullBody ?? null,
          is_adult: isAdult,
          channel_id: channelId,
          media: buildMediaPayload(finalAttached[0]),
        });
      } else {
        await create.mutateAsync({
          title: title.trim(),
          body: fullBody,
          is_adult: isAdult,
          channel_id: channelId,
          media: buildMediaPayload(finalAttached[0]),
        });
      }
      onOpenChange(false);
      if (!isEdit) {
        setTitle(''); setBody(''); setIsAdult(false); setAttached([]);
        setChannelId(defaultChannelId ?? null);
      }
    } catch {/* hook trata */}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-0.75rem)] sm:w-full max-w-md max-h-[calc(100dvh-0.75rem)] p-0 overflow-hidden rounded-xl flex flex-col gap-0">
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2 border-b border-border/50">
          <DialogTitle>{isEdit ? 'Editar tópico' : 'Novo tópico'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div>
            <Label className="text-xs">Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Sobre o que você quer conversar?" />
          </div>
          {channels.length > 0 && (
            <div>
              <Label className="text-xs">Canal</Label>
              <select
                value={channelId ?? ''}
                onChange={(e) => setChannelId(e.target.value || null)}
                className="w-full min-h-9 px-2 py-2 rounded-md border border-input bg-background text-sm whitespace-normal break-words"
              >
                <option value="">Sem canal</option>
                {channels.filter((c) => !c.is_archived).map((c) => (
                  <option key={c.id} value={c.id}># {c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label className="text-xs">Conteúdo (opcional)</Label>
            <MentionTextarea
              communityId={communityId}
              value={body}
              onChange={setBody}
              rows={6}
              maxLength={16000}
              placeholder="Escreva mais detalhes… use @ para mencionar membros"
            />
          </div>

          {attached.length > 0 && (
            <div className="grid grid-cols-2 min-[380px]:grid-cols-3 gap-2">
              {attached.map((a, idx) => (
                <div
                  key={`${a.url}-${idx}`}
                  className="relative aspect-square rounded-lg overflow-hidden border border-border bg-black/40"
                >
                  {a.kind === 'image' && (
                    <img src={a.url} alt="" className="w-full h-full object-cover" />
                  )}
                  {a.kind === 'video' && (
                    a.coverUrl ? (
                      <img src={a.coverUrl} alt="Capa" className="w-full h-full object-cover" />
                    ) : (
                      <video
                        src={a.url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )
                  )}
                  {a.kind === 'audio' && (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="h-8 w-8 text-emerald-400" />
                    </div>
                  )}
                  {a.kind === 'video' && (
                    <>
                      <span className="absolute inset-0 grid place-items-center pointer-events-none">
                        <span className="h-9 w-9 grid place-items-center rounded-full bg-black/55 ring-1 ring-white/40">
                          <Video className="h-4 w-4 text-white" />
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openCoverPicker(a.url)}
                        className="absolute bottom-1 left-1 right-9 text-[10px] font-semibold bg-black/70 text-white rounded px-2 py-1 hover:bg-black/90"
                        aria-label="Escolher capa do vídeo"
                      >
                        <Film className="h-3 w-3 inline mr-1" />
                        {a.coverUrl ? 'Trocar capa' : 'Escolher capa'}
                      </button>
                    </>
                  )}
                  {/* Barra de carregamento em tempo real */}
                  {a.uploading && (
                    <div className="absolute inset-x-0 bottom-0 z-10 bg-black/70 backdrop-blur-sm px-2 py-1.5">
                      <div className="flex items-center justify-between text-[9px] text-white/90 mb-1">
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          Enviando…
                        </span>
                        <span className="font-mono">{Math.round(a.progress ?? 0)}%</span>
                      </div>
                      <div className="h-1 w-full rounded-full bg-white/15 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-fuchsia-400 to-pink-500 transition-[width] duration-150"
                          style={{ width: `${Math.min(100, Math.max(0, a.progress ?? 0))}%` }}
                        />
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 flex items-center justify-center z-20"
                    aria-label="Remover"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Painel de corte do vídeo (trim) — só aparece quando há vídeo anexado e já carregado */}
          {(() => {
            const vIdx = attached.findIndex((a) => a.kind === 'video' && !a.uploading);
            if (vIdx < 0) return null;
            const v = attached[vIdx];
            const dur = v.duration ?? 0;
            const start = v.trimStart ?? 0;
            const end = v.trimEnd ?? dur;
            const updateAtt = (patch: Partial<Attached>) => {
              setAttached((prev) => prev.map((a, i) => (i === vIdx ? { ...a, ...patch } : a)));
            };
            return (
              <div className="rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-fuchsia-200">
                  <Scissors className="h-3.5 w-3.5" />
                  Cortar vídeo {dur > 0 && (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {start.toFixed(1)}s → {end.toFixed(1)}s · {(end - start).toFixed(1)}s
                    </span>
                  )}
                </div>
                <video
                  src={v.url}
                  className="w-full rounded-md bg-black aspect-video object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const el = e.currentTarget;
                    if (isFinite(el.duration) && (v.duration == null || Math.abs((v.duration ?? 0) - el.duration) > 0.05)) {
                      updateAtt({ duration: el.duration, trimStart: 0, trimEnd: el.duration });
                    }
                  }}
                />
                {dur > 0 && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Início</Label>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, dur - 0.1)}
                        step={0.1}
                        value={start}
                        onChange={(e) => {
                          const ns = Math.min(Number(e.target.value), (v.trimEnd ?? dur) - 0.5);
                          updateAtt({ trimStart: Math.max(0, ns) });
                        }}
                        className="w-full accent-fuchsia-500"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Fim</Label>
                      <input
                        type="range"
                        min={0.1}
                        max={dur}
                        step={0.1}
                        value={end}
                        onChange={(e) => {
                          const ne = Math.max(Number(e.target.value), (v.trimStart ?? 0) + 0.5);
                          updateAtt({ trimEnd: Math.min(dur, ne) });
                        }}
                        className="w-full accent-fuchsia-500"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      A marca OCULTO aparecerá nos últimos 2s do trecho selecionado.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}




          {canAddMore && (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept={accept || 'image/*'}
                multiple={allowImages}
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <input
                ref={videoFileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                {upload.isPending
                  ? 'Enviando…'
                  : attached.length > 0
                    ? `Adicionar mais imagens (${imageCount}/${MAX_IMAGES})`
                    : 'Anexar imagem ou áudio'}
              </Button>
              {allowVideos && attached.length === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/10"
                  onClick={() => videoFileRef.current?.click()}
                  disabled={upload.isPending}
                >
                  <Video className="h-4 w-4" />
                  Anexar vídeo (≤60MB)
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                {allowImages && (<span className="inline-flex items-center gap-1"><ImagePlus className="h-3 w-3" />Imagens ≤8MB (até {MAX_IMAGES})</span>)}
                {allowVideos && attached.length === 0 && (<span className="inline-flex items-center gap-1"><Video className="h-3 w-3" />Vídeo ≤60MB · capa selecionável</span>)}
                {allowAudio && attached.length === 0 && (<span className="inline-flex items-center gap-1"><Music className="h-3 w-3" />Áudio ≤20MB</span>)}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-border p-2">
            <Label className="text-xs">Conteúdo adulto (+18)</Label>
            <Switch checked={isAdult} onCheckedChange={setIsAdult} />
          </div>
        </div>
        <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/50 bg-background/95">
          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full min-h-10">
            {pending
              ? (isEdit ? 'Salvando…' : 'Publicando…')
              : (isEdit ? 'Salvar alterações' : 'Publicar tópico')}
          </Button>
        </div>
      </DialogContent>

      {/* Seletor de capa do vídeo — extrai frames no cliente */}
      <Dialog
        open={!!coverPicker}
        onOpenChange={(o) => { if (!o && !uploadingCover) setCoverPicker(null); }}
      >
        <DialogContent className="w-[calc(100vw-0.75rem)] sm:w-full max-w-md p-0 overflow-hidden rounded-xl flex flex-col gap-0">
          <DialogHeader className="shrink-0 px-4 pt-4 pb-2 border-b border-border/50">
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-4 w-4 text-fuchsia-400" />
              Escolha a capa do vídeo
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 px-4 py-3 space-y-3 overflow-y-auto overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {coverPicker?.loading && (
              <div className="py-10 grid place-items-center text-muted-foreground gap-2 text-sm">
                <Loader2 className="h-6 w-6 animate-spin" />
                Extraindo quadros do vídeo…
              </div>
            )}
            {coverPicker && !coverPicker.loading && coverPicker.frames.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Não foi possível extrair quadros. Use a barra abaixo para escolher o momento exato da capa.
              </p>
            )}

            {/* Preview do vídeo + scrub-bar em tempo real para captura customizada */}
            {coverPicker && !coverPicker.loading && (
              <div className="space-y-2 rounded-lg border border-border/70 bg-black/40 p-2">
                <div className="relative aspect-video rounded-md overflow-hidden bg-black">
                  <video
                    key={coverPicker.videoUrl}
                    src={coverPicker.videoUrl}
                    className="w-full h-full object-contain"
                    muted
                    playsInline
                    preload="metadata"
                    crossOrigin="anonymous"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (coverPicker && coverPicker.scrubTime > 0) {
                        try { v.currentTime = coverPicker.scrubTime; } catch { /* noop */ }
                      }
                    }}
                    ref={(el) => {
                      if (!el || !coverPicker) return;
                      // Sincroniza o tempo do vídeo com o slider em tempo real
                      const target = coverPicker.scrubTime;
                      if (Math.abs((el.currentTime ?? 0) - target) > 0.08 && isFinite(el.duration)) {
                        try { el.currentTime = Math.min(el.duration - 0.05, Math.max(0, target)); } catch { /* noop */ }
                      }
                    }}
                  />
                  <span className="absolute bottom-1 right-1 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">
                    {coverPicker.scrubTime.toFixed(2)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={(() => {
                    const last = coverPicker.frames[coverPicker.frames.length - 1]?.time ?? 1;
                    const max = Math.max(last, coverPicker.scrubTime, 1);
                    return Math.round((coverPicker.scrubTime / max) * 1000);
                  })()}
                  onChange={(e) => {
                    const ratio = Number(e.target.value) / 1000;
                    const last = coverPicker.frames[coverPicker.frames.length - 1]?.time ?? 1;
                    const max = Math.max(last, 1);
                    setCoverPicker((cur) => cur ? { ...cur, scrubTime: ratio * max } : cur);
                  }}
                  className="w-full accent-fuchsia-500 cursor-pointer"
                  aria-label="Selecionar momento do vídeo para capa"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/10 gap-2"
                  onClick={captureCustomFrame}
                  disabled={coverPicker.capturing}
                >
                  {coverPicker.capturing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                  {coverPicker.capturing ? 'Capturando…' : 'Capturar este momento como capa'}
                </Button>
              </div>
            )}

            {coverPicker && coverPicker.frames.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {coverPicker.frames.map((f, idx) => {
                  const selected = idx === coverPicker.selectedIdx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCoverPicker((cur) => cur ? { ...cur, selectedIdx: idx, scrubTime: f.time } : cur)}
                      className={cn(
                        'relative aspect-video rounded-lg overflow-hidden border-2 transition-all bg-black',
                        selected ? 'border-fuchsia-500 ring-2 ring-fuchsia-500/30 scale-[0.98]' : 'border-border hover:border-fuchsia-400/60',
                      )}
                      aria-label={`Quadro ${idx + 1}`}
                    >
                      <img
                        src={f.dataUrl}
                        alt={`Quadro ${idx + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="absolute bottom-1 left-1 text-[9px] bg-black/70 text-white px-1 py-0.5 rounded">
                        {f.time.toFixed(1)}s
                      </span>
                      {selected && (
                        <span className="absolute top-1 right-1 h-5 w-5 grid place-items-center rounded-full bg-fuchsia-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

          </div>
          <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/50 bg-background/95 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => { if (!uploadingCover) setCoverPicker(null); }}
              disabled={uploadingCover}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={confirmCover}
              disabled={uploadingCover || coverPicker?.loading || (coverPicker?.frames.length ?? 0) === 0}
            >
              {uploadingCover ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {uploadingCover ? 'Salvando…' : 'Usar esta capa'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
