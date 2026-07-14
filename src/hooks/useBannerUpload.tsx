import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { smartImageUpload, cleanupObjectUrls } from '@/lib/smartUpload';
import { buildPublicUrl } from '@/lib/storageUrl';

interface UseBannerUploadOptions {
  extraInvalidateKeys?: string[][];
}

export function useBannerUpload(options?: UseBannerUploadOptions) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const previousUrlRef = useRef<string | null>(null);

  const uploadBanner = useCallback(async (file: File): Promise<string | null> => {
    if (!user?.id) {
      toast.error('Você precisa estar logado para enviar o banner');
      return null;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('Apenas imagens são permitidas');
      return null;
    }

    // 1. Instant optimistic preview via blob URL
    cleanupObjectUrls(blobUrlRef.current);
    const blobUrl = URL.createObjectURL(file);
    blobUrlRef.current = blobUrl;
    previousUrlRef.current = bannerPreview;
    setBannerPreview(blobUrl);
    setIsUploading(true);

    try {
      // 2. Compress + Upload via smartUpload (retry built-in, RAM-safe)
      const result = await smartImageUpload(file, user.id, 'banners', 'avatars');

      // 3. Persist cover_image_url on profiles
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ cover_image_url: result.publicUrl, banner_url: result.publicUrl } as any)
        .eq('user_id', user.id);

      if (updateError) throw new Error(`Salvar URL falhou: ${updateError.message}`);

      // 4. Switch preview to cache-busted URL & cleanup blob
      const cacheBustUrl = `${result.publicUrl}?t=${Date.now()}`;
      setBannerPreview(cacheBustUrl);
      cleanupObjectUrls(blobUrlRef.current);
      blobUrlRef.current = null;

      // 5. Invalidate relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['profile', user.id] }),
        queryClient.invalidateQueries({ queryKey: ['creator-profile'] }),
        ...(options?.extraInvalidateKeys?.map((key) =>
          queryClient.invalidateQueries({ queryKey: key })
        ) || []),
      ]);

      toast.success('Banner atualizado com sucesso!');
      return cacheBustUrl;
    } catch (err: any) {
      console.error('Banner upload error:', err);
      setBannerPreview(previousUrlRef.current);
      cleanupObjectUrls(blobUrlRef.current);
      blobUrlRef.current = null;
      toast.error(err.message || 'Erro ao enviar banner');
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [user?.id, bannerPreview, queryClient, options?.extraInvalidateKeys]);

  const clearPreview = useCallback(() => {
    cleanupObjectUrls(blobUrlRef.current);
    blobUrlRef.current = null;
    setBannerPreview(null);
  }, []);

  return { bannerPreview, isUploading, uploadBanner, clearPreview };
}
