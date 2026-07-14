import { useState, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { smartImageUpload, smartVideoUpload, cleanupObjectUrls, type UploadProgress } from '@/lib/smartUpload';

export function useMediaUpload() {
  const { user } = useAuth();
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const abortRef = useRef(false);

  const uploadMedia = useCallback(async (
    file: File | Blob,
    folder: string = 'posts',
    bucket: string = 'media'
  ): Promise<{ publicUrl: string; path: string }> => {
    if (!user?.id) throw new Error('Not authenticated');
    abortRef.current = false;

    const isVideo = file instanceof File
      ? file.type.startsWith('video/')
      : false;

    try {
      if (isVideo) {
        const result = await smartVideoUpload(
          file as File,
          user.id,
          folder,
          bucket,
          (p) => !abortRef.current && setUploadProgress(p)
        );
        return { publicUrl: result.publicUrl, path: result.path };
      } else {
        const result = await smartImageUpload(
          file,
          user.id,
          folder,
          bucket,
          (p) => !abortRef.current && setUploadProgress(p)
        );
        return { publicUrl: result.publicUrl, path: result.path };
      }
    } finally {
      // Auto-clear progress after short delay
      setTimeout(() => setUploadProgress(null), 1500);
    }
  }, [user?.id]);

  const deleteMedia = useCallback(async (url: string): Promise<void> => {
    const { supabase } = await import('@/lib/supabaseExternal');
    const path = url.includes('/media/') ? url.split('/media/')[1] : url.split('/post-media/')[1];
    if (!path) return;
    const { error } = await supabase.storage.from('media').remove([path]);
    if (error) throw error;
  }, []);

  const cancelUpload = useCallback(() => {
    abortRef.current = true;
    setUploadProgress(null);
  }, []);

  return { uploadMedia, deleteMedia, uploadProgress, cancelUpload, cleanupObjectUrls };
}
