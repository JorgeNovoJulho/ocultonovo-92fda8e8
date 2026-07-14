/**
 * useKycUpload — Upload de documento KYC com compressão e progresso real.
 * Comprime imagem antes do upload para poupar RAM (dispositivos de entrada).
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useProfile } from './useProfile';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';

export type KycType = 'document' | 'selfie';
export type DocumentSide = 'front' | 'back';

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
}

const MAX_DIM = 1280;
const WEBP_QUALITY = 0.80;

/** Comprime imagem via canvas (Web-safe, sem Worker para evitar overhead no Realme C55) */
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas context unavailable'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('compression failed'));
          resolve(blob);
        },
        'image/webp',
        WEBP_QUALITY
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

export function useKycUpload() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
    success: false,
  });

  const upload = useCallback(
    async (file: File, kycType: KycType, side: DocumentSide = 'front') => {
      if (!user?.id || !profile?.id) {
        setState(s => ({ ...s, error: 'Usuário não autenticado' }));
        return;
      }

      setState({ uploading: true, progress: 0, error: null, success: false });

      try {
        // 1. Comprimir
        setState(s => ({ ...s, progress: 10 }));
        const compressed = await compressImage(file);
        setState(s => ({ ...s, progress: 30 }));

        // 2. Upload — tenta buckets em ordem (kyc-documents → post-media → profile-media)
        const ext = 'webp';
        const suffix = kycType === 'document' ? `_${side}` : '';
        const baseName = `${profile.id}/${kycType}${suffix}_${Date.now()}.${ext}`;

        const candidates: Array<{ bucket: string; path: string }> = [
          { bucket: 'kyc-documents', path: baseName },
          { bucket: 'post-media', path: `verification/${baseName}` },
          { bucket: 'profile-media', path: `verification/${baseName}` },
          { bucket: 'avatars', path: `verification/${baseName}` },
        ];

        let storageBucket = '';
        let storedPath = '';
        let lastErr: any = null;

        for (const c of candidates) {
          const { error } = await supabase.storage
            .from(c.bucket)
            .upload(c.path, compressed, {
              contentType: 'image/webp',
              upsert: true,
            });
          if (!error) {
            storageBucket = c.bucket;
            storedPath = c.path;
            lastErr = null;
            break;
          }
          lastErr = error;
          // Se o erro NÃO for "Bucket not found", interrompe (ex.: RLS, tamanho)
          const msg = (error.message || '').toLowerCase();
          if (!msg.includes('bucket not found') && !msg.includes('not found')) {
            throw error;
          }
        }

        if (!storageBucket) {
          throw lastErr || new Error('Nenhum bucket de armazenamento disponível');
        }
        setState(s => ({ ...s, progress: 70 }));

        // 3. Salvar metadados no perfil
        const urlField =
          kycType === 'selfie'
            ? 'kyc_selfie_url'
            : side === 'back'
              ? 'kyc_document_back_url'
              : 'kyc_document_url';
        const { error: dbErr } = await supabase
          .from('profiles')
          .update({
            [urlField]: storedPath,
            kyc_type: kycType,
            kyc_submitted_at: new Date().toISOString(),
          } as any)
          .eq('user_id', user.id);

        if (dbErr) throw dbErr;
        setState(s => ({ ...s, progress: 90 }));

        // 3.5 Verificar se o arquivo realmente está salvo no bucket
        const folder = storageBucket === 'kyc-documents' ? profile.id : `verification/${profile.id}`;
        const { data: listData, error: listErr } = await supabase.storage
          .from(storageBucket)
          .list(folder, { limit: 100 });
        if (listErr) throw new Error('Falha ao verificar arquivo no servidor');
        const fileName = storedPath.split('/').pop();
        const exists = (listData || []).some((f) => f.name === fileName);
        if (!exists) throw new Error('Arquivo não foi confirmado no servidor');
        setState(s => ({ ...s, progress: 100 }));

        // 4. Invalidar cache do perfil
        await queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
        setState({ uploading: false, progress: 100, error: null, success: true });
      } catch (err: any) {
        setState({ uploading: false, progress: 0, error: err.message || 'Erro no upload', success: false });
      }
    },
    [user, profile, queryClient]
  );

  const reset = useCallback(() => {
    setState({ uploading: false, progress: 0, error: null, success: false });
  }, []);

  return { ...state, upload, reset };
}
