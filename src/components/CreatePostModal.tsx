import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Image, Video, Trash2, Sparkles, Globe, Users, Flame, Pencil, AlertTriangle, Zap, Clock, Snowflake, BarChart3, Lock, DollarSign, Crown, Info, CalendarClock, ListChecks, EyeOff, Link2 } from "lucide-react";
import { useSchedulePost } from "@/hooks/useScheduledPosts";
import { ScheduledPostsModal } from "./ScheduledPostsModal";
import { useState, useRef, useCallback, lazy, Suspense, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
const ImageEditor = lazy(() => import("./ImageEditor").then(m => ({ default: m.ImageEditor })));
import { UploadProgressOverlay } from "./UploadProgressOverlay";
import { LinkPreviewCard, fetchLinkPreview, type LinkPreviewData } from "./LinkPreviewCard";
import { extractFirstUrl } from "./chat/LinkPreview";
import { CarouselLightbox } from "./CarouselLightbox";
import { VideoCoverPicker } from "./VideoCoverPicker";
const VideoTrimmerModal = lazy(() => import("./VideoTrimmerModal").then(m => ({ default: m.VideoTrimmerModal })));
import { useCreatePost, useUpdatePost, type Post } from "@/hooks/usePosts";
import { useMediaUpload } from "@/hooks/useMediaUpload";
import { cleanupObjectUrls } from "@/lib/smartUpload";
import { supabase } from "@/lib/supabaseExternal";
import { EXTERNAL_SUPABASE_URL } from "@/lib/appConfig";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useCanPerformActions } from "@/hooks/useCanPerformActions";
import { useIsFreePlan } from "@/hooks/useFreePlanLimits";
import { useAdminBypass } from "@/hooks/useAdminBypass";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { useCreatorWalletCheck } from "@/hooks/useCreatorWalletCheck";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { getVideoDurationLimit, getVideoDurationLimitLabel } from "./profile/ProfileMediaTabs";
import { CreatePollModal } from "./polls";
import { useCreatorBlurPreferenceStore } from "@/store/useCreatorBlurPreferenceStore";
import {
  savePostDraft,
  loadPostDraft,
  clearPostDraft,
  fileToDraftField,
  draftFieldToFile,
} from "@/lib/postDraftStore";


const extensionForImageMime = (mime: string) => {
  const clean = (mime || '').toLowerCase().split(';')[0].trim();
  if (clean === 'image/png') return 'png';
  if (clean === 'image/gif') return 'gif';
  if (clean === 'image/webp') return 'webp';
  return 'jpg';
};

const getReliableVideoDuration = (video: HTMLVideoElement): Promise<number> =>
  new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Não foi possível ler a duração do vídeo"));
    };

    const tryResolve = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(duration);
    };

    const onLoadedMetadata = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }

      try {
        video.currentTime = 1e9;
      } catch {
        fail();
      }
    };

    const onDurationChange = () => tryResolve();
    const onSeeked = () => tryResolve();
    const onError = () => fail();

    const timeoutId = window.setTimeout(() => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) finish(duration);
      else fail();
    }, 12000);

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);

    if (video.readyState >= 1) onLoadedMetadata();
  });

type PostVisibility = 'public' | 'friends' | 'vip';

interface CreatePostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPost?: Post | null;
}

