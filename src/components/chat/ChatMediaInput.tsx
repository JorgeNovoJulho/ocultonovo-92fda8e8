import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Paperclip, Camera, Mic, Send, X, Image as ImageIcon, Film, FileText, Smile, Gift, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useUserStickers } from '@/hooks/useUserStickers';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaUploadWithLimits } from '@/hooks/useMediaUploadWithLimits';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { CameraModal } from './CameraModal';
import imageCompression from 'browser-image-compression';
import { compressVideo } from '@/lib/videoCompression';
import { sliceVideoIntoChapters, getVideoDuration } from '@/lib/videoChunker';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseExternal';
import { AttentionPingButton } from '@/components/chat/AttentionPingButton';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Lista de extensões consideradas perigosas/maliciosas no chat.
 * Bloqueamos no ingest (input, paste, drag-and-drop) antes de qualquer upload.
 */
const MALICIOUS_FILE_EXT_REGEX = /\.(exe|bat|cmd|scr|vbs|vbe|js|jse|ps1|ps2|psm1|psd1|wsf|wsh|hta|msi|msp|com|pif|jar|sh|bash|zsh|app|apk|ipa|deb|rpm|dmg|iso|reg|dll|sys|lnk|url|chm|cpl|inf|svg|html|htm|xhtml|xht|php|asp|aspx|jsp|rb|py|pyc|pyo|docm|xlsm|pptm|dotm|xlsb|xlam|cab|7z|rar|gz|tar)$/i;

const ALLOWED_CHAT_MIME_REGEX = /^(image\/(jpeg|jpg|png|gif|bmp|webp)|video\/(mp4|webm|quicktime)|application\/pdf|audio\/(webm|mp4|mpeg|ogg|wav))$/i;

/**
 * Heurística leve "antivírus" para o chat: rejeita por extensão perigosa,
 * mime não permitido, magic-bytes desconhecidos ou tamanho zero/absurdo.
 * Não substitui um AV de servidor; serve como primeira barreira no cliente.
 */
function chatSecurityScan(file: File): { ok: true } | { ok: false; reason: string } {
  if (!file || file.size === 0) return { ok: false, reason: 'Arquivo vazio ou inválido' };
  if (file.size > 60 * 1024 * 1024) return { ok: false, reason: 'Arquivo muito grande (limite 60MB)' };
  const name = (file.name || '').toLowerCase();
  if (MALICIOUS_FILE_EXT_REGEX.test(name)) {
    return { ok: false, reason: 'Tipo de arquivo bloqueado por segurança' };
  }
  const mime = (file.type || '').toLowerCase();
  if (mime && !ALLOWED_CHAT_MIME_REGEX.test(mime)) {
    return { ok: false, reason: 'Formato não permitido no chat' };
  }
  return { ok: true };
}

/**
 * Detecta URLs/links no texto. Bloqueamos no chat para evitar que arquivos
 * maliciosos hospedados externamente sejam compartilhados.
 */
const URL_DETECTION_REGEX = /(https?:\/\/\S+|www\.\S+|\b[a-z0-9-]{2,}\.(com|net|org|io|co|br|me|app|tv|gg|xyz|ly|to|info|live|online|store|site|pro|club|shop|link|page|biz|us|uk|ru|cn|de)(\/\S*)?\b)/i;

// Marcador interno usado para indicar resposta a uma mensagem específica.
// É um prefixo zero-width + seta que renderizamos como bloco "quote" no bubble.
export const REPLY_MARKER_PREFIX = '\u200B↪|';
export const REPLY_MARKER_SUFFIX = '|\u200B\n';
export function buildReplyMarker(snippet: string): string {
  const clean = (snippet || '').replace(/\s+/g, ' ').slice(0, 140).replace(/\|/g, '∣');
  return `${REPLY_MARKER_PREFIX}${clean}${REPLY_MARKER_SUFFIX}`;
}

const COMMON_EMOJIS = [
  // Carinhas e expressões
  '😀','😁','😂','🤣','😅','😊','😇','🙂','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓',
  '😎','🥳','🤩','😏','😒','🙄','😬','🤥','😶','🤐','😴','🤤',
  '😪','😮','😯','😲','🥺','😢','😭','😤','😠','😡','🤬','🤯',
  '😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🫣','🫢',
  // Diabinhos e travessos (incluindo o roxo com chifre)
  '😈','👿','👹','👺','💀','☠️','👻','🤡','👽','🤖','💩',
  // Mãos / gestos
  '👍','👎','👏','🙌','🙏','💪','✊','🤞','✌️','🤝','👋','🫶',
  '☝️','👉','👈','👆','👇','🤘','🤙','🫦',
  // Corações e amor
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💖','💕','💞',
  '💓','💗','💘','💝','💟','💌','💋','😻',
  // Picantes / sensual (incluindo beringela, gotinhas, língua, fogo)
  '🍆','🍑','🍒','🍓','🍌','🍉','🥒','🌶️','🍯','🥛','🍷','🍸',
  '💦','💧','👅','👄','💄','🔥','🥵','💥','✨','💫','⭐','🌟',
  // Festa e presentes
  '🎉','🎊','🥂','🍾','🎁','🌹','🌺','🌸','🌷','🎂','🍰','🍫',
  // Símbolos úteis
  '💯','✅','❌','⚠️','💢','💤','🆗','🔞','📣','📸','🎬','🎵',
];

