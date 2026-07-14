import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from 'sonner';
import { smartImageUpload, smartVideoUpload, cleanupObjectUrls, type UploadProgress } from '@/lib/smartUpload';

// Limites por plano
const UPLOAD_LIMITS = {
  free: { imageMax: 5 * 1024 * 1024, videoMax: 0 },
  premium: { imageMax: 50 * 1024 * 1024, videoMax: 500 * 1024 * 1024 },
  vip: { imageMax: 50 * 1024 * 1024, videoMax: 1024 * 1024 * 1024 }
};

const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'tiff', 'svg', 'ico', 'avif'];
const SUPPORTED_VIDEO_FORMATS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv', 'mpeg', 'mpg', '3gp'];

export type MediaType = 'image' | 'video';

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
  mediaType?: MediaType;
  suggestUpgrade?: boolean;
}

export interface UploadedMedia {
  url: string;
  mediaType: MediaType;
  fileSize: number;
  fileName: string;
  fileType: string;
}

export function useMediaUploadWithLimits() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadState, setUploadState] = useState<UploadProgress | null>(null);

  const rawPlan = (profile?.plan_type as string) || 'free';
  const planType: 'free' | 'premium' | 'vip' = (UPLOAD_LIMITS as any)[rawPlan] ? (rawPlan as any) : 'free';
  const limits = UPLOAD_LIMITS[planType] || UPLOAD_LIMITS.free;

  const getFileExtension = (fileName: string): string =>
    fileName.split('.').pop()?.toLowerCase() || '';

  const getMediaType = (file: File): MediaType | null => {
    const ext = getFileExtension(file.name);
    if (SUPPORTED_IMAGE_FORMATS.includes(ext) || file.type.startsWith('image/')) return 'image';
    if (SUPPORTED_VIDEO_FORMATS.includes(ext) || file.type.startsWith('video/')) return 'video';
    return null;
  };

  const validateFile = useCallback((file: File): UploadValidationResult => {
    const mediaType = getMediaType(file);
    if (!mediaType) {
      return { valid: false, error: `Formato não suportado: ${getFileExtension(file.name)}.` };
    }

    // Vídeo bloqueado no plano free: tratar como restrição de plano (não tamanho)
    if (mediaType === 'video' && planType === 'free') {
      return {
        valid: false,
        error: 'Envio de vídeos é exclusivo para assinantes Premium e VIP.',
        mediaType,
        suggestUpgrade: true,
      };
    }

    const maxSize = mediaType === 'image' ? limits.imageMax : limits.videoMax;
    if (file.size > maxSize) {
      const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const suggestUpgrade = planType !== 'vip' && file.size <= UPLOAD_LIMITS.vip[mediaType === 'image' ? 'imageMax' : 'videoMax'];
      return {
        valid: false,
        error: `Arquivo muito grande (${fileSizeMB}MB). Limite do seu plano: ${maxSizeMB}MB.`,
        mediaType,
        suggestUpgrade,
      };
    }
    return { valid: true, mediaType };
  }, [limits, planType]);

  const uploadMedia = useCallback(async (
    file: File | Blob,
    folder: string = 'posts',
    originalFileName?: string
  ): Promise<UploadedMedia> => {
    if (!user?.id) throw new Error('Não autenticado');

    const fileName = originalFileName || (file instanceof File ? file.name : 'media');
    const mediaType = file instanceof File ? getMediaType(file) : 'image';
    const isVideo = mediaType === 'video';

    setUploading(true);
    setProgress(0);

    try {
      const onProgress = (p: UploadProgress) => {
        setUploadState(p);
        setProgress(p.percent);
      };

      let result;
      if (isVideo) {
        result = await smartVideoUpload(file as File, user.id, folder, 'media', onProgress);
      } else {
        result = await smartImageUpload(file, user.id, folder, 'media', onProgress);
      }

      return {
        url: result.publicUrl,
        mediaType: mediaType || 'image',
        fileSize: result.fileSize,
        fileName,
        fileType: file instanceof File ? file.type : `${mediaType}/${getFileExtension(fileName)}`,
      };
    } finally {
      setUploading(false);
      setTimeout(() => {
        setProgress(0);
        setUploadState(null);
      }, 1000);
    }
  }, [user?.id]);

  const uploadMultipleMedia = useCallback(async (
    files: File[],
    folder: string = 'posts',
    onFileProgress?: (current: number, total: number) => void
  ): Promise<UploadedMedia[]> => {
    const results: UploadedMedia[] = [];
    for (let i = 0; i < files.length; i++) {
      onFileProgress?.(i + 1, files.length);
      const validation = validateFile(files[i]);
      if (!validation.valid) {
        toast.error(`Erro em ${files[i].name}: ${validation.error}`);
        continue;
      }
      try {
        const result = await uploadMedia(files[i], folder);
        results.push(result);
      } catch (error) {
        console.error(`Upload error ${files[i].name}:`, error);
        toast.error(`Erro ao enviar ${files[i].name}`);
      }
    }
    return results;
  }, [uploadMedia, validateFile]);

  const deleteMedia = useCallback(async (url: string): Promise<void> => {
    const { supabase } = await import('@/lib/supabaseExternal');
    const path = url.includes('/media/') ? url.split('/media/')[1] : url.split('/post-media/')[1];
    if (!path) return;
    const { error } = await supabase.storage.from('media').remove([path]);
    if (error) throw error;
  }, []);

  const getFormattedLimits = () => ({
    imageLimit: planType === 'free' ? '5MB' : '50MB (4K/HD)',
    videoLimit: planType === 'free' ? 'Bloqueado' : planType === 'vip' ? '1GB' : '500MB (HD)',
    planType,
    canUpgradeForLargerVideos: planType !== 'vip',
  });

  return {
    validateFile,
    uploadMedia,
    uploadMultipleMedia,
    deleteMedia,
    uploading,
    progress,
    uploadState,
    limits: getFormattedLimits(),
    supportedFormats: { image: SUPPORTED_IMAGE_FORMATS, video: SUPPORTED_VIDEO_FORMATS },
    cleanupObjectUrls,
  };
}
