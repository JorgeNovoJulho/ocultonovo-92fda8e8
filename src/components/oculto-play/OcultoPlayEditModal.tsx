/**
 * OcultoPlayEditModal — modal de edição do criador.
 * Pré-preenche TODOS os campos com o último estado salvo no banco externo
 * (refetch ao abrir). Espelha as opções do modal de upload para áudio:
 * capa, título, legenda, compositor, IA, estilos, visibilidade e preview
 * (início + duração até 30s) com player de prévia.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ImagePlus, Play, Pause, Globe, Star, Crown, Flame, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import type { OcultoPlayItem as OPItem } from '@/hooks/useOcultoPlayContent';
import { upsertOcultoPlayFeedItem } from '@/hooks/useOcultoPlayContent';
import { uploadOcultoPlayFileProgress } from '@/hooks/useOcultoPlayUpload';
import { AudioTagPicker } from './AudioTagPicker';
import { OcultoPlayLinkComposer, type OcultoPlayLinkComposerValue } from './OcultoPlayLinkComposer';
import { useOcultoPlayAudioTags, type AudioTag } from '@/hooks/useOcultoPlayAudioTags';
import { useOcultoPlayMovieGenres, useUpsertMovieGenre, readLocalMovieGenresCache } from '@/hooks/useOcultoPlayMovieGenres';
import { cn } from '@/lib/utils';
import {
  LYRICS_MAX_CHARS,
  validateLyricsFile,
  validateLyricsText,
  readLyricsFile,
  pickLyricsFileFromDataTransfer,
} from '@/lib/ocultoPlayLyricsValidation';
import {
  setLyricsAutosaveStatus,
  resetLyricsAutosave,
  formatLastSavedTime,
} from '@/lib/ocultoPlayLyricsAutosave';


interface Props {
  item: OPItem | null;
  open: boolean;
  onClose: () => void;
}

type Visibility = 'public' | 'premium' | 'vip';

const VIS_OPTIONS: { id: Visibility; label: string; Icon: typeof Globe }[] = [
  { id: 'public',  label: 'Público',  Icon: Globe },
  { id: 'premium', label: 'Premium',  Icon: Star },
  { id: 'vip',     label: 'VIP',      Icon: Crown },
];

export function OcultoPlayEditModal({ item, open, onClose }: Props) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [composer, setComposer] = useState('');
  const [aiTool, setAiTool] = useState('');
  const [genres, setGenres] = useState<AudioTag[]>([]);
  const [, setAiTags] = useState<AudioTag[]>([]);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [originalThumbUrl, setOriginalThumbUrl] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [loadingFresh, setLoadingFresh] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lyrics, setLyrics] = useState('');
  const [lyricsAutosave, setLyricsAutosaveLocal] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [lyricsLastSavedAt, setLyricsLastSavedAt] = useState<number | null>(null);
  const lyricsBaselineRef = useRef<string>('');
  const lyricsSavedRef = useRef<string>('');
  const lyricsAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushLyricsRef = useRef<() => Promise<void>>(async () => {});

  // Publica status localmente + no store global (para o player ouvir em tempo real)
  const setLyricsAutosave = (
    status: 'idle' | 'pending' | 'saving' | 'saved' | 'error',
    savedAt?: number | null,
  ) => {
    setLyricsAutosaveLocal(status);
    if (savedAt !== undefined) setLyricsLastSavedAt(savedAt);
    if (item?.id) {
      setLyricsAutosaveStatus(item.id, status, savedAt !== undefined ? { lastSavedAt: savedAt } : undefined);
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Preview de áudio
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [previewStart, setPreviewStart] = useState<number>(0);
  const [previewLength, setPreviewLength] = useState<number>(30);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewStartRef = useRef(previewStart);
  const previewLengthRef = useRef(previewLength);
  useEffect(() => { previewStartRef.current = previewStart; }, [previewStart]);
  useEffect(() => { previewLengthRef.current = previewLength; }, [previewLength]);

  const isAudio = item?.kind === 'audio';
  const isLink = item?.kind === 'link';
  const tagsQuery = useOcultoPlayAudioTags('genre');
  const aiQuery = useOcultoPlayAudioTags('ai');

  // Estado específico para itens de link (URL + escolha de capa).
  const [linkValue, setLinkValue] = useState<OcultoPlayLinkComposerValue>({
    sourceUrl: '', provider: null, coverBlob: null, coverRemoteUrl: null,
  });
  const [originalSourceUrl, setOriginalSourceUrl] = useState<string>('');

  // Link: tags de gênero (fixas + personalizadas no BANCO, compartilhadas) e flag +18.
  const FIXED_LINK_GENRES = ['Ação', 'Ficção', 'Comédia', 'Fantasia', 'Drama', 'Terror', 'Documentário', 'Podcast', 'Animação'];
  const movieGenresQuery = useOcultoPlayMovieGenres();
  const upsertMovieGenre = useUpsertMovieGenre();
  const linkGenreCustomList = (movieGenresQuery.data ?? readLocalMovieGenresCache().map((n) => ({ name: n } as any)))
    .map((g: any) => g.name as string);
  const [linkGenreTags, setLinkGenreTags] = useState<string[]>([]);
  const [linkGenreInput, setLinkGenreInput] = useState('');
  const [isAdult, setIsAdult] = useState(false);

  // Preenche com dados do item + refetch fresh do banco ao abrir
  useEffect(() => {
    if (!item || !open) return;
    setErrors({});
    setTitle(item.title ?? '');
    setCaption(item.caption ?? '');
    setComposer(item.composer_name ?? '');
    setAiTool(item.ai_tool ?? '');
    setVisibility(((item as any).visibility as Visibility) ?? 'public');
    setThumbUrl(item.thumb_url ?? null);
    setOriginalThumbUrl(item.thumb_url ?? null);
    {
      const initLyrics = ((item as any).lyrics as string) ?? '';
      setLyrics(initLyrics);
      lyricsBaselineRef.current = initLyrics;
      lyricsSavedRef.current = initLyrics;
      setLyricsAutosave('idle');
    }

    setAudioDuration((item as any).duration_sec ?? 0);
    const ps = Number((item as any).preview_start_seconds ?? 0) || 0;
    const pe = Number((item as any).preview_end_seconds ?? 0) || 0;
    setPreviewStart(ps);
    setPreviewLength(pe > ps ? Math.min(30, pe - ps) : 30);
    const all = tagsQuery.data ?? [];
    const initial = (item.genre_tags ?? [])
      .map((name) => all.find((t) => t.name === name || t.slug === name))
      .filter(Boolean) as AudioTag[];
    setGenres(initial);
    const allAi = aiQuery.data ?? [];
    const initialAi = item.ai_tool
      ? ([allAi.find((t) => t.name === item.ai_tool || t.slug === item.ai_tool)].filter(Boolean) as AudioTag[])
      : [];
    setAiTags(initialAi);

    // Inicializa estado de link a partir do item carregado
    {
      const src = String((item as any).source_url ?? (item as any).media_url ?? '');
      setOriginalSourceUrl(src);
      setLinkValue({
        sourceUrl: src,
        provider: ((item as any).link_provider ?? null) as any,
        coverBlob: null,
        coverRemoteUrl: null,
      });
    }

    // Inicializa tags de gênero do link + flag +18 a partir do item
    setLinkGenreTags(Array.isArray(item.genre_tags) ? [...item.genre_tags] : []);
    setIsAdult((item as any).is_adult === true);
    setLinkGenreInput('');

    // Busca o estado mais recente direto do banco
    (async () => {
      setLoadingFresh(true);
      try {
        const { data, error } = await supabase
          .from('oculto_play_items')
          .select('title, caption, composer_name, ai_tool, genre_tags, thumb_url, visibility, preview_start_seconds, preview_end_seconds, duration_sec, audio_url, lyrics, source_url, link_provider, media_url, is_adult')
          .eq('id', item.id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          const d = data as any;
          setTitle(d.title ?? '');
          setCaption(d.caption ?? '');
          setComposer(d.composer_name ?? '');
          setAiTool(d.ai_tool ?? '');
          setVisibility((d.visibility as Visibility) ?? 'public');
          setThumbUrl(d.thumb_url ?? null);
          setOriginalThumbUrl(d.thumb_url ?? null);
          {
            const freshLyrics = typeof d.lyrics === 'string' ? d.lyrics : ((d.lyrics ?? '') as string);
            setLyrics(freshLyrics);
            lyricsBaselineRef.current = freshLyrics;
            lyricsSavedRef.current = freshLyrics;
            setLyricsAutosave('idle');
          }

          setAudioDuration(d.duration_sec ?? 0);
          const ps2 = Number(d.preview_start_seconds ?? 0) || 0;
          const pe2 = Number(d.preview_end_seconds ?? 0) || 0;
          setPreviewStart(ps2);
          setPreviewLength(pe2 > ps2 ? Math.min(30, pe2 - ps2) : 30);
          const allTags = tagsQuery.data ?? [];
          const fresh = (d.genre_tags ?? [])
            .map((name: string) => allTags.find((t) => t.name === name || t.slug === name))
            .filter(Boolean) as AudioTag[];
          setGenres(fresh);
          const allAi2 = aiQuery.data ?? [];
          const ai2 = d.ai_tool
            ? ([allAi2.find((t) => t.name === d.ai_tool || t.slug === d.ai_tool)].filter(Boolean) as AudioTag[])
            : [];
          setAiTags(ai2);

          // Tags de gênero e flag +18 (todas as mídias podem ser +18)
          setLinkGenreTags(Array.isArray(d.genre_tags) ? [...d.genre_tags] : []);
          setIsAdult(d.is_adult === true);

          if (isLink) {
            const freshUrl = String(d.source_url ?? d.media_url ?? '');
            setOriginalSourceUrl(freshUrl);
            setLinkValue((prev) => ({
              ...prev,
              sourceUrl: freshUrl,
              provider: (d.link_provider ?? prev.provider) as any,
            }));
          }
        }
      } catch {
        /* mantém valores do item */
      } finally {
        setLoadingFresh(false);
      }
    })();
  }, [item, open, tagsQuery.data, aiQuery.data]);

  // Prepara áudio de prévia (URL remota do item)
  const audioSrc = useMemo(() => (item as any)?.audio_url ?? null, [item]);
  useEffect(() => {
    if (!open || !isAudio || !audioSrc) {
      try { previewAudioRef.current?.pause(); } catch { /* noop */ }
      previewAudioRef.current = null;
      setPreviewPlaying(false);
      return;
    }
    const a = new Audio();
    // Força carregar a MÚSICA COMPLETA para o usuário poder selecionar o trecho
    // de preview com precisão (scrubbing instantâneo, sem espera por buffer).
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
    a.src = audioSrc;
    const captureDuration = () => {
      if (a.duration && isFinite(a.duration) && a.duration > 0) {
        setAudioDuration(a.duration);
      }
    };
    a.addEventListener('loadedmetadata', captureDuration);
    a.addEventListener('durationchange', captureDuration);
    a.addEventListener('canplaythrough', captureDuration);
    a.addEventListener('timeupdate', () => {
      const end = previewStartRef.current + previewLengthRef.current;
      if (a.currentTime >= end) {
        try { a.pause(); } catch { /* noop */ }
        setPreviewPlaying(false);
      }
    });
    a.addEventListener('pause', () => setPreviewPlaying(false));
    a.addEventListener('ended', () => setPreviewPlaying(false));
    previewAudioRef.current = a;
    try { a.load(); } catch { /* noop */ }
    return () => {
      try { a.pause(); } catch { /* noop */ }
      previewAudioRef.current = null;
    };
  }, [open, isAudio, audioSrc]);

  const togglePreview = () => {
    const a = previewAudioRef.current;
    if (!a) return;
    if (previewPlaying) {
      try { a.pause(); } catch { /* noop */ }
      setPreviewPlaying(false);
    } else {
      try { a.currentTime = previewStart; } catch { /* noop */ }
      a.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false));
    }
  };

  const handlePickCover = () => fileInputRef.current?.click();

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !item) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Imagem muito grande (máx. 8MB).');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setThumbUrl(previewUrl);
    setThumbUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error('sem sessão');
      const { publicUrl } = await uploadOcultoPlayFileProgress(file, uid, 'image', file.name);
      URL.revokeObjectURL(previewUrl);
      setThumbUrl(publicUrl);
      toast.success('Capa pronta — clique Salvar para confirmar.');
    } catch (err: any) {
      URL.revokeObjectURL(previewUrl);
      setThumbUrl(originalThumbUrl);
      toast.error('Falha no upload da capa', { description: err?.message });
    } finally {
      setThumbUploading(false);
    }
  };

  const handleRevertCover = () => setThumbUrl(originalThumbUrl);

  /* ---------------- Autosave da letra (debounce 900ms) ---------------- */
  useEffect(() => {
    if (!open || !item || !isAudio) {
      flushLyricsRef.current = async () => {};
      return;
    }
    // Sem mudança em relação ao último valor persistido → nada a salvar.
    if (lyrics === lyricsSavedRef.current) {
      if (lyricsAutosave !== 'saving') setLyricsAutosave(lyricsLastSavedAt ? 'saved' : 'idle');
      flushLyricsRef.current = async () => {};
      return;
    }
    setLyricsAutosave('pending');
    if (lyricsAutosaveTimerRef.current) clearTimeout(lyricsAutosaveTimerRef.current);

    const performSave = async () => {
      if (lyricsAutosaveTimerRef.current) {
        clearTimeout(lyricsAutosaveTimerRef.current);
        lyricsAutosaveTimerRef.current = null;
      }
      const snapshot = lyrics;
      if (snapshot === lyricsSavedRef.current) return;
      const lyricsValue = snapshot.trim() ? snapshot : null;
      setLyricsAutosave('saving');
      try {
        const { error } = await supabase
          .from('oculto_play_items')
          .update({ lyrics: lyricsValue } as any)
          .eq('id', item.id);
        if (error) throw error;
        lyricsSavedRef.current = snapshot;
        upsertOcultoPlayFeedItem(qc, { ...(item as any), lyrics: lyricsValue } as any);
        setLyricsAutosave('saved', Date.now());
      } catch {
        setLyricsAutosave('error');
      }
    };

    flushLyricsRef.current = performSave;
    lyricsAutosaveTimerRef.current = setTimeout(performSave, 900);
    return () => {
      if (lyricsAutosaveTimerRef.current) clearTimeout(lyricsAutosaveTimerRef.current);
    };
  }, [lyrics, open, item, isAudio, qc]);



  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const t = title.trim();
    if (!t) next.title = 'Informe um título.';
    else if (t.length < 2) next.title = 'Título muito curto (mín. 2 caracteres).';
    else if (t.length > 140) next.title = 'Título muito longo (máx. 140).';

    if (caption.trim().length > 500) next.caption = 'Legenda muito longa (máx. 500).';

    if (isAudio) {
      if (composer.trim().length > 80) next.composer = 'Nome muito longo (máx. 80).';
      if (aiTool.trim().length > 40) next.aiTool = 'Texto muito longo (máx. 40).';
      if (genres.length > 8) next.genres = 'Selecione no máximo 8 estilos.';
    }
    if (isLink) {
      const u = (linkValue.sourceUrl || '').trim();
      if (!u) next.linkUrl = 'Informe a URL do vídeo.';
      else if (!linkValue.provider) next.linkUrl = 'URL não suportada (use YouTube, Vimeo, TikTok ou .mp4).';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!item) return;
    if (!validate()) {
      toast.error('Verifique os campos destacados.');
      return;
    }
    setSaving(true);
    try {
      // 1) Para itens de link: resolve a nova capa (upload do blob OU URL remota sugerida).
      let nextThumbUrl: string | null = thumbUrl;
      if (isLink) {
        if (linkValue.coverBlob) {
          const { data: u } = await supabase.auth.getUser();
          const uid = u.user?.id;
          if (!uid) throw new Error('Sem sessão para upload da capa.');
          const file = linkValue.coverBlob instanceof File
            ? linkValue.coverBlob
            : new File([linkValue.coverBlob], `link_cover_${Date.now()}.jpg`, { type: 'image/jpeg' });
          const { publicUrl } = await uploadOcultoPlayFileProgress(file, uid, 'image', file.name);
          nextThumbUrl = publicUrl;
        } else if (linkValue.coverRemoteUrl) {
          nextThumbUrl = linkValue.coverRemoteUrl;
        }
      }

      const previewEnd = isAudio && audioDuration > 0
        ? Math.min(audioDuration, previewStart + previewLength)
        : null;
      const { data, error } = await supabase.rpc('oculto_play_update_item', {
        p_item_id: item.id,
        p_title: title.trim() || null,
        p_caption: caption.trim() || null,
        p_composer_name: isAudio ? (composer.trim() || null) : null,
        p_ai_tool: isAudio ? (aiTool.trim() || null) : null,
        p_genre_tags: isAudio ? genres.map((g) => g.name) : null,
        p_thumb_url: nextThumbUrl && nextThumbUrl !== originalThumbUrl ? nextThumbUrl : null,
        p_visibility: visibility,
        p_preview_start: isAudio ? Number(previewStart.toFixed(2)) : null,
        p_preview_end: previewEnd != null ? Number(previewEnd.toFixed(2)) : null,
      } as any);
      if (error) throw error;
      // Persiste letra da música (coluna direta — RPC pode não suportar p_lyrics)
      if (isAudio) {
        const lyricsValue = lyrics.trim() ? lyrics : null;
        const { error: lyricsErr } = await supabase
          .from('oculto_play_items')
          .update({ lyrics: lyricsValue } as any)
          .eq('id', item.id);
        if (lyricsErr) throw lyricsErr;
        lyricsSavedRef.current = lyrics;
        setLyricsAutosave('saved', Date.now());

      }
      // Para itens de link: persistir source_url, link_provider, gêneros, +18 e (defensivo) thumb_url.
      if (isLink) {
        const newUrl = (linkValue.sourceUrl || '').trim();
        const patch: Record<string, any> = {
          source_url: newUrl || null,
          media_url: newUrl || null,
          link_provider: linkValue.provider ?? null,
          genre_tags: linkGenreTags,
          is_adult: isAdult,
        };
        if (nextThumbUrl && nextThumbUrl !== originalThumbUrl) {
          patch.thumb_url = nextThumbUrl;
        }
        const { error: linkErr } = await supabase
          .from('oculto_play_items')
          .update(patch as any)
          .eq('id', item.id);
        if (linkErr) throw linkErr;
        setOriginalSourceUrl(newUrl);
      } else {
        // Para áudio/vídeo/meme: persistir somente o toggle +18 (genre_tags do áudio já segue via RPC)
        const { error: adultErr } = await supabase
          .from('oculto_play_items')
          .update({ is_adult: isAdult } as any)
          .eq('id', item.id);
        if (adultErr) throw adultErr;
      }
      if (nextThumbUrl !== thumbUrl) setThumbUrl(nextThumbUrl);
      if (nextThumbUrl !== originalThumbUrl) setOriginalThumbUrl(nextThumbUrl);
      if (data) {
        const merged = {
          ...(data as any),
          is_adult: isAdult,
          lyrics: isAudio ? (lyrics.trim() ? lyrics : null) : (data as any).lyrics,
          ...(isLink ? {
            source_url: (linkValue.sourceUrl || '').trim() || null,
            media_url: (linkValue.sourceUrl || '').trim() || null,
            link_provider: linkValue.provider ?? null,
            genre_tags: linkGenreTags,
            thumb_url: nextThumbUrl,
          } : {}),
        };
        upsertOcultoPlayFeedItem(qc, merged as any);
      }
      await qc.invalidateQueries({ queryKey: ['oculto-play'], refetchType: 'active' });
      toast.success('Conteúdo atualizado.');
      onClose();
    } catch (e: any) {
      toast.error('Falha ao salvar', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (saving) return;
    // Flush autosave pendente antes de fechar (evita perder alterações)
    if (lyricsAutosaveTimerRef.current || lyrics !== lyricsSavedRef.current) {
      try { await flushLyricsRef.current(); } catch { /* já reportado via status */ }
    }
    setThumbUrl(originalThumbUrl);
    try { previewAudioRef.current?.pause(); } catch { /* noop */ }
    onClose();
  };

  // Limpa status global quando o modal fecha (mantém lastSavedAt enquanto aberto)
  useEffect(() => {
    if (open || !item?.id) return;
    // pequeno delay para o player ainda mostrar “Salvo às HH:MM” se acabou de salvar
    const t = setTimeout(() => resetLyricsAutosave(item.id), 8000);
    return () => clearTimeout(t);
  }, [open, item?.id]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleCancel(); }}>
      <DialogContent
        className="p-0 gap-0 w-[calc(100vw-1rem)] sm:w-full max-w-lg max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden bg-card"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-2 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            Editar conteúdo
            {loadingFresh && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </DialogTitle>
        </DialogHeader>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-3 space-y-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Capa (genérica — para link há um seletor próprio abaixo) */}
          {!isLink && (
          <div>
            <Label className="text-xs">Capa</Label>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-20 h-20 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {thumbUrl ? (
                  <img src={thumbUrl} alt="capa" className="w-full h-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handlePickCover}
                    disabled={thumbUploading || saving}
                  >
                    {thumbUploading ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando…</>
                    ) : (
                      'Trocar capa'
                    )}
                  </Button>
                  {thumbUrl !== originalThumbUrl && !thumbUploading && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRevertCover} disabled={saving}>
                      Desfazer
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">JPG/PNG/WebP até 8MB.</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverFile} />
            </div>
          </div>
          )}

          {/* Link (URL + capa) — apenas para itens do tipo link */}
          {isLink && (
            <div>
              <OcultoPlayLinkComposer
                value={{ url: linkValue.sourceUrl }}
                currentThumbUrl={originalThumbUrl}
                onChange={(next) => {
                  setLinkValue(next);
                  if (errors.linkUrl) setErrors((p) => ({ ...p, linkUrl: '' }));
                }}
              />
              {errors.linkUrl && <p className="text-[11px] text-rose-400 mt-1">{errors.linkUrl}</p>}
              {originalSourceUrl && originalSourceUrl !== linkValue.sourceUrl && (
                <p className="text-[10px] text-amber-300 mt-1">URL alterada — clique em Salvar para confirmar.</p>
              )}
            </div>
          )}

          {/* Link: gêneros (fixos + personalizados) */}
          {isLink && (() => {
            const all = Array.from(new Set([...FIXED_LINK_GENRES, ...linkGenreCustomList]));
            const isFixed = (t: string) => FIXED_LINK_GENRES.some((f) => f.toLowerCase() === t.toLowerCase());
            const toggle = (name: string) => {
              setLinkGenreTags((prev) => {
                if (prev.some((p) => p.toLowerCase() === name.toLowerCase())) {
                  return prev.filter((t) => t.toLowerCase() !== name.toLowerCase());
                }
                if (prev.length >= 8) { toast.error('Máximo de 8 gêneros.'); return prev; }
                return [...prev, name];
              });
            };
            const removeSelected = (name: string) =>
              setLinkGenreTags((prev) => prev.filter((t) => t.toLowerCase() !== name.toLowerCase()));
            const removeCustom = (name: string) => {
              // Apenas remove a seleção atual; tags personalizadas vivem no banco
              // e são compartilhadas — não removemos do catálogo global daqui.
              setLinkGenreTags((prev) => prev.filter((t) => t.toLowerCase() !== name.toLowerCase()));
            };
            const addCustom = () => {
              const v = linkGenreInput.trim();
              if (!v) return;
              if (v.length > 24) { toast.error('Tag muito longa (máx. 24).'); return; }
              const existing = all.find((t) => t.toLowerCase() === v.toLowerCase());
              if (existing) {
                if (!linkGenreTags.some((t) => t.toLowerCase() === existing.toLowerCase())) toggle(existing);
                setLinkGenreInput('');
                return;
              }
              if (linkGenreTags.length < 8) setLinkGenreTags((prev) => [...prev, v]);
              setLinkGenreInput('');
              upsertMovieGenre.mutate(v, {
                onError: () => toast.error('Não foi possível salvar a tag no servidor.'),
              });
            };
            return (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <Label className="text-xs font-semibold text-emerald-100 block">
                  Gêneros do conteúdo (opcional)
                </Label>
                {linkGenreTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-1 border-b border-emerald-500/20">
                    {linkGenreTags.map((tag) => (
                      <span key={`sel-${tag}`} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium bg-emerald-500/80 text-black border border-emerald-300">
                        {tag}
                        <button type="button" onClick={() => removeSelected(tag)} className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-black/20" aria-label={`Remover ${tag}`}>
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {all.map((tag) => {
                    const active = linkGenreTags.some((t) => t.toLowerCase() === tag.toLowerCase());
                    const custom = !isFixed(tag);
                    return (
                      <span key={tag} className="relative inline-flex">
                        <button type="button" onClick={() => toggle(tag)}
                          className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium border transition', custom ? 'pr-6' : '',
                            active ? 'bg-emerald-500/80 text-black border-emerald-300' : 'bg-muted/40 text-foreground border-border/50 hover:border-emerald-400/60')}>
                          {tag}
                        </button>
                        {custom && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeCustom(tag); }}
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 inline-flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-rose-500/80"
                            aria-label={`Excluir ${tag}`} title="Excluir tag personalizada">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={linkGenreInput}
                    onChange={(e) => setLinkGenreInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                    placeholder="Outro gênero (ex.: suspense)"
                    maxLength={24}
                    className="flex-1 h-8 px-2 rounded-md bg-background border border-border/50 text-xs"
                  />
                  <button type="button" onClick={addCustom} disabled={!linkGenreInput.trim()}
                    className="h-8 px-3 rounded-md bg-emerald-500/80 text-black text-xs font-semibold disabled:opacity-50">
                    Adicionar
                  </button>
                </div>
              </div>
            );
          })()}

          {/* +18 toggle (todas as mídias) */}
          <button
            type="button"
            onClick={() => setIsAdult((v) => !v)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all shadow-sm',
              isAdult
                ? 'border-rose-300/70 bg-gradient-to-r from-rose-600 via-red-600 to-rose-800 text-white shadow-rose-900/40'
                : 'border-rose-500/40 bg-gradient-to-r from-rose-950/80 via-red-950/70 to-rose-900/60 text-rose-50 hover:from-rose-900/80 hover:via-red-900/70 hover:to-rose-800/70',
            )}
            aria-pressed={isAdult}
          >
            <span className={cn(
              'h-8 w-8 shrink-0 rounded-full flex items-center justify-center',
              isAdult ? 'bg-white/20' : 'bg-rose-500/20',
            )}>
              <Flame className={cn('h-4 w-4', isAdult ? 'text-white' : 'text-rose-300')} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold tracking-wide">Conteúdo +18</p>
              <p className="text-[11px] font-medium opacity-90 leading-tight">
                {isAdult
                  ? 'Aparecerá somente na seção dedicada de Filmes +18.'
                  : 'Marque para enviar apenas para a seção +18.'}
              </p>
            </div>
            <span className={cn(
              'h-5 w-9 rounded-full relative transition-colors shrink-0 border',
              isAdult ? 'bg-white border-white/60' : 'bg-rose-950/60 border-rose-400/40',
            )}>
              <span className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full transition-all shadow',
                isAdult ? 'left-[1.125rem] bg-rose-600' : 'left-0.5 bg-rose-300',
              )} />
            </span>
          </button>




          <div>
            <Label className="text-xs">Título <span className="text-rose-400">*</span></Label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors((p) => ({ ...p, title: '' })); }}
              maxLength={140}
              aria-invalid={!!errors.title}
              className={errors.title ? 'border-rose-500 focus-visible:ring-rose-500' : ''}
            />
            {errors.title && <p className="text-[11px] text-rose-400 mt-1">{errors.title}</p>}
          </div>
          <div>
            <Label className="text-xs">{isLink ? 'Sinopse' : 'Legenda'}</Label>
            <Textarea
              value={caption}
              onChange={(e) => { setCaption(e.target.value); if (errors.caption) setErrors((p) => ({ ...p, caption: '' })); }}
              maxLength={500}
              rows={3}
              aria-invalid={!!errors.caption}
              className={errors.caption ? 'border-rose-500 focus-visible:ring-rose-500' : ''}
            />
            {errors.caption && <p className="text-[11px] text-rose-400 mt-1">{errors.caption}</p>}
          </div>

          {/* Visibilidade */}
          <div>
            <Label className="text-xs">Visibilidade</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {VIS_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setVisibility(id)}
                  className={cn(
                    'flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition-colors',
                    visibility === id
                      ? 'border-fuchsia-500/60 bg-fuchsia-500/15 text-white'
                      : 'border-border/40 text-muted-foreground hover:border-fuchsia-500/30',
                  )}
                  aria-pressed={visibility === id}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isAudio && (
            <>
              {/* Preview — seleção de trecho até 30s */}
              {/* Preview — sempre presente para itens de áudio.
                  Quando a duração ainda não foi detectada, usa fallback de 30s
                  e mostra indicação de carregamento; o usuário sempre consegue
                  definir início + duração do trecho. */}
              {(() => {
                const hasDuration = audioDuration > 0;
                const effDuration = hasDuration ? audioDuration : 30;
                const maxStart = Math.max(0, effDuration - 1);
                return (
                  <div className="rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-fuchsia-100 leading-tight flex items-center gap-1.5">
                        Preview (até 30s) — tocado ao clicar no card
                        {!hasDuration && <Loader2 className="h-3 w-3 animate-spin opacity-70" />}
                      </p>
                      <button
                        type="button"
                        onClick={togglePreview}
                        disabled={!audioSrc}
                        className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-fuchsia-500/90 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-[11px] font-semibold"
                      >
                        {previewPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" fill="currentColor" />}
                        {previewPlaying ? 'Pausar' : 'Tocar'}
                      </button>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Início</span>
                        <span className="tabular-nums">
                          {previewStart.toFixed(1)}s / {hasDuration ? Math.floor(effDuration) : '—'}s
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={maxStart}
                        step={0.1}
                        value={Math.min(previewStart, maxStart)}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(maxStart, Number(e.target.value)));
                          setPreviewStart(v);
                          const a = previewAudioRef.current;
                          if (a) { try { a.currentTime = v; } catch { /* noop */ } }
                        }}
                        onInput={(e) => {
                          const v = Math.max(0, Math.min(maxStart, Number((e.target as HTMLInputElement).value)));
                          const a = previewAudioRef.current;
                          if (a) { try { a.currentTime = v; } catch { /* noop */ } }
                        }}
                        className="w-full accent-fuchsia-500"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>Duração do preview</span>
                        <span className="tabular-nums">{previewLength}s</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={30}
                        step={1}
                        value={previewLength}
                        onChange={(e) => setPreviewLength(Number(e.target.value))}
                        className="w-full accent-fuchsia-500"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Trecho: <span className="tabular-nums">
                        {previewStart.toFixed(1)}s → {(hasDuration ? Math.min(effDuration, previewStart + previewLength) : previewStart + previewLength).toFixed(1)}s
                      </span>
                      {!hasDuration && (
                        <span className="ml-1 opacity-70">(detectando duração…)</span>
                      )}
                    </p>
                  </div>
                );
              })()}

              <div>
                <Label className="text-xs">Compositor</Label>
                <Input
                  value={composer}
                  onChange={(e) => { setComposer(e.target.value); if (errors.composer) setErrors((p) => ({ ...p, composer: '' })); }}
                  placeholder="Nome do compositor"
                  maxLength={80}
                  aria-invalid={!!errors.composer}
                  className={errors.composer ? 'border-rose-500 focus-visible:ring-rose-500' : ''}
                />
                {errors.composer && <p className="text-[11px] text-rose-400 mt-1">{errors.composer}</p>}
              </div>
              <div>
                <Label className="text-xs">IA usada</Label>
                <Input
                  value={aiTool}
                  onChange={(e) => { setAiTool(e.target.value); if (errors.aiTool) setErrors((p) => ({ ...p, aiTool: '' })); }}
                  placeholder="Ex.: Suno, Udio…"
                  maxLength={40}
                  aria-invalid={!!errors.aiTool}
                  className={errors.aiTool ? 'border-rose-500 focus-visible:ring-rose-500' : ''}
                />
                {errors.aiTool && <p className="text-[11px] text-rose-400 mt-1">{errors.aiTool}</p>}
                {(aiQuery.data?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {aiQuery.data!.slice(0, 10).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAiTool(t.name)}
                        className="text-[10px] rounded-full border border-border/50 px-2 py-0.5 hover:border-fuchsia-500/50"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs">Estilos / tags</Label>
                <AudioTagPicker kind="genre" selected={genres} onChange={setGenres} />
                {errors.genres && <p className="text-[11px] text-rose-400 mt-1">{errors.genres}</p>}
              </div>

              {/* Letra da música — upload (.txt) ou digitar/colar */}
              <LyricsEditorBlock
                value={lyrics}
                onChange={setLyrics}
                disabled={saving}
                autosaveStatus={lyricsAutosave}
                lastSavedAt={lyricsLastSavedAt}
              />



            </>
          )}
        </div>

        <DialogFooter className="px-4 sm:px-6 py-3 border-t border-border/40 shrink-0 bg-card flex-row gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleCancel} disabled={saving} className="flex-1 sm:flex-none">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || thumbUploading} className="flex-1 sm:flex-none">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  LyricsEditorBlock                                                         */
/*  Editor de letra com upload .txt, contador, limpar e pré-visualização     */
/*  formatada (whitespace-pre-wrap) antes de salvar.                          */
/* -------------------------------------------------------------------------- */
function LyricsEditorBlock({
  value,
  onChange,
  disabled,
  autosaveStatus = 'idle',
  lastSavedAt = null,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autosaveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt?: number | null;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const hasContent = value.trim().length > 0;


  const handleDroppedFile = async (f: File) => {
    try {
      const res = await readLyricsFile(f);
      onChange(res.value);
      if (res.truncated) toast.error(res.error ?? 'Letra cortada no limite.');
      else toast.success('Letra carregada do arquivo.');
    } catch (err: any) {
      toast.error(err?.message ?? 'Falha ao ler o arquivo.');
    }
  };

  return (
    <div
      className={cn(
        'rounded-md border p-3 space-y-2 transition-colors',
        dragOver
          ? 'border-fuchsia-300 bg-fuchsia-500/15 ring-2 ring-fuchsia-400/40'
          : 'border-fuchsia-500/30 bg-fuchsia-500/5',
      )}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        if (disabled) return;
        const f = pickLyricsFileFromDataTransfer(e.dataTransfer);
        if (!f) {
          toast.error('Solte um arquivo .txt válido.');
          return;
        }
        void handleDroppedFile(f);
      }}
    >

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs font-semibold text-fuchsia-100 flex items-center gap-2">
          Letra da música (opcional)
          <AutosaveBadge status={autosaveStatus} lastSavedAt={lastSavedAt} />
        </Label>

        <div className="flex items-center gap-3">
          {hasContent && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-[10px] text-fuchsia-200 hover:text-fuchsia-50 underline"
              disabled={disabled}
            >
              {showPreview ? 'Editar' : 'Pré-visualizar'}
            </button>
          )}
          {hasContent && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setShowPreview(false);
                toast.success('Letra removida. Clique em Salvar para confirmar.');
              }}
              className="text-[10px] text-rose-300 hover:text-rose-100 underline"
              disabled={disabled}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        Envie um arquivo <code>.txt</code>, <strong>arraste e solte</strong> aqui
        ou cole/digite abaixo. A formatação (quebras de linha) é preservada. Use{' '}
        <strong>Limpar</strong> para remover a letra e <strong>Salvar</strong> para confirmar.
      </p>


      {!showPreview && (
        <>
          <Input
            type="file"
            accept=".txt,text/plain"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const fileCheck = validateLyricsFile(f);
              if (!fileCheck.ok) {
                toast.error(fileCheck.error ?? 'Arquivo inválido.');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const raw = String(reader.result ?? '');
                const res = validateLyricsText(raw);
                onChange(res.value);
                if (res.truncated) toast.error(res.error ?? 'Letra cortada no limite.');
                else toast.success('Letra carregada do arquivo.');
              };
              reader.onerror = () => toast.error('Falha ao ler o arquivo.');
              reader.readAsText(f, 'utf-8');
            }}
          />
          <Textarea
            value={value}
            onChange={(e) => {
              const raw = e.target.value;
              const res = validateLyricsText(raw);
              onChange(res.value);
              if (res.truncated && raw.length > value.length) {
                toast.error(res.error ?? 'Limite de caracteres atingido.');
              }
            }}
            onPaste={(e) => {
              const pasted = e.clipboardData?.getData('text') ?? '';
              const projected = value + pasted;
              if (projected.length > LYRICS_MAX_CHARS) {
                e.preventDefault();
                const res = validateLyricsText(projected);
                onChange(res.value);
                toast.error(res.error ?? 'Texto colado excede o limite — cortado.');
              }
            }}
            rows={8}
            maxLength={LYRICS_MAX_CHARS}
            placeholder={'Cole ou digite a letra aqui...\n\n[Verso 1]\n...'}
            className="font-mono text-[12px] whitespace-pre-wrap leading-relaxed"
            disabled={disabled}
          />
        </>
      )}

      {showPreview && (
        <div
          className="rounded-md border border-fuchsia-400/30 bg-black/40 p-3 max-h-72 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          <style>{`.lyrics-pv::-webkit-scrollbar{display:none}`}</style>
          <pre className="lyrics-pv whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-fuchsia-50 m-0">
            {value}
          </pre>
        </div>
      )}

      <p className={cn(
        'text-[10px]',
        value.length >= LYRICS_MAX_CHARS ? 'text-rose-300 font-semibold' : 'text-muted-foreground',
      )}>
        {value.length.toLocaleString('pt-BR')}/{LYRICS_MAX_CHARS.toLocaleString('pt-BR')} caracteres
        {value.length >= LYRICS_MAX_CHARS && ' • limite atingido'}
        {showPreview && ' • Modo pré-visualização'}
      </p>
    </div>
  );
}

