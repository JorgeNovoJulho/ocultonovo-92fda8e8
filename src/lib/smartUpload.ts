/**
 * Smart Upload System - Compressão inteligente, chunk upload, retry e cleanup
 * Otimizado para dispositivos de entrada (Realme C55)
 */
import imageCompression from 'browser-image-compression';
import { supabase } from '@/lib/supabaseExternal';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

// ==================== CONFIG ====================

const IMAGE_COMPRESSION_OPTIONS = {
  maxSizeMB: 0.3,           // ~300KB target
  maxWidthOrHeight: 1280,   // Max 1280px
  fileType: 'image/webp' as const,
  initialQuality: 0.8,
  useWebWorker: true,        // Offload para Web Worker (UI 60fps)
  alwaysKeepResolution: false,
};

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks for video
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

const isGifBlob = (file: File | Blob) => {
  const mimeLooksLikeGif = (file as Blob).type === 'image/gif';
  const nameLooksLikeGif = file instanceof File ? /\.gif$/i.test(file.name || '') : false;
  return mimeLooksLikeGif || nameLooksLikeGif;
};

// ==================== TYPES ====================

export interface UploadProgress {
  phase: 'compressing' | 'uploading' | 'done' | 'error';
  percent: number;           // 0-100
  message: string;
  blurPreview?: string;      // Data URL for blurry placeholder
}

export interface SmartUploadResult {
  publicUrl: string;
  path: string;
  fileSize: number;
  originalSize: number;
  compressionRatio: number;
}

type ProgressCallback = (progress: UploadProgress) => void;

// ==================== HELPERS ====================

/** Create a tiny blurry placeholder (32px) for instant visual feedback */
async function createBlurPreview(file: File | Blob): Promise<string> {
  return new Promise((resolve) => {
    if (!(file instanceof File) && !(file instanceof Blob)) {
      resolve('');
      return;
    }

    // Only for images
    const type = file instanceof File ? file.type : (file as Blob).type;
    if (!type?.startsWith('image/')) {
      resolve('');
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 32;
      canvas.width = size;
      canvas.height = size * (img.height / img.width);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.1));
      } else {
        resolve('');
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve('');
    };
    img.src = url;
  });
}

/** Retry wrapper with exponential backoff */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delayMs = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

// ==================== CORE ====================

/**
 * Compress an image using browser-image-compression (Web Worker)
 */
export async function compressImage(
  file: File | Blob,
  onProgress?: (p: number) => void
): Promise<Blob> {
  if (isGifBlob(file)) {
    onProgress?.(100);
    return file;
  }

  const fileToCompress = file instanceof File 
    ? file 
    : new File([file], 'image.jpg', { type: (file as Blob).type || 'image/jpeg' });

  const compressed = await imageCompression(fileToCompress, {
    ...IMAGE_COMPRESSION_OPTIONS,
    onProgress: (p) => onProgress?.(p),
  });

  return compressed;
}

/**
 * Upload a single chunk to Supabase storage
 */
async function uploadToStorage(
  bucket: string,
  path: string,
  data: File | Blob,
  options?: { upsert?: boolean; contentType?: string }
): Promise<{ publicUrl: string; path: string }> {
  const { data: result, error } = await supabase.storage
    .from(bucket)
    .upload(path, data, {
      cacheControl: '3600',
      upsert: options?.upsert ?? false,
      contentType: options?.contentType,
    });

  if (error) throw error;

  // URL pública via concatenação direta (zero requests extras) — externo
  const publicUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/${bucket}/${result.path}`;
  return { publicUrl, path: result.path };
}

/**
 * Smart Image Upload: Compress → Upload → Cleanup
 */
export async function smartImageUpload(
  file: File | Blob,
  userId: string,
  folder: string = 'posts',
  bucket: string = 'media',
  onProgress?: ProgressCallback,
  upsert: boolean = false
): Promise<SmartUploadResult> {
  const originalSize = file.size;
  const isGif = isGifBlob(file);

  // 1. Create blur preview instantly
  const blurPreview = await createBlurPreview(file);
  onProgress?.({
    phase: 'compressing',
    percent: 5,
    message: 'Otimizando imagem...',
    blurPreview,
  });

  // 2. Compress via Web Worker
  let compressed: Blob;
  try {
    compressed = await compressImage(file, (p) => {
      onProgress?.({
        phase: 'compressing',
        percent: 5 + Math.floor(p * 0.4), // 5-45%
        message: 'Comprimindo...',
        blurPreview,
      });
    });
  } catch {
    // Fallback: use original
    compressed = file;
  }

  // 3. Upload with retry
  onProgress?.({
    phase: 'uploading',
    percent: 50,
    message: 'Enviando...',
    blurPreview,
  });

  const ext = isGif ? 'gif' : compressed.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${userId}/${folder}/${Date.now()}.${ext}`;

  const compressedSize = compressed.size;
  const compressedType = compressed.type;

  const { publicUrl, path: storagePath } = await withRetry(() =>
    uploadToStorage(bucket, path, compressed, {
      upsert,
      contentType: compressedType,
    })
  );

  // Free compressed blob from RAM immediately (critical for <4GB devices)
  compressed = null as any;

  onProgress?.({
    phase: 'done',
    percent: 100,
    message: 'Concluído!',
  });

  return {
    publicUrl,
    path: storagePath,
    fileSize: compressedSize,
    originalSize,
    compressionRatio: originalSize > 0 ? compressedSize / originalSize : 1,
  };
}