// Figurinhas — agrupadas por temas, com combos e variações que não aparecem
// no picker de emojis. Sempre enviadas em tamanho grande.
const STICKER_GROUPS: { title: string; items: string[] }[] = [
  {
    title: 'Risadas e zoeira',
    items: ['😂','🤣','😹','🤡','💀','🥲','😭','😅','😆','🙃','😜','🤪','🤭','😏','🤣💀','😂🔥','💀💀','🤣🤣'],
  },
  {
    title: 'Amor e fofura',
    items: ['😍','🥰','😘','😻','🤗','🥺','☺️','🫶','😌','😚','💖','💗','💘','💞','💝','💌','❤️‍🔥','😍❤️','🥰💕','😘💋'],
  },
  {
    title: 'Flerte e sensual',
    items: ['😏','😈','👿','😜','🤤','👅','💋','🔥','💦','🍑','🍆','🌶️','🥵','😼','😈🔥','👅💦','🥵🔥','💋💋','🍆💦'],
  },
  {
    title: 'Energia e festa',
    items: ['🥳','🤩','🎉','🎊','🥂','🍾','🪩','✨','💫','⭐','🌟','💥','🔥','🚀','🎁','🌈','🎉🥂','🔥🔥','✨🎉','🤩✨'],
  },
  {
    title: 'Reações fortes',
    items: ['😱','🤯','😳','😵','😲','😨','🤬','😡','🙄','😒','😶','🫠','🫡','🫥','😶‍🌫️','💔','😭💔','🤯🤯','😱💀','🙄✨'],
  },
  {
    title: 'Aprovação e mãos',
    items: ['👍','👎','👏','🙌','🙏','💪','🤝','✊','🤘','🤙','👌','✌️','🤞','☝️','🫰','💯','👏👏','🙌✨','💪🔥','🙏❤️'],
  },
  {
    title: 'Kaomoji clássicos',
    items: ['(ᵔᴥᵔ)','( ͡° ͜ʖ ͡°)','¯\\_(ツ)_/¯','(¬‿¬)','(╯°□°)╯︵ ┻━┻','┬─┬ノ( º _ ºノ)','(◕‿◕)','(づ｡◕‿‿◕｡)づ','ʕ•ᴥ•ʔ','(✿◠‿◠)','(｡♥‿♥｡)','(>ω<)','(；⌣̀_⌣́)','( •_•)>⌐■-■','(⌐■_■)','◉_◉','(；￣Д￣)','(*≧ω≦*)'],
  },
  {
    title: 'Pets e bichinhos',
    items: ['🐶','🐱','🐻','🐼','🐨','🦊','🐰','🐹','🦄','🐯','🦁','🐸','🐵','🙈','🙉','🙊','🐺','🦝','🐧','🐤'],
  },
];

// Mantida para compatibilidade (não exibida diretamente, achatamento opcional).
const STICKER_EMOJIS = STICKER_GROUPS.flatMap((g) => g.items);