function AutosaveBadge({
  status,
  lastSavedAt = null,
}: {
  status: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt?: number | null;
}) {
  if (status === 'idle' && !lastSavedAt) return null;
  const savedTime = formatLastSavedTime(lastSavedAt);
  const map: Record<string, { label: string; cls: string }> = {
    idle: {
      label: savedTime ? `Salvo às ${savedTime}` : '',
      cls: 'text-emerald-300/80',
    },
    pending: {
      label: savedTime
        ? `Alterações não salvas (último: ${savedTime})`
        : 'Alterações não salvas',
      cls: 'text-amber-300',
    },
    saving: { label: 'Salvando…', cls: 'text-fuchsia-200' },
    saved: {
      label: savedTime ? `Salvo às ${savedTime}` : 'Salvo automaticamente',
      cls: 'text-emerald-300',
    },
    error: { label: 'Falha — tentaremos no Salvar', cls: 'text-rose-300' },
  };
  const m = map[status];
  if (!m?.label) return null;
  return (
    <span
      className={cn('text-[10px] font-normal flex items-center gap-1', m.cls)}
      title={savedTime ? `Último salvamento bem-sucedido: ${savedTime}` : undefined}
      aria-live="polite"
    >
      {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === 'pending' && <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />}
      {m.label}
    </span>
  );
}