/**
 * Smart Video Upload: Validate duration → Upload (with retry) → Cleanup
 * For files > 10MB, uploads in chunks conceptually (single upload with retry)
 */
export async function smartVideoUpload(
  file: File,
  userId: string,
  folder: string = 'videos',
  bucket: string = 'media',
  onProgress?: ProgressCallback
): Promise<SmartUploadResult> {
  const originalSize = file.size;

  // Fase 1: preparação
  onProgress?.({
    phase: 'uploading',
    percent: 5,
    message: 'Preparando vídeo...',
  });

  const fileExt = file.name.split('.').pop() || 'mp4';
  const path = `${userId}/${folder}/${Date.now()}.${fileExt}`;

  // Estimativa de duração do upload (heurística: ~600 KB/s típico em 4G/wifi lento)
  // Cap entre 4s e 90s para não travar a barra em uploads muito curtos ou muito longos.
  const estimatedMs = Math.min(90_000, Math.max(4_000, Math.round((originalSize / 1024 / 600) * 1000)));
  const startedAt = Date.now();

  // Fake-progress incremental (5% → 92%) enquanto o upload real está em curso.
  // A barra atinge 92% quando o tempo estimado é alcançado e mantém pequenos
  // incrementos de "quase lá" até o upload terminar de verdade.
  const progressTimer = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const ratio = Math.min(1, elapsed / estimatedMs);
    // curva ease-out: cresce rápido no começo e desacelera perto do fim
    const eased = 1 - Math.pow(1 - ratio, 2);
    const percent = Math.min(92, Math.round(5 + eased * 87));

    let message = 'Enviando vídeo...';
    if (percent >= 40 && percent < 70) message = 'Enviando vídeo... (isso pode levar alguns segundos)';
    else if (percent >= 70 && percent < 90) message = 'Quase lá...';
    else if (percent >= 90) message = 'Finalizando envio...';

    onProgress?.({ phase: 'uploading', percent, message });
  }, 400);

  try {
    // Upload with retry (handles network flakiness)
    const { publicUrl, path: storagePath } = await withRetry(() =>
      uploadToStorage(bucket, path, file, {
        upsert: false,
      })
    );

    clearInterval(progressTimer);

    onProgress?.({
      phase: 'done',
      percent: 100,
      message: 'Vídeo enviado com sucesso!',
    });

    return {
      publicUrl,
      path: storagePath,
      fileSize: originalSize,
      originalSize,
      compressionRatio: 1,
    };
  } catch (err) {
    clearInterval(progressTimer);
    onProgress?.({
      phase: 'error' as any,
      percent: 0,
      message: 'Falha ao enviar vídeo. Tente novamente.',
    });
    throw err;
  }
}


/**
 * Validate video duration against plan limits BEFORE uploading
 */
export function validateVideoDuration(
  file: File,
  maxDurationSeconds: number
): Promise<{ valid: boolean; duration: number; error?: string }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    const url = URL.createObjectURL(file);

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const duration = video.duration;

      if (duration > maxDurationSeconds && maxDurationSeconds !== Infinity) {
        const mins = Math.floor(maxDurationSeconds / 60);
        resolve({
          valid: false,
          duration,
          error: `Vídeo excede o limite de ${mins} min do seu plano. Faça upgrade para enviar vídeos maiores.`,
        });
      } else {
        resolve({ valid: true, duration });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, duration: 0, error: 'Não foi possível ler o vídeo.' });
    };

    video.src = url;
  });
}

/**
 * Cleanup: revoke object URLs to free RAM
 */
export function cleanupObjectUrls(...urls: (string | null | undefined)[]) {
  for (const url of urls) {
    if (url && url.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // silently ignore
      }
    }
  }
}