async function uploadPdfDirect(file: File, userId: string): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const path = `${userId}/chat-media/${Date.now()}_${safeName}`;
  const { data, error } = await supabase.storage
    .from('chat-media')
    .upload(path, file, { cacheControl: '3600', contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  return `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/chat-media/${data.path}`;
}

const MAX_VIDEO_DURATION_SECONDS = 15;
const MAX_CHUNKED_VIDEO_SECONDS = 90; // 1:30 — limite total quando fatiamos em capítulos de 15s
const MIN_RECORDING_SECONDS = 1;
const SWIPE_CANCEL_THRESHOLD = 80;

export interface ChatMediaInputHandle {
  retryUpload: (params: { file: File; mediaType: 'image' | 'video' | 'document'; tempId: string; localPreview?: string }) => Promise<void>;
  acceptExternalFile: (file: File) => Promise<void>;
}

interface ChatMediaInputProps {
  onSendMessage: (content: string, mediaUrl?: string, mediaType?: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  onMediaBlocked?: () => void;
  /** Callback invocado otimisticamente com a preview local antes do upload completar */
  onOptimisticSend?: (content: string, localPreview: string, mediaType: string, meta?: { progress?: number; label?: string }, file?: File) => string;
  /** Callback após upload completo para confirmar a mensagem otimista */
  onOptimisticConfirm?: (tempId: string, realUrl: string, meta?: { progress?: number; label?: string; error?: boolean }) => void;
  /** Quando upload falha, devolve o File preservado p/ que o caller permita reenviar */
  onUploadFailed?: (tempId: string, file: File, mediaType: 'image' | 'video' | 'document') => void;
  /** Quando o usuário cancela um upload em andamento — caller deve remover a bolha otimista */
  onUploadCancelled?: (tempId: string) => void;
  /** Permite o pai injetar arquivos via drag-and-drop */
  onExternalFiles?: (files: File[]) => void;
  /** Destinatário do botão "Chamar Atenção" embutido na barra de ações */
  attentionToUserId?: string | null;
  attentionToProfileId?: string | null;
  attentionConversationId?: string | null;
  /** Conversa atual — usada para persistir rascunho por conversa */
  conversationId?: string | null;
  /** Notifica o destinatário que o usuário está digitando (broadcast) */
  onTypingChange?: (isTyping: boolean) => void;
  /** Abre o modal de presente XP com o destinatário travado nesta conversa */
  onOpenGift?: () => void;
  /** Mensagem que está sendo respondida — exibe banner acima do input */
  replyTo?: { id: string; content: string; senderLabel?: string | null; isMine?: boolean } | null;
  /** Cancela o estado de resposta (X no banner) */
  onCancelReply?: () => void;
}

const DRAFT_KEY = (id: string) => `chat:draft:${id}`;
const TYPING_AUTO_STOP_MS = 3500;

export const ChatMediaInput = forwardRef<ChatMediaInputHandle, ChatMediaInputProps>(function ChatMediaInput(
  { onSendMessage, disabled = false, isLoading = false, onMediaBlocked, onOptimisticSend, onOptimisticConfirm, onUploadFailed, onUploadCancelled, attentionToUserId, attentionToProfileId, attentionConversationId, conversationId, onTypingChange, onOpenGift, replyTo, onCancelReply },
  ref,
) {
  // Chat de mídia liberado igualmente para Free, Premium e VIP.
  const canSendChatAudio = true;
  const canSendChatVideo = true;
  const canUseChatCamera = true;
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<{
    file: File; preview: string; type: 'image' | 'video' | 'document';
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const uploadAbortedRef = useRef(false);
  const currentUploadTempIdRef = useRef<string | null>(null);

  // Hold-to-record state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const pointerStartX = useRef(0);
  const isHolding = useRef(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Separate refs for image-only vs all media
  const imageOnlyInputRef = useRef<HTMLInputElement>(null);

  const { validateFile, uploadMedia } = useMediaUploadWithLimits();
  const audio = useAudioRecorder();

  // ── Rascunho persistido por conversa ───────────────────────────────────
  // Ao trocar de conversa: hidrata o input com o último texto digitado e
  // não enviado. Garante que reload/clique-fora/troca de aba não perca nada.
  const hydratedConvRef = useRef<string | null>(null);
  useEffect(() => {
    if (!conversationId) return;
    if (hydratedConvRef.current === conversationId) return;
    hydratedConvRef.current = conversationId;
    try {
      const draft = localStorage.getItem(DRAFT_KEY(conversationId)) || '';
      setMessage(draft);
    } catch { /* localStorage indisponível */ }
  }, [conversationId]);

  // Salva o rascunho a cada keystroke (best-effort, síncrono e barato).
  useEffect(() => {
    if (!conversationId) return;
    try {
      if (message) localStorage.setItem(DRAFT_KEY(conversationId), message);
      else localStorage.removeItem(DRAFT_KEY(conversationId));
    } catch { /* noop */ }
  }, [conversationId, message]);

  // ── "Digitando..." — broadcast com auto-stop após inatividade ───────────
  const typingActiveRef = useRef(false);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifyTyping = useCallback((isTyping: boolean) => {
    if (!onTypingChange) return;
    if (isTyping) {
      if (!typingActiveRef.current) {
        typingActiveRef.current = true;
        onTypingChange(true);
      }
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = setTimeout(() => {
        typingActiveRef.current = false;
        onTypingChange(false);
      }, TYPING_AUTO_STOP_MS);
    } else {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        onTypingChange(false);
      }
    }
  }, [onTypingChange]);
  useEffect(() => () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (typingActiveRef.current && onTypingChange) onTypingChange(false);
  }, [onTypingChange]);
  // Ao trocar de conversa, encerra o estado de digitação anterior.
  useEffect(() => () => notifyTyping(false), [conversationId, notifyTyping]);


  // Auto-send audio on release
  const sendAudioBlob = useCallback(async (blob: Blob, duration: number) => {
    if (duration < MIN_RECORDING_SECONDS) {
      toast.error('Gravação muito curta');
      return;
    }
    if (!canSendChatAudio) {
      onMediaBlocked?.();
      return;
    }
    try {
      setIsUploading(true);
      const audioFile = new File([blob], `audio_${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
      const uploaded = await uploadMedia(audioFile, 'chat-media');
      onSendMessage('🎤 Mensagem de áudio', uploaded.url, 'audio');
    } catch {
      toast.error('Erro ao enviar áudio');
    } finally {
      setIsUploading(false);
    }
  }, [uploadMedia, onSendMessage, canSendChatAudio, onMediaBlocked]);

  // Processa um File (vindo de input, câmera, paste ou drag-and-drop)
  const ingestFile = useCallback(async (file: File): Promise<void> => {
    // 🔒 Verificação de segurança contra arquivos maliciosos (extensão + mime)
    const scan = chatSecurityScan(file);
    if (scan.ok === false) {
      toast.error(`🛡️ ${scan.reason}. Envio bloqueado.`);
      return;
    }
    // PDF support (todos os planos)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (isPdf) {
      if (file.size > MAX_PDF_SIZE) {
        toast.error('PDF muito grande. Limite: 20MB.');
        return;
      }
      setSelectedMedia({ file, preview: 'pdf://' + file.name, type: 'document' });
      return;
    }

    if (file.type.startsWith('video/') && !canSendChatVideo) {
      onMediaBlocked?.();
      return;
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      if (validation.suggestUpgrade) {
        toast.error(validation.error || 'Arquivo inválido');
        return;
      }
      toast.error(validation.error || 'Arquivo inválido');
      return;
    }
    if (validation.mediaType === 'video') {
      const duration = await getVideoDuration(file);
      if (duration > MAX_CHUNKED_VIDEO_SECONDS + 0.5) {
        toast.error(`Vídeo muito longo. Máximo: ${MAX_CHUNKED_VIDEO_SECONDS}s (1:30).`);
        return;
      }
      if (duration > MAX_VIDEO_DURATION_SECONDS + 0.2) {
        // Fatiamento automático em capítulos de 15s
        await handleChunkedVideoUpload(file, duration);
        return;
      }
    }
    const preview = URL.createObjectURL(file);
    setSelectedMedia({ file, preview, type: validation.mediaType! });
  }, [validateFile, canSendChatVideo, onMediaBlocked]);

  /**
   * Fatia um vídeo (15s < dur ≤ 90s) em capítulos de 15s e envia cada um
   * como mensagem separada, mantendo a ordem cronológica.
   */
  const handleChunkedVideoUpload = useCallback(async (file: File, duration: number) => {
    const totalChunks = Math.ceil(Math.min(duration, MAX_CHUNKED_VIDEO_SECONDS) / MAX_VIDEO_DURATION_SECONDS);
    toast(`Vídeo dividido em ${totalChunks} capítulos de 15s — enviando…`, {
      description: 'Capítulos serão enviados em ordem. Não feche o app.',
      duration: 6000,
    });
    setIsUploading(true);
    setUploadProgress(1);
    try {
      const chunks = await sliceVideoIntoChapters(file, {
        chunkSeconds: MAX_VIDEO_DURATION_SECONDS,
        maxTotalSeconds: MAX_CHUNKED_VIDEO_SECONDS,
        onProgress: (p) => setUploadProgress(Math.max(1, Math.round(p * 0.4))),
      });
      if (!chunks.length) {
        toast.error('Não foi possível fatiar o vídeo. Tente um arquivo menor.');
        return;
      }
      // Envio sequencial — preserva ordem dos capítulos
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const caption = `🎬 Capítulo ${c.index}/${c.totalChunks}`;
        try {
          const uploaded = await uploadMedia(c.file, 'chat-media');
          onSendMessage(caption, uploaded.url, 'video');
          setUploadProgress(40 + Math.round(((i + 1) / chunks.length) * 60));
        } catch (err) {
          console.error('[chunked-upload] falhou cap', c.index, err);
          toast.error(`Falha no capítulo ${c.index}/${c.totalChunks}`);
        }
      }
      toast.success('Todos os capítulos enviados!');
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 800);
    }
  }, [uploadMedia, onSendMessage]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestFile(file);
    e.target.value = '';
  }, [ingestFile]);


  // Open camera
  const handleCameraClick = useCallback(() => {
    if (!canUseChatCamera) { onMediaBlocked?.(); return; }
    setShowCameraModal(true);
  }, [canUseChatCamera, onMediaBlocked]);

  // Handle capture from live camera
  const handleCameraCapture = useCallback((file: File, type: 'image' | 'video') => {
    // Block video captured from camera for free users
    if (type === 'video' && !canSendChatVideo) {
      onMediaBlocked?.();
      return;
    }
    const preview = URL.createObjectURL(file);
    setSelectedMedia({ file, preview, type });
  }, [canSendChatVideo, onMediaBlocked]);

  // Attachment click: todos os planos podem anexar imagens, vídeos e documentos.
  const handleAttachmentClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const checkVideoDuration = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration <= MAX_VIDEO_DURATION_SECONDS); };
      video.onerror = () => resolve(true);
      video.src = URL.createObjectURL(file);
    });
  };

  const handleRemoveMedia = useCallback(() => {
    if (selectedMedia) {
      // PDF não tem blob URL; image/video sim
      if (selectedMedia.type !== 'document' && selectedMedia.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(selectedMedia.preview);
      }
      setSelectedMedia(null);
    }
  }, [selectedMedia]);

  // Núcleo reutilizável de upload — chamado por handleSend e retryUpload (via ref).
  // Retorna { mediaUrl, mediaType } em sucesso; lança em erro.
  const performMediaUpload = useCallback(async (
    file: File,
    type: 'image' | 'video' | 'document',
    tempId?: string,
    previewForProgress?: string,
  ): Promise<{ mediaUrl: string; mediaType: string }> => {
    setIsUploading(true);
    setUploadProgress(0);
    uploadAbortedRef.current = false;
    currentUploadTempIdRef.current = tempId || null;

    const checkAbort = () => {
      if (uploadAbortedRef.current) throw new Error('UPLOAD_CANCELLED');
    };

    try {
      if (type === 'document') {
        if (!user?.id) throw new Error('Não autenticado');
        const progressInterval = setInterval(() => {
          if (uploadAbortedRef.current) return;
          setUploadProgress(p => {
            const next = Math.min(p + 10, 85);
            if (tempId && onOptimisticConfirm) onOptimisticConfirm(tempId, previewForProgress || '', { progress: next, label: 'Enviando PDF…' });
            return next;
          });
        }, 200);
        try {
          checkAbort();
          const url = await uploadPdfDirect(file, user.id);
          clearInterval(progressInterval);
          checkAbort();
          setUploadProgress(100);
          if (tempId && onOptimisticConfirm) onOptimisticConfirm(tempId, url, { progress: 100, label: 'PDF pronto' });
          return { mediaUrl: url, mediaType: 'document' };
        } catch (err) {
          clearInterval(progressInterval);
          throw err;
        }
      }

      let fileToUpload = file;
      const lname = (file.name || '').toLowerCase();
      const isGif = file.type === 'image/gif' || /\.gif$/i.test(lname);
      const isBmp = file.type === 'image/bmp' || /\.bmp$/i.test(lname);
      if (type === 'image' && !isGif && !isBmp) {
        try {
          checkAbort();
          fileToUpload = await imageCompression(file, {
            maxSizeMB: 0.8,
            maxWidthOrHeight: 1280,
            useWebWorker: true,
            fileType: 'image/webp',
          });
        } catch (err: any) {
          if (err?.message === 'UPLOAD_CANCELLED') throw err;
          /* fallback original */
        }
      }
      checkAbort();
      if (type === 'video') {
        try {
          const compressed = await compressVideo(file, {
            maxSizeMB: 15,
            maxDuration: MAX_VIDEO_DURATION_SECONDS,
            onProgress: (p) => {
              if (uploadAbortedRef.current) return;
              const next = Math.min(Math.round(p * 0.4), 40);
              setUploadProgress(next);
              if (tempId && onOptimisticConfirm) onOptimisticConfirm(tempId, previewForProgress || '', { progress: next, label: 'Preparando vídeo…' });
            },
          });
          if (compressed) fileToUpload = compressed;
        } catch (err: any) {
          if (err?.message === 'UPLOAD_CANCELLED') throw err;
          /* fallback original */
        }
      }
      checkAbort();
      const progressInterval = setInterval(() => {
        if (uploadAbortedRef.current) return;
        setUploadProgress(p => {
          const next = Math.min(p + 10, 85);
          if (tempId && onOptimisticConfirm) onOptimisticConfirm(tempId, previewForProgress || '', { progress: next, label: 'Enviando mídia…' });
          return next;
        });
      }, 200);
      try {
        const uploaded = await uploadMedia(fileToUpload, 'chat-media');
        clearInterval(progressInterval);
        checkAbort();
        setUploadProgress(100);
        if (tempId && onOptimisticConfirm) onOptimisticConfirm(tempId, uploaded.url, { progress: 100, label: 'Mídia pronta' });
        return { mediaUrl: uploaded.url, mediaType: type };
      } catch (err) {
        clearInterval(progressInterval);
        throw err;
      }
    } finally {
      setIsUploading(false);
      currentUploadTempIdRef.current = null;
      setTimeout(() => setUploadProgress(0), 800);
    }
  }, [user?.id, uploadMedia, onOptimisticConfirm]);

  const cancelCurrentUpload = useCallback(() => {
    if (!isUploading) return;
    uploadAbortedRef.current = true;
    const tempId = currentUploadTempIdRef.current;
    if (tempId && onUploadCancelled) onUploadCancelled(tempId);
    toast('Envio cancelado');
  }, [isUploading, onUploadCancelled]);

  const handleSend = useCallback(async () => {
    if (disabled || isLoading || isUploading) return;
    if (!message.trim() && !selectedMedia) return;

    const capturedMedia = selectedMedia;
    const capturedReply = replyTo;
    const rawMessage = message.trim();
    const replyPrefix = capturedReply ? buildReplyMarker(capturedReply.content || '') : '';
    const capturedMessage = rawMessage ? `${replyPrefix}${rawMessage}` : (capturedReply ? `${replyPrefix}` : '');

    // 🔒 Bloqueio de links no chat — proteção contra arquivos maliciosos externos.
    if (rawMessage && URL_DETECTION_REGEX.test(rawMessage)) {
      toast.error('🛡️ Envio de links bloqueado no chat por segurança.');
      return;
    }

    // Optimistic UI: show message immediately with local preview
    let tempId: string | undefined;
    if (capturedMedia && onOptimisticSend) {
      const optimisticLabel = capturedMedia.type === 'document'
        ? `📎 ${capturedMedia.file.name}`
        : (capturedMessage || '📷');
      tempId = onOptimisticSend(optimisticLabel, capturedMedia.preview, capturedMedia.type, {
        progress: 1,
        label: capturedMedia.type === 'document' ? 'Enviando PDF…' : 'Preparando prévia…',
      }, capturedMedia.file);
    }

    setMessage('');
    // Limpa rascunho persistido e encerra estado "Digitando..." imediatamente.
    if (conversationId) {
      try { localStorage.removeItem(DRAFT_KEY(conversationId)); } catch { /* noop */ }
    }
    notifyTyping(false);
    setSelectedMedia(null);
    if (capturedReply) onCancelReply?.();

    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      if (capturedMedia) {
        const result = await performMediaUpload(capturedMedia.file, capturedMedia.type, tempId, capturedMedia.preview);
        mediaUrl = result.mediaUrl;
        mediaType = result.mediaType;
      }
      if (!tempId) {
        onSendMessage(capturedMessage || '📷', mediaUrl, mediaType);
      } else if (!capturedMedia) {
        onSendMessage(capturedMessage, mediaUrl, mediaType);
      }
    } catch (err: any) {
      const cancelled = err?.message === 'UPLOAD_CANCELLED';
      if (cancelled) {
        // onUploadCancelled já foi chamado em cancelCurrentUpload — só limpa preview
      } else {
        console.error('[ChatMediaInput] send error:', err?.message || err);
        if (tempId && onOptimisticConfirm) onOptimisticConfirm(tempId, capturedMedia?.preview || '', { error: true, label: 'Falha no envio — toque em reenviar' });
        if (tempId && capturedMedia && onUploadFailed) onUploadFailed(tempId, capturedMedia.file, capturedMedia.type);
        toast.error(err?.message || 'Erro ao enviar mensagem. Toque em reenviar.');
      }
    } finally {
      if (capturedMedia && capturedMedia.type !== 'document' && capturedMedia.preview?.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(capturedMedia.preview), 2000);
      }
    }
  }, [disabled, isLoading, isUploading, message, selectedMedia, onSendMessage, onOptimisticSend, onOptimisticConfirm, onUploadFailed, performMediaUpload, replyTo, onCancelReply]);

  // Exposto via ref: reenvio + injeção externa (drag-and-drop a partir do pai).
  useImperativeHandle(ref, () => ({
    retryUpload: async ({ file, mediaType, tempId, localPreview }) => {
      try {
        if (onOptimisticConfirm) onOptimisticConfirm(tempId, localPreview || '', { progress: 1, label: 'Reenviando…' });
        const result = await performMediaUpload(file, mediaType, tempId, localPreview);
        return;
      } catch (err: any) {
        if (err?.message === 'UPLOAD_CANCELLED') return;
        if (onOptimisticConfirm) onOptimisticConfirm(tempId, localPreview || '', { error: true, label: 'Falha no reenvio' });
        if (onUploadFailed) onUploadFailed(tempId, file, mediaType);
        toast.error(err?.message || 'Falha ao reenviar');
      }
    },
    acceptExternalFile: async (file: File) => {
      await ingestFile(file);
    },
  }), [performMediaUpload, onOptimisticConfirm, onUploadFailed, ingestFile]);


  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  // === PASTE: imagens da área de transferência viram anexo direto.
  // Texto colado é deixado fluir naturalmente (mas links serão bloqueados no envio).
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (!f) continue;
        if (f.type.startsWith('image/')) {
          e.preventDefault();
          // Renomeia para um nome seguro (mantém extensão).
          const ext = (f.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
          const safe = new File([f], `paste_${Date.now()}.${ext}`, { type: f.type });
          await ingestFile(safe);
          return;
        }
      }
    }
    // Heurística adicional: se o texto colado for puramente um link, bloqueia já no paste.
    const text = e.clipboardData?.getData('text') || '';
    if (text && URL_DETECTION_REGEX.test(text) && text.trim().length < 400) {
      e.preventDefault();
      toast.error('🛡️ Cole de links bloqueado por segurança.');
    }
  }, [ingestFile]);

  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState<'emoji' | 'sticker'>('emoji');

  const insertEmoji = useCallback((emoji: string) => {
    setMessage((m) => (m || '') + emoji);
  }, []);

  const sendSticker = useCallback((emoji: string) => {
    if (disabled || isUploading) return;
    // A aba Figurinhas precisa persistir media_type='sticker'. Marcadores invisíveis
    // como \uFEFF são removidos por trim/sanitize e fazem o emoji virar texto normal.
    onSendMessage(emoji, undefined, 'sticker');
    setEmojiPickerOpen(false);
  }, [disabled, isUploading, onSendMessage]);

  // === Figurinhas pessoais (importadas do dispositivo / WhatsApp) ===
  const userStickers = useUserStickers();
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const handleStickerUploadClick = useCallback(() => {
    stickerInputRef.current?.click();
  }, []);
  const handleStickerFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    if (!files || !files.length) return;
    await userStickers.importFiles(files);
  }, [userStickers]);

  const sendUserSticker = useCallback((url: string) => {
    if (disabled || isUploading) return;
    onSendMessage('', url, 'sticker');
    setEmojiPickerOpen(false);
  }, [disabled, isUploading, onSendMessage]);



  // === HOLD-TO-RECORD LOGIC ===
  const handlePointerDown = useCallback(async (e: React.PointerEvent) => {
    if (!canSendChatAudio) { onMediaBlocked?.(); return; }
    if (audio.isRecording || isUploading || disabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    isHolding.current = true;
    setSwipeOffset(0);

    try {
      await audio.startRecording();
    } catch {
      toast.error('Não foi possível acessar o microfone');
      isHolding.current = false;
    }
  }, [audio, isUploading, disabled, canSendChatAudio, onMediaBlocked]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!audio.isRecording || !isHolding.current) return;
    const dx = pointerStartX.current - e.clientX;
    setSwipeOffset(Math.max(0, dx));
  }, [audio.isRecording]);

  const handlePointerUp = useCallback(() => {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    if (!isHolding.current) return;
    isHolding.current = false;

    if (!audio.isRecording) return;

    if (swipeOffset >= SWIPE_CANCEL_THRESHOLD) {
      audio.cancelRecording();
      setSwipeOffset(0);
      return;
    }

    audio.stopRecording();
    setSwipeOffset(0);
  }, [audio, swipeOffset]);

  // Listen for audioBlob to auto-send after stopRecording
  useEffect(() => {
    if (audio.audioBlob && !audio.isRecording && audio.duration >= MIN_RECORDING_SECONDS) {
      sendAudioBlob(audio.audioBlob, audio.duration);
      audio.clearAudio();
    } else if (audio.audioBlob && !audio.isRecording && audio.duration < MIN_RECORDING_SECONDS) {
      toast.error('Gravação muito curta (mínimo 1s)');
      audio.clearAudio();
    }
  }, [audio.audioBlob, audio.isRecording]);

  const hasContent = message.trim() || selectedMedia;

  // === RECORDING UI ===
  if (audio.isRecording) {
    const mins = Math.floor(audio.duration / 60);
    const secs = audio.duration % 60;

    const handleCancelRecording = () => {
      audio.cancelRecording();
      setSwipeOffset(0);
      isHolding.current = false;
    };

    const handleSendRecording = () => {
      isHolding.current = false;
      audio.stopRecording();
      setSwipeOffset(0);
    };

    return (
      <div className="p-3 border-t border-border/30 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={handleCancelRecording}
            className="shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>

          <div className="flex-1 flex items-center gap-2 bg-muted/40 rounded-full px-3 py-2 overflow-hidden">
            <div className="flex items-center gap-0.5 shrink-0">
              {[...Array(14)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-[3px] rounded-full bg-destructive"
                  animate={{ height: [3, 8 + Math.random() * 10, 3] }}
                  transition={{
                    duration: 0.4 + Math.random() * 0.3,
                    repeat: Infinity,
                    repeatType: 'reverse',
                    delay: i * 0.05,
                  }}
                />
              ))}
            </div>
            <span className="text-sm font-mono text-foreground ml-1 shrink-0">
              {mins}:{secs.toString().padStart(2, '0')}
            </span>
            <span className="text-[11px] text-muted-foreground ml-auto shrink-0">Gravando...</span>
          </div>

          <button
            onClick={handleSendRecording}
            className="shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center active:scale-90 transition-transform shadow-md"
          >
            <Send className="h-4 w-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/30 bg-background/80 backdrop-blur-sm p-2 space-y-2">
      {/* Upload progress bar + cancel */}
      {isUploading && uploadProgress > 0 && (
        <div className="px-1">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
            <button
              type="button"
              onClick={cancelCurrentUpload}
              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
              title="Cancelar envio"
              aria-label="Cancelar envio"
            >
              <X className="h-3 w-3" />
              Cancelar
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{uploadProgress}%</p>
        </div>
      )}

      {/* Media Preview */}
      <AnimatePresence>
        {selectedMedia && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-1"
          >
            <div className="relative inline-block">
              {selectedMedia.type === 'image' ? (
                <img loading="lazy" decoding="async" src={selectedMedia.preview} alt="Preview" className="h-20 w-auto rounded-lg object-cover" />
              ) : selectedMedia.type === 'video' ? (
                <video preload="none" src={selectedMedia.preview} className="h-20 w-auto rounded-lg object-cover" />
              ) : (
                <div className="flex items-center gap-2 h-20 rounded-lg bg-muted/40 border border-border/50 px-3 max-w-[260px]">
                  <FileText className="h-6 w-6 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{selectedMedia.file.name}</p>
                    <p className="text-[10px] text-muted-foreground">PDF · {(selectedMedia.file.size / 1024 / 1024).toFixed(2)}MB</p>
                  </div>
                </div>
              )}
              <button onClick={handleRemoveMedia} className="absolute -top-1.5 -right-1.5 p-0.5 bg-destructive rounded-full text-destructive-foreground">
                <X className="h-3 w-3" />
              </button>
              {selectedMedia.type !== 'document' && (
                <div className="absolute bottom-0.5 left-0.5 bg-black/60 rounded px-1 py-0.5 text-[10px] text-white flex items-center gap-0.5">
                  {selectedMedia.type === 'image' ? <ImageIcon className="h-2.5 w-2.5" /> : <Film className="h-2.5 w-2.5" />}
                  {(selectedMedia.file.size / 1024 / 1024).toFixed(1)}MB
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reply Banner — mostra a mensagem que está sendo respondida */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mx-1 mb-1 flex items-start gap-2 rounded-lg border-l-4 border-primary bg-muted/40 px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                Respondendo a {replyTo.senderLabel || (replyTo.isMine ? 'você' : 'mensagem')}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {(replyTo.content || '').replace(/\s+/g, ' ').slice(0, 120) || '— mídia —'}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Cancelar resposta"
              title="Cancelar resposta"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>



      {/* Hidden Inputs */}
      {/* Full media (Premium/VIP) — imagens (jpg/png/gif/bmp/webp), vídeos curtos e PDF */}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp,image/*,video/mp4,video/*,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.mp4" onChange={handleFileSelect} className="hidden" />
      {/* Image only (Free) — também aceita PDF */}
      <input ref={imageOnlyInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/bmp,image/webp,image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp" onChange={handleFileSelect} className="hidden" />

      {/* Live Camera Modal */}
      <AnimatePresence>
        {showCameraModal && (
          <CameraModal
            open={showCameraModal}
            onClose={() => setShowCameraModal(false)}
            onCapture={handleCameraCapture}
          />
        )}
      </AnimatePresence>

      {/* Input Bar */}
      {/* Mobile: ações recolhíveis para liberar mais área ao histórico. Desktop mantém ações visíveis. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-1">
        {/* Linha 1 (mobile) / inline (desktop): botões de ação */}
        <div className={cn(
          "flex items-center gap-1 overflow-hidden transition-all duration-200 md:contents",
          actionsOpen ? "max-h-12 opacity-100" : "hidden pointer-events-none md:contents md:max-h-none md:opacity-100 md:pointer-events-auto"
        )}>
          {/* Container com fundo chamativo para destacar a barra de ações */}
          <div className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-primary/80 via-accent/70 to-primary/80 px-2 py-1 shadow-lg shadow-primary/20 border border-primary/30 backdrop-blur-sm">
            {/* Attachment - mídia liberada para todos os planos */}
            <Button variant="ghost" size="icon"
              onClick={handleAttachmentClick}
              disabled={disabled || isUploading} className="shrink-0 h-9 w-9 text-primary-foreground hover:text-white hover:bg-white/20"
              title="Anexar mídia"
             aria-label="Anexar">
              <Paperclip className="h-5 w-5 text-primary-foreground" />
            </Button>

            {/* Camera - liberada para todos os planos */}
            <Button variant="ghost" size="icon"
              onClick={handleCameraClick}
              disabled={disabled || isUploading} className="shrink-0 h-9 w-9 text-primary-foreground hover:text-white hover:bg-white/20"
              title="Abrir câmera"
            >
              <Camera className="h-5 w-5 text-primary-foreground" />
            </Button>

            {/* Chamar Atenção (megafone) */}
            {(attentionToUserId || attentionToProfileId) && (
              <AttentionPingButton
                toUserId={attentionToUserId ?? null}
                toProfileId={attentionToProfileId ?? null}
                conversationId={attentionConversationId ?? null}
                className="shrink-0 h-9 w-9 text-primary-foreground hover:text-white hover:bg-white/20"
              />
            )}

            {/* 🎁 Enviar Presente XP */}
            {onOpenGift && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onOpenGift}
                disabled={disabled}
                className="shrink-0 h-9 w-9 text-amber-300 hover:text-amber-200 hover:bg-white/20"
                title="Enviar presente de XP"
                aria-label="Enviar presente de XP"
              >
                <Gift className="h-5 w-5" />
              </Button>
            )}

            {/* 😀 Emoji Picker */}
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || isUploading}
                  className="shrink-0 h-9 w-9 text-primary-foreground hover:text-white hover:bg-white/20"
                  title="Inserir emoji ou figurinha"
                  aria-label="Inserir emoji ou figurinha"
                >
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-[320px] p-2"
            >
              <div className="flex items-center gap-1 mb-2 p-1 bg-muted/40 rounded-lg">
                <button
                  type="button"
                  onClick={() => setEmojiTab('emoji')}
                  className={cn(
                    "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                    emojiTab === 'emoji' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Emojis
                </button>
                <button
                  type="button"
                  onClick={() => setEmojiTab('sticker')}
                  className={cn(
                    "flex-1 text-xs font-medium py-1.5 rounded-md transition-colors",
                    emojiTab === 'sticker' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Figurinhas
                </button>
              </div>
              {emojiTab === 'emoji' ? (
                <div className="max-h-[240px] overflow-y-auto grid grid-cols-8 gap-1">
                  <div className="col-span-8 px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Mais usados
                  </div>
                  {COMMON_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="h-8 w-8 flex items-center justify-center text-lg rounded-md hover:bg-muted active:scale-90 transition-transform"
                      aria-label={`Inserir ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-3 scrollbar-thin">
                  {/* Upload de figurinha do dispositivo (PNG/WEBP/GIF) — múltiplos */}
                  <input
                    ref={stickerInputRef}
                    type="file"
                    accept="image/png,image/webp,image/gif,image/jpeg,.png,.webp,.gif,.jpg,.jpeg"
                    multiple
                    onChange={handleStickerFileSelect}
                    className="hidden"
                  />

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStickerUploadClick}
                      disabled={disabled || userStickers.importing}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <Upload className="h-4 w-4" />
                      {userStickers.importing
                        ? `Importando… ${userStickers.progress}%`
                        : 'Importar figurinhas do dispositivo'}
                    </button>
                    <button
                      type="button"
                      onClick={() => userStickers.refresh()}
                      disabled={userStickers.loading}
                      className="h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
                      aria-label="Atualizar figurinhas"
                      title="Atualizar"
                    >
                      <RefreshCw className={cn('h-4 w-4', userStickers.loading && 'animate-spin')} />
                    </button>
                  </div>

                  <p className="px-1 text-[10px] leading-snug text-muted-foreground/80">
                    Dica: no WhatsApp toque a figurinha → <strong>Compartilhar</strong> → salve na galeria, depois importe aqui. Ficam salvas no seu perfil.
                  </p>

                  {/* Minhas figurinhas (persistidas) */}
                  <div>
                    <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80 flex items-center justify-between">
                      <span>Minhas figurinhas</span>
                      <span className="text-muted-foreground/60 normal-case">{userStickers.stickers.length}</span>
                    </div>
                    {userStickers.stickers.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground">
                        Nenhuma figurinha importada ainda.
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {userStickers.stickers.map((s) => (
                          <div key={s.id} className="relative group">
                            <button
                              type="button"
                              onClick={() => sendUserSticker(s.url)}
                              className="aspect-square w-full flex items-center justify-center rounded-xl bg-muted/40 hover:bg-muted active:scale-90 transition-transform p-1"
                              aria-label="Enviar figurinha"
                            >
                              <img
                                src={s.url}
                                alt="Figurinha"
                                loading="lazy"
                                decoding="async"
                                className="max-h-full max-w-full object-contain drop-shadow-sm"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); userStickers.remove(s); }}
                              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center justify-center"
                              aria-label="Remover figurinha"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Galeria padrão de emoji-stickers (fallback) */}
                  <div className="px-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                    Sugestões rápidas
                  </div>
                  {STICKER_GROUPS.map((group) => (

                    <div key={group.title}>
                      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                        {group.title}
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {group.items.map((item) => {
                          const isKaomoji = !/\p{Extended_Pictographic}/u.test(item);
                          return (
                            <button
                              key={`${group.title}:${item}`}
                              type="button"
                              onClick={() => sendSticker(item)}
                              className={cn(
                                'aspect-square flex items-center justify-center rounded-xl bg-muted/40 hover:bg-muted active:scale-90 transition-transform p-1 text-center',
                                isKaomoji ? 'text-[11px] font-medium leading-tight break-words' : 'text-3xl',
                              )}
                              aria-label={`Enviar figurinha ${item}`}
                            >
                              <span className={isKaomoji ? 'block max-w-full' : ''}>{item}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

        {/* Linha 2 (mobile) / inline (desktop): campo de digitação + mic + send */}
        <div className="flex items-center gap-1 md:contents">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setActionsOpen((open) => !open)}
            disabled={disabled || isUploading}
            className="shrink-0 h-12 w-12 md:hidden"
            aria-expanded={actionsOpen}
            aria-label={actionsOpen ? 'Recolher ações' : 'Expandir ações'}
            title={actionsOpen ? 'Recolher ações' : 'Mais ações'}
          >
            {actionsOpen ? <X className="h-5 w-5 text-muted-foreground" /> : <Paperclip className="h-5 w-5 text-muted-foreground" />}
          </Button>
          {/* Text Input — maior no mobile */}
          <Input
            value={message}
            onChange={(e) => {
              const v = e.target.value;
              setMessage(v);
              notifyTyping(v.trim().length > 0);
            }}
            onPaste={handlePaste}
            onBlur={() => notifyTyping(false)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            disabled={disabled || isUploading}
            className="flex-1 h-12 md:h-9 text-base md:text-sm bg-muted/30 border-border/50 px-4"
          />

          {/* Mic (hold-to-record) - liberado para todos os planos */}
          {!hasContent && (
            <button
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              disabled={disabled}
              className={cn(
                "shrink-0 h-12 w-12 md:h-9 md:w-9 rounded-md flex items-center justify-center touch-none select-none",
                "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                disabled && "opacity-50 pointer-events-none"
              )}
              title="Segure para gravar áudio"
            >
              <Mic className="h-5 w-5" />
            </button>
          )}

          {/* Send */}
          {hasContent && (
            <Button size="icon" onClick={handleSend}
              disabled={disabled || isLoading || isUploading}
              className="shrink-0 h-12 w-12 md:h-9 md:w-9 bg-primary hover:bg-primary/90"
             aria-label="Enviar">
              <Send className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
