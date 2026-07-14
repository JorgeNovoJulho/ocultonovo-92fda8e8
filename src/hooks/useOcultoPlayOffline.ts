/**
 * useOcultoPlayOffline — Etapa 40
 *
 * Gerencia downloads offline de mídia do Oculto Play usando Cache Storage.
 * - Cache dedicado `oculto-play-offline-v1` (não conflita com o SW principal).
 * - Persiste metadados via RPC `oculto_play_record_download`.
 * - `getOfflineUrl(itemId)` devolve a URL original se houver entrada no cache
 *   (o cliente faz fetch normal; o SW principal não cacheia mídia da Supabase,
 *   mas como inserimos manualmente no cache via `cache.add`, o `cache.match`
 *   funciona como fallback explícito).
 *
 * Respeita PPV/VIP: só dispara download para mídia que o usuário já consegue
 * carregar (URL pública ou signed URL emitida ao usuário autenticado).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const CACHE_NAME = 'oculto-play-offline-v1';

export interface OfflineDownload {
  id: string;
  item_id: string;
  kind: string;
  title: string | null;
  thumb_url: string | null;
  media_url: string;
  size_bytes: number | null;
  is_paid: boolean;
  downloaded_at: string;
  last_played_at: string | null;
}

function isCacheSupported() {
  return typeof window !== 'undefined' && 'caches' in window;
}

export function useOcultoPlayOffline() {
  const { user } = useAuth();
  const [downloads, setDownloads] = useState<OfflineDownload[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) { setDownloads([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('oculto_play_list_downloads' as any);
      if (error) throw error;
      setDownloads((data as OfflineDownload[]) || []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  const isDownloaded = useCallback(
    (itemId: string) => downloads.some(d => d.item_id === itemId),
    [downloads],
  );

  const downloadItem = useCallback(async (params: {
    itemId: string;
    kind: string;
    title?: string | null;
    thumbUrl?: string | null;
    mediaUrl: string;
    isPaid?: boolean;
  }) => {
    if (!user?.id) {
      toast.error('Faça login para baixar mídias.');
      return false;
    }
    if (!isCacheSupported()) {
      toast.error('Seu navegador não suporta cache offline.');
      return false;
    }
    if (!params.mediaUrl) {
      toast.error('Mídia indisponível para download.');
      return false;
    }

    setBusyItemId(params.itemId);
    try {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(params.mediaUrl, { credentials: 'omit', mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cloned = response.clone();
      const blob = await cloned.blob();
      await cache.put(params.mediaUrl, response);

      // Cacheia thumb também (best-effort)
      if (params.thumbUrl) {
        try {
          const tRes = await fetch(params.thumbUrl, { credentials: 'omit', mode: 'cors' });
          if (tRes.ok) await cache.put(params.thumbUrl, tRes);
        } catch { /* ignora */ }
      }

      const { error } = await supabase.rpc('oculto_play_record_download' as any, {
        _item_id: params.itemId,
        _kind: params.kind,
        _title: params.title ?? null,
        _thumb_url: params.thumbUrl ?? null,
        _media_url: params.mediaUrl,
        _size_bytes: blob.size,
        _is_paid: !!params.isPaid,
      });
      if (error) throw error;

      toast.success('Disponível offline');
      await refresh();
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao baixar mídia offline');
      return false;
    } finally {
      setBusyItemId(null);
    }
  }, [user?.id, refresh]);

  const removeItem = useCallback(async (itemId: string) => {
    setBusyItemId(itemId);
    try {
      const target = downloads.find(d => d.item_id === itemId);
      if (target && isCacheSupported()) {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(target.media_url).catch(() => {});
        if (target.thumb_url) await cache.delete(target.thumb_url).catch(() => {});
      }
      const { error } = await supabase.rpc('oculto_play_remove_download' as any, { _item_id: itemId });
      if (error) throw error;
      await refresh();
      toast.success('Removido dos downloads');
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao remover download');
    } finally {
      setBusyItemId(null);
    }
  }, [downloads, refresh]);

  return { downloads, loading, busyItemId, isDownloaded, downloadItem, removeItem, refresh };
}

/**
 * Resolve uma URL para um blob: URL local quando houver cópia no Cache Storage.
 * Útil para reproduzir mídia 100% offline.
 */
export async function resolveOfflineUrl(originalUrl: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window) || !originalUrl) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(originalUrl);
    if (!hit) return null;
    const blob = await hit.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