export function CreatePostModal({ open, onOpenChange, editPost }: CreatePostModalProps) {
  const isEditMode = !!editPost;
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  /** Imagens extras (slot 2..10) — quando o usuário escolhe múltiplas fotos vira carrossel. */
  const [extraImageFiles, setExtraImageFiles] = useState<File[]>([]);
  const [extraImagePreviews, setExtraImagePreviews] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // Progresso por slot do carrossel: 'pending' | 'uploading' | 'done' | 'error'
  const [carouselProgress, setCarouselProgress] = useState<
    Array<'pending' | 'uploading' | 'done' | 'error'>
  >([]);
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [isFlashStory, setIsFlashStory] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [isEdited, setIsEdited] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<string | null>(null);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showWalletAlert, setShowWalletAlert] = useState(false);
  const [isPaidContent, setIsPaidContent] = useState(false);
  const [paidPrice, setPaidPrice] = useState("");
  const defaultBlurPref = useCreatorBlurPreferenceStore((s) => s.defaultBlur);
  const setDefaultBlurPref = useCreatorBlurPreferenceStore((s) => s.setDefaultBlur);
  const [previewBlur, setPreviewBlur] = useState<'light' | 'medium' | 'strong'>(defaultBlurPref);
  /** +18: aplica blur padrão na mídia ao exibir no feed. Default TRUE. */
  const [isAdult, setIsAdult] = useState<boolean>(true);
  const [oversizedVideo, setOversizedVideo] = useState<File | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [showScheduledList, setShowScheduledList] = useState(false);
  const [linkPreviewData, setLinkPreviewData] = useState<LinkPreviewData | null>(null);
  const linkCoverUploadCacheRef = useRef<Map<string, Promise<string | null>>>(new Map());
  // ─── Estilização opcional para posts somente-texto ───
  const [textFont, setTextFont] = useState<string>('default');
  const [textSize, setTextSize] = useState<number>(16);
  const [textBold, setTextBold] = useState<boolean>(false);
  const [textBg, setTextBg] = useState<string>('transparent');
  const [textColor, setTextColor] = useState<string>('auto');
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const schedulePost = useSchedulePost();
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // Em mobile, abrir o seletor nativo de arquivos dispara blur/focus que o
  // Radix Dialog interpreta como "interação fora" — fechando o modal e
  // descartando a foto recém-escolhida. Marcamos um timestamp ao abrir o
  // picker e bloqueamos qualquer close por ~90s a partir desse momento.
  const filePickerOpenedAtRef = useRef<number>(0);
  /** Quando true, esperamos um `change` event vindo do input de arquivo. */
  const awaitingFilePickerRef = useRef<'image' | 'video' | null>(null);
  const cancelToastTimerRef = useRef<number | null>(null);
  const markFilePickerOpened = useCallback(
    (kind: 'image' | 'video') => {
      filePickerOpenedAtRef.current = Date.now();
      awaitingFilePickerRef.current = kind;
      // Limpa qualquer timer pendente
      if (cancelToastTimerRef.current) {
        window.clearTimeout(cancelToastTimerRef.current);
        cancelToastTimerRef.current = null;
      }
    },
    []
  );
  const isFilePickerActive = () =>
    Date.now() - filePickerOpenedAtRef.current < 90_000;

  /** Confirma o retorno do picker (com ou sem arquivo). */
  const consumeFilePickerReturn = useCallback(
    (cancelled: boolean) => {
      const kind = awaitingFilePickerRef.current;
      awaitingFilePickerRef.current = null;
      filePickerOpenedAtRef.current = 0;
      if (cancelled && kind) {
        // Pequeno delay para não brigar com gestos do iOS
        cancelToastTimerRef.current = window.setTimeout(() => {
          toast({
            title: kind === 'image' ? "Nenhuma imagem selecionada" : "Nenhum vídeo selecionado",
            description: "Você pode continuar editando seu post e tentar de novo a qualquer momento.",
          });
        }, 150);
      }
    },
    // toast vem do hook (estável); declaração antecipada — vamos receber abaixo
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );



  
  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const { uploadMedia, uploadProgress: smartProgress } = useMediaUpload();
  const { user } = useAuth();
  const { toast } = useToast();
  const { canAct, isFrozen } = useCanPerformActions();
  const isFreePlan = useIsFreePlan();
  const { shouldBypass } = useAdminBypass();
  const { canCreatePaidContent } = usePlanPermissions();
  const { profile } = useProfile();
  const { hasWallet } = useCreatorWalletCheck();
  const planType = profile?.plan_type || 'free';
  const videoBlockedForFree = false; // Vídeo liberado para todos os planos (free/premium/vip)
  const maxVideoDuration = shouldBypass ? Infinity : getVideoDurationLimit(planType);

  const uploadLinkPreviewCover = useCallback(async (preview: LinkPreviewData | null): Promise<string | null> => {
    if (!user?.id || !preview?.image) return null;
    const cacheKey = preview.image;
    const cached = linkCoverUploadCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const task = (async () => {
      try {
        const encodedPreviewImage = encodeURIComponent(preview.image!);
        const proxyUrls = [
          `/api/link-cover-image?url=${encodedPreviewImage}`,
          `https://ocultoswing.com.br/api/link-cover-image?url=${encodedPreviewImage}`,
        ];
        let response: Response | null = null;
        for (const proxyUrl of proxyUrls) {
          try {
            const candidate = await fetch(proxyUrl, { credentials: 'omit' });
            if (candidate.ok) { response = candidate; break; }
          } catch { /* tenta próximo proxy */ }
        }
        if (!response?.ok) response = await fetch(preview.image!, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`preview image ${response.status}`);
        const sourceBlob = await response.blob();
        if (!sourceBlob.type.startsWith('image/')) throw new Error('preview is not image');

        const coverBlob = await new Promise<Blob>((resolve, reject) => {
          const img = new window.Image();
          const objectUrl = URL.createObjectURL(sourceBlob);
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1200;
            canvas.height = 630;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              URL.revokeObjectURL(objectUrl);
              reject(new Error('canvas unavailable'));
              return;
            }
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const srcRatio = img.naturalWidth / img.naturalHeight;
            const dstRatio = canvas.width / canvas.height;
            let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
            if (srcRatio > dstRatio) {
              sw = Math.round(img.naturalHeight * dstRatio);
              sx = Math.round((img.naturalWidth - sw) / 2);
            } else {
              sh = Math.round(img.naturalWidth / dstRatio);
              sy = Math.round((img.naturalHeight - sh) / 2);
            }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(objectUrl);
            canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('cover blob failed')), 'image/jpeg', 0.86);
          };
          img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image decode failed')); };
          img.src = objectUrl;
        });

        const path = `${user.id}/link-covers/${Date.now()}.${extensionForImageMime(coverBlob.type)}`;
        const { data, error } = await supabase.storage
          .from('post-media')
          .upload(path, coverBlob, { contentType: coverBlob.type || 'image/jpeg', cacheControl: '604800', upsert: false });
        if (error) throw error;
        return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/post-media/${data.path}`;
      } catch (err) {
        console.warn('[CreatePostModal] fallback capa externa do link:', err);
        return preview.image;
      }
    })();
    linkCoverUploadCacheRef.current.set(cacheKey, task);
    return task;
  }, [user?.id]);

  const isGifFile = (file: File | null) => {
    if (!file) return false;
    return file.type === 'image/gif' || /\.gif$/i.test(file.name || '');
  };

  const handleFileSelect = (file: File, type: 'image' | 'video') => {
    if (type === 'image') {
      if (isGifFile(file)) {
        cleanupObjectUrls(mediaPreview);
        setMediaFile(file);
        setMediaType('image');
        setMediaPreview(URL.createObjectURL(file));
        setIsEdited(false);
        setPendingImageFile(null);
        setShowEditor(false);
        return;
      }

      setPendingImageFile(file);
      setShowEditor(true);
    } else {
      validateAndSetVideo(file);
    }
  };

  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const [videoThumbnailBlob, setVideoThumbnailBlob] = useState<Blob | null>(null);

  const generateVideoThumbnail = useCallback((file: File): Promise<{ url: string; blob: Blob }> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const objUrl = URL.createObjectURL(file);
      video.src = objUrl;

      const cleanup = () => {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(objUrl);
      };

      const capture = async () => {
        try {
          const duration = await getReliableVideoDuration(video);
          video.currentTime = Math.min(1, Math.max(0.1, duration * 0.1));
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      video.onloadedmetadata = () => {
        void capture();
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_W = 640;
          let w = video.videoWidth;
          let h = video.videoHeight;
          if (w > MAX_W) {
            h = Math.round(h * (MAX_W / w));
            w = MAX_W;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            reject(new Error('Canvas fail'));
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
          canvas.toBlob((blob) => {
            if (blob) {
              const thumbUrl = URL.createObjectURL(blob);
              cleanup();
              resolve({ url: thumbUrl, blob });
            } else {
              cleanup();
              reject(new Error('toBlob fail'));
            }
          }, 'image/webp', 0.7);
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('Video load fail'));
      };
    });
  }, []);

  const validateAndSetVideo = (file: File) => {
    setVideoError(null);

    // Limite ampliado para 100MB. Qualquer formato de vídeo conhecido pelo browser é aceito.
    const MAX_SIZE_MB = 100;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setOversizedVideo(file);
      setVideoError(`Vídeo muito grande (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limite: ${MAX_SIZE_MB}MB. Use o editor para reduzir.`);
      return;
    }

    if (mediaPreview) cleanupObjectUrls(mediaPreview);
    if (videoThumbnail) cleanupObjectUrls(videoThumbnail);
    setVideoThumbnail(null);
    setVideoThumbnailBlob(null);

    // Fallback: aceita o vídeo mesmo que o browser não consiga ler metadata
    // (comum em vídeos do WhatsApp salvos na galeria — codec HEVC, mime vazio, etc).
    // O upload e o backend lidam com a transcodificação.
    const acceptWithoutMetadata = (reason: string) => {
      try { console.warn('[CreatePostModal] aceitando vídeo sem metadata:', reason, file.type, file.size); } catch { /* noop */ }
      setMediaFile(file);
      setMediaType('video');
      setVideoDuration(null);
      setVideoDurationSeconds(null);
      const previewUrl = URL.createObjectURL(file);
      setMediaPreview(previewUrl);
      // tenta gerar thumbnail em segundo plano; se falhar, sem problema
      generateVideoThumbnail(file)
        .then(({ url, blob }) => {
          setVideoThumbnail(url);
          setVideoThumbnailBlob(blob);
        })
        .catch(() => { /* non-critical */ });
    };

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    let settled = false;
    const cleanup = () => {
      video.removeAttribute('src');
      try { video.load(); } catch { /* noop */ }
      URL.revokeObjectURL(objectUrl);
    };

    // Timeout de segurança: alguns devices Android demoram a expor metadata
    // de vídeos do WhatsApp. Após 8s, aceita o arquivo mesmo assim.
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      acceptWithoutMetadata('timeout');
    }, 8000);

    video.onloadedmetadata = async () => {
      if (settled) return;
      try {
        const resolvedDuration = await getReliableVideoDuration(video);
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();

        setMediaFile(file);
        setMediaType('video');
        setVideoDuration(formatDuration(resolvedDuration));
        setVideoDurationSeconds(Number.isFinite(resolvedDuration) ? Math.floor(resolvedDuration) : null);
        const previewUrl = URL.createObjectURL(file);
        setMediaPreview(previewUrl);

        generateVideoThumbnail(file)
          .then(({ url, blob }) => {
            setVideoThumbnail(url);
            setVideoThumbnailBlob(blob);
          })
          .catch(() => { /* non-critical */ });
      } catch {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        cleanup();
        acceptWithoutMetadata('duration_unreadable');
      }
    };

    video.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      // Em vez de bloquear, aceita o arquivo. Vídeos do WhatsApp/Android
      // frequentemente falham no <video> mas funcionam no upload/transcoder.
      acceptWithoutMetadata('video_element_error');
    };
  };

  const handleCoverSelected = useCallback((url: string, blob: Blob) => {
    setVideoThumbnail(url);
    setVideoThumbnailBlob(blob);
  }, []);

  const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEditorSave = (editedImageUrl: string) => {
    // Convert the edited data URL into a real File so the upload sends the
    // version with stickers / text / blur / watermark applied — not the original.
    try {
      const [meta, b64] = editedImageUrl.split(',');
      const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'image/jpeg';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const baseName = (pendingImageFile?.name || 'post').replace(/\.[^.]+$/, '');
      const editedFile = new File([bytes], `${baseName}-edited.${ext}`, { type: mime });
      setMediaFile(editedFile);
    } catch (err) {
      console.warn('[CreatePostModal] Falha ao converter imagem editada, usando original', err);
      setMediaFile(pendingImageFile);
    }
    setMediaType('image');
    setMediaPreview(editedImageUrl);
    setIsEdited(true);
    setPendingImageFile(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    const cancelled = !fileList || fileList.length === 0;
    consumeFilePickerReturn(cancelled);
    if (cancelled) {
      e.target.value = '';
      return;
    }
    const files = Array.from(fileList!).slice(0, 10); // limite de 10 imagens por post

    if (files.length === 1) {
      // Fluxo de imagem única — passa pelo editor como antes
      handleFileSelect(files[0], 'image');
    } else {
      // Carrossel: pula o editor, sobe todas as imagens diretamente
      cleanupObjectUrls(mediaPreview);
      extraImagePreviews.forEach((u) => cleanupObjectUrls(u));
      const [first, ...rest] = files;
      const firstPreview = URL.createObjectURL(first);
      const restPreviews = rest.map((f) => URL.createObjectURL(f));
      setMediaFile(first);
      setExtraImageFiles(rest);
      setMediaPreview(firstPreview);
      setExtraImagePreviews(restPreviews);
      setCarouselProgress(new Array(files.length).fill('pending'));
      setMediaType('image');
      setIsEdited(true); // carrossel não passa pelo editor; considera válido para postar
      setPendingImageFile(null);
      setShowEditor(false);
    }
    e.target.value = '';
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    consumeFilePickerReturn(!file);
    if (file) {
      handleFileSelect(file, 'video');
    }
    // Reset input
    e.target.value = '';
  };



  const removeMedia = () => {
    cleanupObjectUrls(mediaPreview);
    if (videoThumbnail) cleanupObjectUrls(videoThumbnail);
    extraImagePreviews.forEach((u) => cleanupObjectUrls(u));
    setExtraImageFiles([]);
    setExtraImagePreviews([]);
    setCarouselProgress([]);
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
    setIsEdited(false);
    setVideoError(null);
    setVideoDuration(null);
    setVideoThumbnail(null);
    setVideoThumbnailBlob(null);
  };

  const resetForm = () => {
    // Limpa o draft persistido — usuário fechou ou postou.
    clearPostDraft().catch(() => {});

    setContent("");
    removeMedia();
    setVisibility('public');
    setIsFlashStory(false);
    setPendingImageFile(null);
    setIsPaidContent(false);
    setPaidPrice("");
    setPreviewBlur('medium');
    setIsAdult(true);
    setIsScheduled(false);
    setScheduledFor("");
    setTextFont('default');
    setTextSize(16);
    setTextBold(false);
    setTextBg('transparent');
    setTextColor('auto');
    setShowEmojiPanel(false);
    setLinkPreviewData(null);
  };

  // Pré-popular em modo edição
  useEffect(() => {
    if (!open) return;
    if (isEditMode && editPost) {
      setContent(editPost.content_text || "");
      setVisibility((editPost.privacy_level as PostVisibility) || 'public');
      setIsFlashStory((editPost as any).is_flash || false);
      setIsPaidContent(!!editPost.is_paid);
      setPaidPrice(editPost.paid_price ? String(editPost.paid_price).replace('.', ',') : "");
      const blur = (editPost as any).preview_blur;
      if (blur === 'light' || blur === 'medium' || blur === 'strong') setPreviewBlur(blur);
      const editAdult = (editPost as any).is_adult;
      setIsAdult(editAdult === true);
      if (editPost.media_url) {
        setMediaPreview(editPost.media_url);
        setMediaType((editPost.media_type as 'image' | 'video') || 'image');
        setIsEdited(true); // mídia já existente conta como "editada"
        if (editPost.thumbnail_url) setVideoThumbnail(editPost.thumbnail_url);
      }
    }
  }, [open, isEditMode, editPost]);

  // ─── Persistência temporária do rascunho (apenas modo criação) ───
  // Detecta ao abrir e expõe banner; só aplica via "Retomar rascunho".
  const draftRestoredRef = useRef(false);
  const [availableDraft, setAvailableDraft] = useState<{
    content: string;
    imageFile: File | null;
    videoFile: File | null;
    editorOpen: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      draftRestoredRef.current = false;
      setAvailableDraft(null);
      return;
    }
    if (isEditMode) return;
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    (async () => {
      try {
        const snap = await loadPostDraft();
        if (!snap) return;
        const imageFile = draftFieldToFile(snap.pendingImageFile);
        const videoFile = draftFieldToFile(snap.pendingVideoFile);
        const hasContent = !!snap.content?.trim();
        if (!hasContent && !imageFile && !videoFile) return;
        setAvailableDraft({
          content: snap.content || "",
          imageFile,
          videoFile,
          editorOpen: !!snap.editorOpen,
        });
      } catch (err) {
        console.warn("[CreatePostModal] Falha ao restaurar rascunho", err);
      }
    })();
  }, [open, isEditMode]);

  const resumeDraft = useCallback(() => {
    if (!availableDraft) return;
    if (availableDraft.content) setContent(availableDraft.content);
    if (availableDraft.imageFile) {
      setPendingImageFile(availableDraft.imageFile);
      if (availableDraft.editorOpen) setShowEditor(true);
    } else if (availableDraft.videoFile) {
      handleFileSelect(availableDraft.videoFile, 'video');
    }
    setAvailableDraft(null);
    toast({
      title: "Rascunho retomado",
      description: "Seu texto e mídia foram restaurados.",
    });
  }, [availableDraft, toast]);

  const discardDraft = useCallback(() => {
    clearPostDraft().catch(() => {});
    setAvailableDraft(null);
    setContent("");
    removeMedia();
    setPendingImageFile(null);
    setShowEditor(false);
    toast({
      title: "Rascunho descartado",
      description: "Você está começando do zero.",
    });
  }, [toast]);

  // Autosave debounced enquanto o modal está aberto.
  useEffect(() => {
    if (!open || isEditMode) return;
    // Enquanto o banner de rascunho disponível estiver visível, não
    // sobrescrevemos o snapshot — senão "começar do zero" apagaria a
    // versão antiga antes do usuário decidir.
    if (availableDraft) return;
    const isVideo = mediaType === 'video' && !!mediaFile;
    const hasSomething = !!content.trim() || !!pendingImageFile || isVideo;
    const handle = window.setTimeout(() => {
      if (!hasSomething) {
        clearPostDraft().catch(() => {});
        return;
      }
      savePostDraft({
        content,
        pendingImageFile: fileToDraftField(pendingImageFile),
        pendingVideoFile: isVideo ? fileToDraftField(mediaFile, 'video/mp4') : null,
        editorOpen: showEditor,
        savedAt: Date.now(),
      }).catch(() => {});
    }, 600);
    return () => window.clearTimeout(handle);
  }, [open, isEditMode, availableDraft, content, pendingImageFile, mediaFile, mediaType, showEditor]);




  const handlePost = async () => {
    if (!content.trim() && !mediaFile && !(isEditMode && editPost?.media_url)) return;
    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para postar",
        variant: "destructive",
      });
      return;
    }

    // Block VIP post if wallet not configured
    if (visibility === 'vip' && !hasWallet) {
      setShowWalletAlert(true);
      return;
    }

    if (!canAct) {
      toast({
        title: "Conta congelada",
        description: "Você não pode postar enquanto sua conta estiver congelada.",
        variant: "destructive",
      });
      return;
    }

    setIsPosting(true);

    try {
      let mediaUrl: string | undefined;
      let thumbnailUrl: string | undefined;
      let mediaStoragePath: string | undefined;
      let mediaBucket: string | undefined;
      let previewUrl: string | undefined;

      // Upload media if exists
      if (mediaFile) {
        setUploadProgress("Enviando mídia...");

        if (isPaidContent) {
          // ── Conteúdo pago: mídia real em bucket privado ──
          const mediaResult = await uploadMedia(
            mediaFile,
            mediaType === 'video' ? 'videos' : 'images',
            'vip-paid-media'
          );
          mediaUrl = mediaResult.publicUrl; // Fallback para legacy
          mediaStoragePath = mediaResult.path;
          mediaBucket = 'vip-paid-media';

          // Preview/thumbnail em bucket público
          if (videoThumbnailBlob && mediaType === 'video') {
            setUploadProgress("Gerando capa...");
            try {
              const thumbResult = await uploadMedia(videoThumbnailBlob, 'previews', 'paid-previews');
              thumbnailUrl = thumbResult.publicUrl;
              previewUrl = thumbResult.publicUrl;
            } catch {
              // Non-critical
            }
          } else if (mediaType === 'image') {
            // Para imagem paga, usar a própria imagem como preview (ou compressão leve)
            previewUrl = mediaResult.publicUrl;
          }
        } else {
          // ── Conteúdo gratuito: bucket público ──
          const mediaResult = await uploadMedia(
            mediaFile,
            mediaType === 'video' ? 'videos' : 'images',
            'post-media'
          );
          mediaUrl = mediaResult.publicUrl;

          // Upload thumbnail if generated
          if (videoThumbnailBlob && mediaType === 'video') {
            setUploadProgress("Gerando capa...");
            try {
              const thumbResult = await uploadMedia(videoThumbnailBlob, 'thumbnails', 'post-media');
              thumbnailUrl = thumbResult.publicUrl;
            } catch {
              // Non-critical: post works without thumbnail
            }
          }
        }
      }

      // ── Carrossel: sobe as imagens extras (slot 2..10) em paralelo ──
      let extraMediaUrls: string[] = [];
      if (mediaType === 'image' && extraImageFiles.length > 0 && !isPaidContent) {
        const total = extraImageFiles.length + 1;
        // Slot 0 = imagem principal (já enviada). Marca como done.
        setCarouselProgress([
          'done',
          ...extraImageFiles.map(() => 'pending' as const),
        ]);
        setUploadProgress(`Enviando 1 / ${total}...`);
        let completed = 1;
        const uploads = await Promise.all(
          extraImageFiles.map(async (f, i) => {
            const slot = i + 1;
            setCarouselProgress((prev) => {
              const next = [...prev];
              next[slot] = 'uploading';
              return next;
            });
            try {
              const result = await uploadMedia(f, 'images', 'post-media');
              completed += 1;
              setCarouselProgress((prev) => {
                const next = [...prev];
                next[slot] = 'done';
                return next;
              });
              setUploadProgress(`Enviando ${completed} / ${total}...`);
              return result.publicUrl;
            } catch (err) {
              console.error('[CreatePostModal] Falha em imagem extra', slot, err);
              setCarouselProgress((prev) => {
                const next = [...prev];
                next[slot] = 'error';
                return next;
              });
              return null;
            }
          })
        );
        extraMediaUrls = uploads.filter((u): u is string => !!u);
      }
      const allMediaUrls = mediaUrl
        ? [mediaUrl, ...extraMediaUrls]
        : extraMediaUrls;

      setUploadProgress("Publicando...");

      // ── Capa persistida para link externo: copia a imagem exibida na prévia
      // para nosso storage público, em 1200x630, e usa essa URL no OG social.
      let linkPreviewImageUrl: string | null = null;
      let linkPreviewMeta: Record<string, any> | null = null;
      try {
        const trimmedContent = (content || '').trim();
        const hasUploadedMedia = !!mediaUrl || allMediaUrls.length > 0;
        if (!hasUploadedMedia && trimmedContent) {
          const firstUrl = extractFirstUrl(trimmedContent);
          if (firstUrl) {
            const preview = linkPreviewData?.url === firstUrl
              ? linkPreviewData
              : await Promise.race<Promise<any>>([
                  fetchLinkPreview(firstUrl),
                  new Promise((resolve) => setTimeout(() => resolve(null), 4500)),
                ]);
            if (preview) {
              linkPreviewMeta = {
                link_preview_url: firstUrl,
                link_preview_title: preview.title || preview.siteName || preview.host || null,
                link_preview_description: preview.description || null,
                link_preview_host: preview.host || null,
                link_preview_site_name: preview.siteName || null,
              };
              linkPreviewImageUrl = await uploadLinkPreviewCover(preview);
            }
          }
        }
      } catch {
        /* não-crítico: post publica sem capa de link */
      }

      const parsedPrice = isPaidContent && canCreatePaidContent ? parseFloat(paidPrice.replace(',', '.')) : 0;
      const isAdultPayload = isAdult === true;

      if (isEditMode && editPost) {
        // style_meta só faz sentido em posts somente-texto (sem mídia).
        const hasAnyMediaEdit = !!mediaUrl || allMediaUrls.length > 0 || !!(editPost as any).media_url;
        const styleMetaEdit = !hasAnyMediaEdit ? {
          font_family: textFont,
          font_size: textSize,
          bold: textBold,
          bg_color: textBg,
          text_color: textColor,
        } : null;
        const styleIsDefaultEdit =
          textFont === 'default' && textSize === 16 && !textBold &&
          textBg === 'transparent' && textColor === 'auto';

        // Em edição: só envia mídia se um novo arquivo foi selecionado
        await updatePost.mutateAsync({
          id: editPost.id,
          content_text: content.trim() || null,
          ...(mediaFile ? {
            media_url: mediaUrl,
            media_type: mediaType,
            thumbnail_url: thumbnailUrl,
            preview_url: previewUrl,
            media_storage_path: mediaStoragePath,
            media_bucket: mediaBucket,
            video_duration_seconds: videoDurationSeconds || null,
          } : {}),
          privacy_level: isFlashStory ? 'public' : visibility,
          is_locked: (visibility === 'vip' && !isFlashStory) || (isPaidContent && parsedPrice > 0),
          is_paid: isPaidContent && parsedPrice > 0,
          paid_price: parsedPrice > 0 ? parsedPrice : null,
          preview_blur: isPaidContent && parsedPrice > 0 ? previewBlur : null,
          is_adult: isAdultPayload,
          style_meta: (() => {
            const meta = { ...(styleMetaEdit && !styleIsDefaultEdit ? styleMetaEdit : {}), ...(linkPreviewMeta || {}) };
            return Object.keys(meta).length ? meta : null;
          })(),
          ...(linkPreviewImageUrl ? { link_preview_image_url: linkPreviewImageUrl } : {}),
        });
      } else if (isScheduled && scheduledFor) {
        // ── Agendamento: persiste payload e o cron publica na hora marcada ──
        const when = new Date(scheduledFor);
        if (isNaN(when.getTime()) || when.getTime() <= Date.now() + 60_000) {
          throw new Error('Escolha uma data/hora pelo menos 1 minuto no futuro.');
        }
        await schedulePost.mutateAsync({
          scheduled_for: when,
          payload: {
            content_text: content.trim() || null,
            media_url: mediaUrl ?? null,
            media_urls: allMediaUrls.length > 1 ? allMediaUrls : null,
            media_type: mediaType ?? null,
            video_duration_seconds: videoDurationSeconds ?? null,
            privacy_level: isFlashStory ? 'public' : visibility,
            is_locked: (visibility === 'vip' && !isFlashStory) || (isPaidContent && parsedPrice > 0),
            is_flash: isFlashStory,
            thumbnail_url: thumbnailUrl ?? null,
            preview_url: previewUrl ?? null,
            media_storage_path: mediaStoragePath ?? null,
            media_bucket: mediaBucket ?? null,
            is_paid: isPaidContent && parsedPrice > 0,
            paid_price: parsedPrice > 0 ? parsedPrice : null,
            preview_blur: isPaidContent && parsedPrice > 0 ? previewBlur : null,
            is_adult: isAdultPayload,
            link_preview_image_url: linkPreviewImageUrl,
            style_meta: linkPreviewMeta,
          },
        });
      } else {
        // style_meta só faz sentido em posts somente-texto (sem mídia).
        const hasAnyMedia = !!mediaUrl || allMediaUrls.length > 0;
        const styleMeta = !hasAnyMedia ? {
          font_family: textFont,
          font_size: textSize,
          bold: textBold,
          bg_color: textBg,
          text_color: textColor,
        } : null;
        const styleIsDefault =
          textFont === 'default' && textSize === 16 && !textBold &&
          textBg === 'transparent' && textColor === 'auto';

        await createPost.mutateAsync({
          content_text: content.trim() || undefined,
          media_url: mediaUrl,
          media_urls: allMediaUrls.length > 1 ? allMediaUrls : undefined,
          media_type: mediaType || undefined,
          video_duration_seconds: videoDurationSeconds || undefined,
          privacy_level: isFlashStory ? 'public' : visibility,
          is_locked: (visibility === 'vip' && !isFlashStory) || (isPaidContent && parsedPrice > 0),
          is_flash: isFlashStory,
          thumbnail_url: thumbnailUrl,
          preview_url: previewUrl,
          media_storage_path: mediaStoragePath,
          media_bucket: mediaBucket,
          is_paid: isPaidContent && parsedPrice > 0,
          paid_price: parsedPrice > 0 ? parsedPrice : undefined,
          preview_blur: isPaidContent && parsedPrice > 0 ? previewBlur : undefined,
          is_adult: isAdultPayload,
          style_meta: (() => {
            const meta = { ...(styleMeta && !styleIsDefault ? styleMeta : {}), ...(linkPreviewMeta || {}) };
            return Object.keys(meta).length ? meta : null;
          })(),
          link_preview_image_url: linkPreviewImageUrl,
        });
      }

      const visibilityMessages = {
        public: "Seu post público já está disponível para todos.",
        friends: "Seu post está visível para seus amigos.",
        vip: "Seu post VIP está no ar para assinantes!",
      };

      toast({
        title: isEditMode
          ? "✏️ Postagem atualizada!"
          : isScheduled && scheduledFor
            ? "📅 Post agendado!"
            : isFlashStory ? "⚡ Flash Story publicado!" : "✨ Conteúdo publicado com sucesso!",
        description: isScheduled && scheduledFor
          ? `Será publicado em ${new Date(scheduledFor).toLocaleString('pt-BR')}.`
          : isFlashStory
            ? "Seu story estará visível por 24 horas."
            : visibilityMessages[visibility],
      });

      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating post:', error?.message || error);
      toast({
        title: "Erro ao publicar",
        description: error?.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    } finally {
      setIsPosting(false);
      setUploadProgress(null);
    }
  };

  const parsedPriceVal = parseFloat(paidPrice.replace(',', '.')) || 0;
  const canPost = isEditMode
    ? (content.trim().length > 0 || !!editPost?.media_url || mediaFile !== null)
        && (!mediaFile || mediaType !== 'image' || isEdited || isGifFile(mediaFile))
        && (!isPaidContent || parsedPriceVal > 0)
    : (content.trim().length > 0 || mediaFile !== null)
        && (mediaType !== 'image' || isEdited || isGifFile(mediaFile) || isScheduled)
        && (!isPaidContent || parsedPriceVal > 0)
        && (!isScheduled || (!!scheduledFor && new Date(scheduledFor).getTime() > Date.now() + 45_000));

  const visibilityOptions = [
    {
      value: 'public' as PostVisibility,
      icon: Globe,
      label: '🌍 Público',
      description: 'Todos podem ver (limite de 5 posts grátis)',
      locked: false,
    },
    {
      value: 'friends' as PostVisibility,
      icon: Users,
      label: '👥 Amigos',
      description: 'Apenas seguidores mútuos',
      locked: false,
    },
    {
      value: 'vip' as PostVisibility,
      icon: Flame,
      label: '🔥 VIP',
      description: canCreatePaidContent ? 'Apenas assinantes pagos' : 'Somente usuários VIP podem criar posts pagos',
      isMonetized: true,
      locked: !canCreatePaidContent,
    },
  ];

  return (
    <>
      <Dialog open={open && !showEditor} onOpenChange={(value) => {
        // Ignora o "fechamento" automático disparado pelo Radix quando o
        // editor de imagem (ou outro overlay) abre e o `open` desta Dialog
        // vira false — isso fechava o modal inteiro e descartava a foto.
        if (!value && showEditor) return;
        // Em mobile, abrir o seletor nativo de arquivo causa eventos de
        // blur/visibilidade que o Radix lê como "interação fora". Mantemos
        // o modal aberto enquanto o picker está ativo.
        if (!value && isFilePickerActive()) return;
        if (!value) resetForm();
        onOpenChange(value);
      }}>

        <DialogContent
          className="sm:max-w-lg bg-card border-border p-0 gap-0 overflow-hidden h-[100svh] h-[100dvh] sm:h-auto max-h-[100svh] max-h-[100dvh] sm:max-h-[90dvh] flex flex-col w-screen sm:w-[95vw] rounded-none sm:rounded-xl pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] top-0 left-0 translate-x-0 translate-y-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"

          onInteractOutside={(e) => {
            // Nunca fechar ao tocar fora — usuário precisa usar o X.
            // Evita perda de mídia/escrita em mobile.
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (isFilePickerActive() || showEditor) e.preventDefault();
          }}
        >

          {/* Freeze Warning */}
          {isFrozen && (
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border-b border-blue-500/30 text-blue-500">
              <Snowflake className="h-4 w-4" />
              <span className="text-sm font-medium">Sua conta está congelada. Você não pode publicar.</span>
            </div>
          )}
          
          {/* Header */}
          <DialogHeader className="p-4 border-b border-border">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {isEditMode ? "Editar postagem" : "Revelar algo novo..."}
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              {isEditMode
                ? "Atualize o conteúdo da sua postagem, mídia, visibilidade e configurações."
                : "Crie uma nova postagem com texto, foto, vídeo ou enquete. Ajuste visibilidade, agende ou monetize."}
            </DialogDescription>
          </DialogHeader>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {/* Banner de rascunho recuperado do IndexedDB */}
            {availableDraft && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Rascunho disponível</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {availableDraft.videoFile
                      ? "Encontramos um vídeo e texto que você não chegou a publicar."
                      : availableDraft.imageFile
                      ? "Encontramos uma foto e texto que você não chegou a publicar."
                      : "Encontramos um texto que você não chegou a publicar."}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={resumeDraft}
                      className="h-8"
                    >
                      Retomar rascunho
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={discardDraft}
                      className="h-8"
                    >
                      Descartar rascunho
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {/* Text area */}

            {(() => {
              const fontMap: Record<string, string> = {
                default: '',
                serif: 'Georgia, "Times New Roman", serif',
                mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                rounded: '"Comic Sans MS", "Quicksand", system-ui, sans-serif',
                display: '"Bebas Neue", Impact, sans-serif',
              };
              const isTextOnly = !mediaFile && !mediaPreview && extraImageFiles.length === 0;
              const previewBg = textBg === 'transparent' ? undefined : textBg;
              const previewColor = textColor === 'auto' ? undefined : textColor;
              return (
                <Textarea
                  placeholder="No que você está pensando agora? ✨"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[120px] border-border/50 resize-none placeholder:text-muted-foreground/60 focus-visible:ring-primary/50 transition-colors"
                  style={isTextOnly ? {
                    fontFamily: fontMap[textFont] || undefined,
                    fontSize: `${textSize}px`,
                    fontWeight: textBold ? 700 : 400,
                    backgroundColor: previewBg ?? 'hsl(var(--muted) / 0.3)',
                    color: previewColor,
                    lineHeight: 1.4,
                  } : { backgroundColor: 'hsl(var(--muted) / 0.3)', fontSize: 16 }}
                />
              );
            })()}

            {/* Preview rico de link (OpenGraph) — auto-detecta a primeira URL no texto. */}
            <LinkPreviewCard text={content} onPreviewResolved={setLinkPreviewData} />

            {/* Media picker buttons — acima do "Estilo do texto" para acesso rápido */}
            <div className="flex flex-wrap gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                className="hidden"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*,.mp4,.mov,.webm,.mkv,.avi,.wmv,.flv,.m4v,.mpeg,.mpg,.3gp,.3g2,.ts,.mts,.m2ts,.ogv,.qt,.f4v,.vob"
                onChange={handleVideoSelect}
                className="hidden"
              />

              <Button
                size="sm"
                onClick={() => {
                  markFilePickerOpened('image');
                  imageInputRef.current?.click();
                }}
                disabled={!!mediaFile}
                className={cn(
                  "flex-1 min-w-[96px] gap-2 border-0 text-white font-semibold shadow-md hover:opacity-90 active:scale-[0.98] transition",
                  "bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500",
                  mediaType === 'image' && "ring-2 ring-white/40"
                )}
              >
                <Image className="h-4 w-4" />
                Foto
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  if (videoBlockedForFree) {
                    toast({
                      title: "Recurso Premium",
                      description: "Upload de vídeos está disponível apenas para planos Premium e VIP.",
                      variant: "destructive",
                    });
                    return;
                  }
                  markFilePickerOpened('video');
                  videoInputRef.current?.click();
                }}
                disabled={!!mediaFile}
                className={cn(
                  "flex-1 min-w-[96px] gap-2 border-0 text-white font-semibold shadow-md hover:opacity-90 active:scale-[0.98] transition",
                  "bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600",
                  mediaType === 'video' && "ring-2 ring-white/40",
                  videoBlockedForFree && "opacity-60"
                )}
              >
                <Video className="h-4 w-4" />
                Vídeo
                {videoBlockedForFree && <Lock className="h-3 w-3 text-white/80" />}
              </Button>

              <Button
                size="sm"
                onClick={() => setShowPollModal(true)}
                className={cn(
                  "flex-1 min-w-[96px] gap-2 border-0 text-black font-semibold shadow-md hover:opacity-90 active:scale-[0.98] transition",
                  "bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400"
                )}
              >
                <BarChart3 className="h-4 w-4" />
                Enquete
              </Button>
            </div>




            {/* +18 — Blur padrão na mídia (autor define). Logo abaixo de Foto/Vídeo/Enquete, acima do "Estilo do texto". */}
            <label
              htmlFor="adult-toggle"
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                isAdult
                  ? "border-rose-500/60 bg-rose-500/5"
                  : "border-border/50 bg-muted/20 hover:border-rose-500/40"
              )}
            >
              <div className={cn(
                "p-2 rounded-full shrink-0",
                isAdult ? "bg-rose-500/20 text-rose-400" : "bg-muted/30 text-muted-foreground"
              )}>
                <EyeOff className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    "font-medium text-sm",
                    isAdult ? "text-foreground" : "text-muted-foreground"
                  )}>
                    Conteúdo +18
                  </p>
                  <Switch
                    id="adult-toggle"
                    checked={isAdult}
                    onCheckedChange={setIsAdult}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug mt-1">
                  {isAdult
                    ? "Por padrão, sua foto/vídeo aparecerá no feed com blur. Quem quiser ver toca em \"Mostrar\". Desative se a mídia não for adulta."
                    : "Sua mídia será exibida sem blur no feed. Use apenas se o conteúdo não for adulto."}
                </p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Não se aplica a enquetes.
                </p>
              </div>
            </label>

            {/* Barra de estilização (apenas para posts somente-texto) */}
            {!mediaFile && !mediaPreview && extraImageFiles.length === 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    🎨 Estilo do texto
                  </span>
                  {(textFont !== 'default' || textSize !== 16 || textBold || textBg !== 'transparent' || textColor !== 'auto') && (
                    <button
                      type="button"
                      onClick={() => { setTextFont('default'); setTextSize(16); setTextBold(false); setTextBg('transparent'); setTextColor('auto'); }}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Fonte */}
                  <select
                    value={textFont}
                    onChange={(e) => setTextFont(e.target.value)}
                    className="h-8 rounded-md border border-border/50 bg-background px-2 text-xs"
                    aria-label="Fonte"
                  >
                    <option value="default">Padrão</option>
                    <option value="serif">Serifada</option>
                    <option value="mono">Monoespaçada</option>
                    <option value="rounded">Arredondada</option>
                    <option value="display">Display</option>
                  </select>

                  {/* Tamanho */}
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setTextSize((s) => Math.max(12, s - 2))} className="h-8 w-7 rounded-md border border-border/50 bg-background text-sm hover:bg-muted">−</button>
                    <span className="text-xs w-7 text-center tabular-nums">{textSize}px</span>
                    <button type="button" onClick={() => setTextSize((s) => Math.min(32, s + 2))} className="h-8 w-7 rounded-md border border-border/50 bg-background text-sm hover:bg-muted">＋</button>
                  </div>

                  {/* Negrito */}
                  <button
                    type="button"
                    onClick={() => setTextBold((b) => !b)}
                    aria-pressed={textBold}
                    className={cn(
                      "h-8 px-2.5 rounded-md border border-border/50 text-sm font-bold transition-colors",
                      textBold ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                    )}
                    title="Negrito"
                  >
                    B
                  </button>

                  {/* Emoji */}
                  <button
                    type="button"
                    onClick={() => setShowEmojiPanel((v) => !v)}
                    className="h-8 px-2.5 rounded-md border border-border/50 bg-background text-sm hover:bg-muted"
                    aria-expanded={showEmojiPanel}
                    title="Inserir emoji"
                  >
                    😊
                  </button>
                </div>

                {/* Painel de emojis */}
                {showEmojiPanel && (
                  <div className="grid grid-cols-10 gap-1 p-2 rounded-md bg-background border border-border/50">
                    {['😀','😍','😘','🥰','😎','🤩','😂','🥳','😏','😉',
                      '🔥','✨','💫','⭐','💖','❤️','💕','💋','🌹','🍷',
                      '🎉','🎊','🥂','🍾','💎','👑','🌙','☀️','🌊','🦋',
                      '💪','🙌','👏','✌️','🤞','🫦','👀','💭','💬','📍'].map((emo) => (
                      <button
                        key={emo}
                        type="button"
                        onClick={() => { setContent((c) => c + emo); setShowEmojiPanel(false); }}
                        className="text-xl leading-none p-1 rounded hover:bg-muted transition-colors"
                      >
                        {emo}
                      </button>
                    ))}
                  </div>
                )}

                {/* Cor de fundo */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-muted-foreground mr-1">Fundo:</span>
                  {[
                    { v: 'transparent', label: 'Sem fundo', sw: 'bg-transparent border border-dashed border-border' },
                    { v: '#1a1a2e', label: 'Noite', sw: '' },
                    { v: '#7c3aed', label: 'Violeta', sw: '' },
                    { v: '#db2777', label: 'Magenta', sw: '' },
                    { v: '#e11d48', label: 'Rubi', sw: '' },
                    { v: '#f59e0b', label: 'Âmbar', sw: '' },
                    { v: '#10b981', label: 'Esmeralda', sw: '' },
                    { v: '#0ea5e9', label: 'Azul', sw: '' },
                    { v: '#0f172a', label: 'Grafite', sw: '' },
                    { v: '#f5f5f4', label: 'Areia', sw: '' },
                  ].map((c) => (
                    <button
                      key={c.v}
                      type="button"
                      onClick={() => {
                        setTextBg(c.v);
                        // Auto-ajusta cor do texto p/ contraste em fundos coloridos
                        if (c.v === 'transparent') setTextColor('auto');
                        else if (c.v === '#f5f5f4') setTextColor('#0f172a');
                        else setTextColor('#ffffff');
                      }}
                      aria-label={c.label}
                      title={c.label}
                      className={cn(
                        "h-6 w-6 rounded-full ring-offset-background transition-all",
                        textBg === c.v ? "ring-2 ring-primary ring-offset-2 scale-110" : "ring-1 ring-border/60 hover:scale-105",
                        c.sw
                      )}
                      style={c.v !== 'transparent' ? { backgroundColor: c.v } : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Video Error */}
            {videoError && (
              <div className="flex flex-col gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <p className="text-sm">{videoError}</p>
                </div>
                {oversizedVideo && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setOversizedVideo(oversizedVideo)}
                    className="self-start"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Editar / cortar vídeo
                  </Button>
                )}
              </div>
            )}

            {/* Upload Progress (sem preview ainda) */}
            {smartProgress && !mediaPreview && (
              <UploadProgressOverlay progress={smartProgress} className="w-full max-h-64" />
            )}

            {/* Media Preview */}
            {mediaPreview && (
              <div className="relative rounded-lg overflow-hidden gradient-border">
                <div className="relative">
                  {/* Overlay de progresso de upload sobre o preview */}
                  {(isPosting || smartProgress) && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-lg p-4">
                      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm font-medium text-foreground text-center">
                        {smartProgress?.message || uploadProgress || 'Enviando...'}
                      </p>
                      <div className="w-full max-w-[240px] h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300 ease-out"
                          style={{ width: `${smartProgress?.percent ?? (uploadProgress ? 95 : 0)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {smartProgress?.percent != null ? `${Math.round(smartProgress.percent)}%` : ''}
                      </p>
                    </div>
                  )}
                  {mediaType === 'image' ? (
                    <>
                      <img loading="lazy" decoding="async"
                        src={mediaPreview}
                        alt="Preview"
                        className="w-full max-h-64 object-cover rounded-lg"
                      />
                      {isEdited && extraImagePreviews.length === 0 && (
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-primary/90 text-primary-foreground text-xs font-medium flex items-center gap-1">
                          <Pencil className="h-3 w-3" />
                          Editado
                        </div>
                      )}
                      {extraImagePreviews.length > 0 && (
                        <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-semibold">
                          Carrossel · {extraImagePreviews.length + 1} fotos
                        </div>
                      )}
                      {extraImagePreviews.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center justify-between gap-2 px-1">
                            <button
                              type="button"
                              onClick={() => {
                                setLightboxIndex(0);
                                setLightboxOpen(true);
                              }}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              👁️ Ver todas em tela cheia
                            </button>
                            <span className="text-[11px] text-muted-foreground">
                              Toque em uma foto para abrir
                            </span>
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
                            {[mediaPreview, ...extraImagePreviews].map((src, i) => {
                              const status = carouselProgress[i];
                              const isUploading = status === 'uploading';
                              const isDone = status === 'done';
                              const isError = status === 'error';
                              return (
                                <button
                                  key={`${src}-${i}`}
                                  type="button"
                                  onClick={() => {
                                    setLightboxIndex(i);
                                    setLightboxOpen(true);
                                  }}
                                  className={cn(
                                    "relative h-14 w-14 shrink-0 rounded-md overflow-hidden border-2 transition",
                                    i === 0 ? "border-primary" : "border-border/50",
                                    isError && "border-destructive"
                                  )}
                                  aria-label={`Abrir foto ${i + 1}`}
                                >
                                  <img
                                    src={src ?? undefined}
                                    alt={`Foto ${i + 1}`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                  {isUploading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                      <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                    </div>
                                  )}
                                  {isDone && isPosting && (
                                    <div className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                                      ✓
                                    </div>
                                  )}
                                  {isError && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/70 text-destructive-foreground text-[10px] font-bold">
                                      ERRO
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="relative">
                      <video preload="none"
                        src={mediaPreview}
                        className="w-full max-h-64 object-cover rounded-lg"
                        controls
                        playsInline
                        controlsList="nodownload nofullscreen noremoteplayback"
                        disablePictureInPicture
                        onContextMenu={(e) => e.preventDefault()}
                      />
                      {/* Video Watermark Overlay */}
                      <div className="absolute bottom-4 right-4 text-white/70 text-sm font-semibold pointer-events-none drop-shadow-lg">
                        OCULTO • @{profile?.username || 'voce'}
                      </div>
                      {videoDuration && (
                        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-background/80 text-xs font-medium">
                          ⏱️ {videoDuration}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    onClick={removeMedia}
                    className="absolute top-2 right-2 p-2 rounded-full bg-background/80 hover:bg-destructive/80 text-foreground hover:text-destructive-foreground transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Video cover picker — escolher frame como capa do feed */}
            {mediaType === 'video' && mediaFile && !videoError && (
              <VideoCoverPicker
                videoFile={mediaFile}
                onCoverSelected={handleCoverSelected}
                selectedCoverUrl={videoThumbnail}
              />
            )}

            {/* Pré-visualização da capa que será usada nos compartilhamentos externos
                (WhatsApp, Telegram, X, Facebook). Atualiza automaticamente conforme
                o usuário troca o frame da capa do vídeo. */}
            {mediaType === 'video' && mediaFile && !videoError && videoThumbnail && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Capa para compartilhamento externo
                  </p>
                </div>
                <div className="relative aspect-[1.91/1] w-full overflow-hidden rounded-lg bg-black">
                  <img
                    src={videoThumbnail}
                    alt="Capa que será exibida ao compartilhar este vídeo"
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  Esta imagem será usada como prévia (og:image) quando o link do
                  post for compartilhado no WhatsApp, Telegram, X, Facebook etc.
                </p>
              </div>
            )}

            {/* Media picker buttons — movidos para acima do "Estilo do texto". */}




            {/* Toggle Flash Story */}
            <div 
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                isFlashStory 
                  ? "border-[#FF007F] bg-[#FF007F]/10" 
                  : "border-border/50 hover:border-[#FF007F]/30 bg-muted/20"
              )}
              onClick={() => setIsFlashStory(!isFlashStory)}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  isFlashStory ? "bg-[#FF007F]/20" : "bg-muted/30"
                )}>
                  <Zap className={cn(
                    "h-5 w-5",
                    isFlashStory ? "text-[#FF007F]" : "text-muted-foreground"
                  )} />
                </div>
                <div>
                  <p className={cn(
                    "font-medium",
                    isFlashStory ? "text-foreground" : "text-muted-foreground"
                  )}>
                    ⚡ Flash Story (24h)
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Desaparece automaticamente em 24 horas</span>
                  </div>
                </div>
              </div>
              <Switch 
                checked={isFlashStory} 
                onCheckedChange={setIsFlashStory}
                className="data-[state=checked]:bg-[#FF007F]"
              />
            </div>

            {/* Toggle Agendar postagem */}
            {!isEditMode && (
              <div className={cn("rounded-lg border transition-all", isScheduled ? "border-primary bg-primary/5" : "border-border/50 bg-muted/20")}>
                <div
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => setIsScheduled(!isScheduled)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-full", isScheduled ? "bg-primary/20" : "bg-muted/30")}>
                      <CalendarClock className={cn("h-5 w-5", isScheduled ? "text-primary" : "text-muted-foreground")} />
                    </div>
                    <div>
                      <p className={cn("font-medium", isScheduled ? "text-foreground" : "text-muted-foreground")}>
                        📅 Agendar postagem
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Publica automaticamente no dia e horário escolhidos
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={isScheduled}
                    onCheckedChange={setIsScheduled}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-primary"
                  />
                </div>

                {isScheduled && (
                  <div className="px-3 pb-3 space-y-2 animate-in fade-in-50 slide-in-from-top-2 duration-200">
                    <Input
                      type="datetime-local"
                      value={scheduledFor}
                      min={(() => {
                        // datetime-local espera horário LOCAL, não UTC.
                        // Subtrai o offset para obter o "agora local" + 1 min.
                        const d = new Date(Date.now() + 60_000);
                        const tz = d.getTimezoneOffset() * 60_000;
                        return new Date(d.getTime() - tz).toISOString().slice(0, 16);
                      })()}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className="bg-muted/30 border-border/50"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowScheduledList(true)}
                      className="w-full justify-center text-xs"
                    >
                      <ListChecks className="h-3.5 w-3.5 mr-1.5" />
                      Ver posts agendados
                    </Button>
                  </div>
                )}

                {!isScheduled && (
                  <button
                    type="button"
                    onClick={() => setShowScheduledList(true)}
                    className="w-full px-3 pb-3 text-[11px] text-muted-foreground hover:text-primary text-left flex items-center gap-1"
                  >
                    <ListChecks className="h-3 w-3" /> Ver posts já agendados
                  </button>
                )}
              </div>
            )}

            {/* Visibility selector - 3 options (desativado se for Flash Story) */}
            <div className={cn("space-y-3", isFlashStory && "opacity-50 pointer-events-none")}>
              <Label className="text-sm font-medium text-muted-foreground">
                Visibilidade do post
              </Label>
              <RadioGroup
                value={visibility}
                onValueChange={(value) => setVisibility(value as PostVisibility)}
                className="space-y-2"
              >
                {visibilityOptions.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={option.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg transition-all",
                      "border",
                      option.locked
                        ? "border-border/30 bg-muted/10 opacity-60 cursor-not-allowed"
                        : "cursor-pointer",
                      !option.locked && visibility === option.value
                        ? option.isMonetized
                          ? "border-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10"
                          : "border-primary bg-primary/10"
                        : !option.locked
                          ? "border-border/50 hover:border-primary/30 bg-muted/20"
                          : "",
                      option.isMonetized && "relative overflow-hidden"
                    )}
                    onClick={option.locked ? (e) => {
                      e.preventDefault();
                      toast({
                        title: "Recurso exclusivo VIP",
                        description: "Somente usuários VIP podem criar posts pagos (visibilidade VIP). Faça upgrade para desbloquear.",
                      });
                    } : undefined}
                  >
                    {option.isMonetized && !option.locked && (
                      <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)] rounded-bl-lg">
                        💰 MONETIZA
                      </div>
                    )}
                    {option.isMonetized && option.locked && (
                      <div className="absolute top-0 right-0 px-2 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground rounded-bl-lg flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" />VIP
                      </div>
                    )}
                    <RadioGroupItem
                      value={option.value}
                      id={option.value}
                      className="sr-only"
                      disabled={option.locked}
                    />
                    <div className={cn(
                      "p-2 rounded-full",
                      option.locked
                        ? "bg-muted/30"
                        : visibility === option.value
                          ? option.isMonetized
                            ? "bg-[hsl(45,93%,47%)]/20"
                            : "bg-primary/20"
                          : "bg-muted/30"
                    )}>
                      <option.icon className={cn(
                        "h-5 w-5",
                        option.locked
                          ? "text-muted-foreground"
                          : visibility === option.value
                            ? option.isMonetized
                              ? "text-[hsl(45,93%,47%)]"
                              : "text-primary"
                            : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1">
                      <p className={cn(
                        "font-medium",
                        option.locked ? "text-muted-foreground" : visibility === option.value ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {option.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                      option.locked
                        ? "border-muted-foreground/20"
                        : visibility === option.value
                          ? option.isMonetized
                            ? "border-[hsl(45,93%,47%)]"
                            : "border-primary"
                          : "border-muted-foreground/30"
                    )}>
                      {!option.locked && visibility === option.value && (
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          option.isMonetized ? "bg-[hsl(45,93%,47%)]" : "bg-primary"
                        )} />
                      )}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>


            {/* Monetization Section - Configurações de Venda */}
            <div className={cn("space-y-3 border rounded-lg p-3", isFlashStory && "opacity-50 pointer-events-none")}>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                <Label className="text-sm font-medium">Configurações de Venda</Label>
              </div>

              {!canCreatePaidContent ? (
                /* Non-VIP: locked state */
                <div className="space-y-3 opacity-50 pointer-events-none select-none">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-muted/10">
                    <div className="flex items-center gap-3">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Conteúdo Pago (PPV)</span>
                    </div>
                    <Switch disabled checked={false} />
                  </div>
                  <div className="p-2 rounded bg-muted/20 border border-border/30">
                    <Input disabled placeholder="R$ 0,00" className="opacity-50" />
                  </div>
                </div>
              ) : (
                /* VIP: active state */
                <>
                  <div 
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                      isPaidContent
                        ? "border-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10"
                        : "border-border/50 hover:border-[hsl(45,93%,47%)]/30 bg-muted/20"
                    )}
                    onClick={() => setIsPaidContent(!isPaidContent)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("p-1.5 rounded-full", isPaidContent ? "bg-[hsl(45,93%,47%)]/20" : "bg-muted/30")}>
                        <DollarSign className={cn("h-4 w-4", isPaidContent ? "text-[hsl(45,93%,47%)]" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <p className={cn("text-sm font-medium", isPaidContent ? "text-foreground" : "text-muted-foreground")}>
                          Conteúdo Pago (PPV)
                        </p>
                        <p className="text-[10px] text-muted-foreground">Cobrar para desbloquear</p>
                      </div>
                    </div>
                    <Switch
                      checked={isPaidContent}
                      onCheckedChange={setIsPaidContent}
                      className="data-[state=checked]:bg-[hsl(45,93%,47%)]"
                    />
                  </div>

                  {isPaidContent && (
                    <div className="space-y-3 animate-in fade-in-50 slide-in-from-top-2 duration-200">
                      {/* Price input */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Preço (R$)</Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">R$</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="9,90"
                            value={paidPrice}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9,\.]/g, '');
                              setPaidPrice(val);
                            }}
                            className="pl-10 bg-muted/30 border-border/50"
                          />
                        </div>
                      </div>

                      {/* Split calculator preview */}
                      {(() => {
                        const price = parseFloat(paidPrice.replace(',', '.')) || 0;
                        if (price <= 0) return null;
                        const tax = price * 0.06;
                        const base = price - tax;
                        const platformFee = base * 0.20;
                        const affiliateFee = base * 0.05;
                        const creatorNet = base - platformFee - affiliateFee;
                        return (
                          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30 space-y-1.5">
                            <div className="flex items-center gap-1 mb-1">
                              <Info className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground font-medium">Distribuição por venda</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                              <span className="text-muted-foreground">Impostos (6%)</span>
                              <span className="text-right text-destructive">-R$ {tax.toFixed(2)}</span>
                              <span className="text-muted-foreground">Taxa OCULTO (20%)</span>
                              <span className="text-right text-destructive">-R$ {platformFee.toFixed(2)}</span>
                              <span className="text-muted-foreground">Afiliado (5%)</span>
                              <span className="text-right text-destructive">-R$ {affiliateFee.toFixed(2)}</span>
                              <span className="font-semibold text-foreground">Você recebe</span>
                              <span className="text-right font-semibold text-green-500">R$ {creatorNet.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Intensidade do borrão da prévia */}
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Intensidade do borrão (prévia bloqueada)
                        </Label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { v: 'light', label: 'Leve', hint: 'Mostra mais' },
                            { v: 'medium', label: 'Médio', hint: 'Equilibrado' },
                            { v: 'strong', label: 'Forte', hint: 'Esconde tudo' },
                          ] as const).map((opt) => {
                            const active = previewBlur === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                onClick={() => { setPreviewBlur(opt.v); setDefaultBlurPref(opt.v); }}
                                className={cn(
                                  "rounded-lg border p-2 text-left transition-colors",
                                  active
                                    ? "border-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10"
                                    : "border-border/40 bg-muted/20 hover:border-border"
                                )}
                              >
                                <div className={cn("text-xs font-semibold", active ? "text-[hsl(45,93%,55%)]" : "text-foreground")}>
                                  {opt.label}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Define o quanto da imagem aparece para quem ainda não comprou.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Upgrade CTA for non-VIP */}
              {!canCreatePaidContent && (
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-gradient-to-r from-[hsl(45,93%,47%)]/20 to-[hsl(35,93%,47%)]/20 border border-[hsl(45,93%,47%)]/30 hover:border-[hsl(45,93%,47%)]/60 transition-colors"
                  onClick={() => {
                    toast({ title: "Upgrade para VIP", description: "Acesse Planos para desbloquear vendas de conteúdo." });
                  }}
                >
                  <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                  <span className="text-xs font-semibold text-[hsl(45,93%,47%)]">Seja VIP para vender conteúdo</span>
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 p-4 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1.25rem))] border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 shrink-0">

            <Button
              onClick={handlePost}
              disabled={!canPost || isPosting}
              className={cn(
                "w-full font-semibold h-12 disabled:opacity-50 disabled:cursor-not-allowed",
                (visibility === 'vip' || isPaidContent)
                  ? "bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-[hsl(45,93%,10%)] hover:opacity-90"
                  : "glow-primary bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground"
              )}
            >
              {isPosting ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  {uploadProgress || "Publicando..."}
                </span>
              ) : isScheduled && scheduledFor ? (
                <span className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Agendar para {new Date(scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : (
                isPaidContent && parsedPriceVal > 0
                  ? `💰 ${isEditMode ? 'Salvar' : 'Postar'} por R$ ${paidPrice}`
                  : visibility === 'vip' ? (isEditMode ? "💾 Salvar VIP" : "💰 Postar VIP") : (isEditMode ? "Salvar alterações" : "Postar")
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox de revisão do carrossel (até 10 fotos) */}
      <CarouselLightbox
        open={lightboxOpen}
        images={
          mediaType === 'image' && mediaPreview
            ? [mediaPreview, ...extraImagePreviews].filter((u): u is string => !!u)
            : []
        }
        initialIndex={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Image Editor Modal */}
      {pendingImageFile && (
        <Suspense fallback={null}>
          <ImageEditor
            open={showEditor}
            onOpenChange={(value) => {
              setShowEditor(value);
              if (!value) {
                setPendingImageFile(null);
              }
            }}
            imageFile={pendingImageFile}
            onSave={handleEditorSave}
            onLoadError={(reason) => {
              toast({
                title: "Não consegui carregar a imagem",
                description:
                  reason ||
                  "Tente outra foto ou converta-a para JPG/PNG e tente novamente. Seu texto foi mantido.",
                variant: "destructive",
              });
              setShowEditor(false);
              setPendingImageFile(null);
            }}
          />
        </Suspense>
      )}


      {/* Poll Modal */}
      <CreatePollModal
        open={showPollModal}
        onOpenChange={setShowPollModal}
      />

      {/* Lista de posts agendados */}
      <ScheduledPostsModal open={showScheduledList} onOpenChange={setShowScheduledList} />


      {/* Wallet Alert */}
      <AlertDialog open={showWalletAlert} onOpenChange={setShowWalletAlert}>
        <AlertDialogContent className="w-[90vw] max-w-sm bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              ⚠️ Ação Necessária
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Para vender conteúdo VIP e receber seus <strong className="text-green-400">74% líquidos</strong>, complete sua <strong>ativação de monetização</strong>: cadastre seus dados, envie seus documentos e informe sua <strong>chave PIX</strong>.
              <br /><br />
              Toque em <strong>Configurar</strong> para iniciar. A aprovação é feita pela equipe Oculto e o restante é automático.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogAction
              onClick={() => { window.location.href = '/bank-info'; }}
              className="w-full h-10 bg-primary text-primary-foreground hover:opacity-90"
            >
              Configurar
            </AlertDialogAction>
            <AlertDialogAction className="w-full h-10 bg-muted text-foreground hover:bg-muted/80">
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Video Trimmer / Compressor Modal */}
      {oversizedVideo && (
        <Suspense fallback={null}>
          <VideoTrimmerModal
            open={!!oversizedVideo}
            onOpenChange={(o) => { if (!o) setOversizedVideo(null); }}
            file={oversizedVideo}
            maxSizeMB={20}
            onResult={(optimized) => {
              setOversizedVideo(null);
              setVideoError(null);
              validateAndSetVideo(optimized);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
