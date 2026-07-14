import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { getResolvedOwnerIds } from '@/lib/postAuthorResolver';
import { resolvePostMediaUrl } from '@/lib/postMediaUtils';
import { resolveMediaKind, resolveVideoThumbnail } from '@/lib/mediaType';

const OWNER_FILTER_VARIANTS = [
  ['author_id', 'creator_id', 'user_id'],
  ['author_id', 'creator_id'],
  ['author_id', 'user_id'],
  ['user_id'],
  ['creator_id'],
  ['author_id'],
] as const;

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '42703' || code === 'PGRST204' || message.includes('does not exist') || message.includes('schema cache');
};

const buildOwnerOrFilter = (ownerIds: string[], columns: readonly string[]) =>
  ownerIds.flatMap((id) => columns.map((column) => `${column}.eq.${id}`)).join(',');

const buildMediaSelectColumns = (columns: readonly string[]) => {
  const selectColumns = new Set([
    'id',
    'content_text',
    'media_url',
    'media_urls',
    'preview_url',
    'video_master_url',
    'video_preview_url',
    'media_type',
    'thumbnail_url',
    'privacy_level',
    'is_hidden',
    'is_locked',
    'is_paid',
    'paid_price',
    'likes_count',
    'comments_count',
    'created_at',
    'updated_at',
    'post_type',
    'is_flash',
  ]);

  if (columns.includes('author_id')) selectColumns.add('author_id');
  if (columns.includes('creator_id')) selectColumns.add('creator_id');
  if (columns.includes('user_id')) selectColumns.add('user_id');

  return Array.from(selectColumns).join(', ');
};

export type PrivacyLevel = 'public' | 'friends' | 'vip' | 'hidden';

export interface MediaItem {
  id: string;
  user_id: string;
  content_text: string | null;
  media_url: string | null;
  media_type?: string | null;
  thumbnail_url?: string | null;
  privacy_level: PrivacyLevel;
  is_locked: boolean;
  is_paid?: boolean;
  paid_price?: number | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface MediaUpdateData {
  content_text?: string;
  is_locked?: boolean;
  is_paid?: boolean;
  paid_price?: number | null;
}

function normalizeMediaItem(item: any): MediaItem {
  const resolvedUrl = resolvePostMediaUrl(item);
  const mediaKind = resolveMediaKind(item?.media_type, resolvedUrl);

  return {
    ...item,
    media_url: resolvedUrl,
    media_type: mediaKind === 'video' ? 'video' : (item?.media_type || 'image'),
    thumbnail_url: mediaKind === 'video'
      ? resolveVideoThumbnail(item?.thumbnail_url, resolvedUrl)
      : (item?.thumbnail_url || resolvedUrl),
    user_id: item.user_id || item.author_id || item.creator_id,
    privacy_level: item.is_hidden === true ? 'hidden' : (item.privacy_level || 'public'),
    is_locked: item.is_locked ?? false,
    likes_count: item.likes_count ?? 0,
    comments_count: item.comments_count ?? 0,
  } as MediaItem;
}

export function useCreatorMedia() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['creator-media', user?.id] as const;

  // Realtime: invalida o cache assim que qualquer post do dono muda (insert/update/delete),
  // garantindo que as miniaturas dos cards (Público, Amigos, VIP, Invisível) atualizem
  // sem precisar recarregar a página após cada upload/edição.
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    let unsub: (() => void) | null = null;

    const setupRealtime = async () => {
      const ownerIds = await getResolvedOwnerIds(undefined, user.id);
      if (!active || ownerIds.length === 0) return;

      const ownerSet = new Set(ownerIds);
      const invalidate = () => {
        queryClient.invalidateQueries({ queryKey, refetchType: 'all' });
      };

      unsub = subscribeTable('posts', (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row) return;
        if (
          ownerSet.has(row.author_id) ||
          ownerSet.has(row.creator_id) ||
          ownerSet.has(row.user_id)
        ) {
          invalidate();
        }
      });
    };

    void setupRealtime();

    return () => {
      active = false;
      try {
        if (unsub) unsub();
      } catch {}
    };
  }, [user?.id, queryClient]);


  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!user?.id) return [];

      const ownerIds = await getResolvedOwnerIds(undefined, user.id);
      if (ownerIds.length === 0) return [];

      let data: any[] | null = null;
      let lastError: any = null;

      for (const columns of OWNER_FILTER_VARIANTS) {
        const result = await (supabase as any)
          .from('posts')
          .select(buildMediaSelectColumns(columns))
          .or(buildOwnerOrFilter(ownerIds, columns))
          .order('created_at', { ascending: false });

        if (!result.error) {
          data = result.data || [];
          lastError = null;
          break;
        }

        if (!isMissingColumnError(result.error)) {
          lastError = result.error;
          break;
        }

        lastError = result.error;
      }

      if (lastError) {
        console.error('Error fetching media:', lastError);
        return [];
      }

      const visibleItems = (data || []).filter((item: any) => {
        if (item?.is_flash === true || item?.post_type === 'story') return false;
        return !!resolvePostMediaUrl(item);
      });
      const uniqueItems = Array.from(new Map(visibleItems.map((item: any) => [item.id, item])).values());

      return uniqueItems.map(normalizeMediaItem);
    },
    enabled: !!user?.id,
  });
}

// Side-effects da troca de visibilidade:
// - public:  visível no feed, sem cadeado, sem cobrança
// - friends: visível só para quem o autor segue (filtro do feed via view); sem cobrança
// - vip:     bloqueado/pago — exige paid_price (>0) para liberar
// - hidden:  fora do feed e dos salvos de outros; ninguém vê
function buildPrivacyPayload(level: PrivacyLevel, price?: number | null) {
  switch (level) {
    case 'public':
      return { privacy_level: 'public', is_locked: false, is_paid: false, paid_price: null, is_hidden: false };
    case 'friends':
      return { privacy_level: 'friends', is_locked: false, is_paid: false, paid_price: null, is_hidden: false };
    case 'vip': {
      const p = Number(price ?? 0);
      return {
        privacy_level: 'vip',
        is_locked: true,
        is_paid: true,
        paid_price: p > 0 ? p : null,
        is_hidden: false,
      };
    }
    case 'hidden':
      return { privacy_level: 'hidden', is_locked: true, is_paid: false, paid_price: null, is_hidden: true };
  }
}

const FEED_SYNC_QUERY_KEYS = [['posts'], ['posts-infinite'], ['my-posts'], ['saved-posts']] as const;

async function syncPrivacySensitiveQueries(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['creator-media'], refetchType: 'all' }),
    ...FEED_SYNC_QUERY_KEYS.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey], refetchType: 'all' })
    ),
    queryClient.refetchQueries({ queryKey: ['creator-media'], type: 'all' }),
    ...FEED_SYNC_QUERY_KEYS.map((queryKey) =>
      queryClient.refetchQueries({ queryKey: [...queryKey], type: 'all' })
    ),
  ]);
}

function buildOptimisticPrivacyPatch(item: MediaItem, level: PrivacyLevel, price?: number | null) {
  const fallbackVipPrice = level === 'vip' && (!(Number(price ?? 0) > 0))
    ? item.paid_price ?? null
    : price ?? null;

  return buildPrivacyPayload(level, fallbackVipPrice);
}

export function useMoveMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      mediaId,
      newPrivacyLevel,
      price,
    }: {
      mediaId: string;
      newPrivacyLevel: PrivacyLevel;
      price?: number | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Para VIP, preserva paid_price atual quando o caller não passa um novo
      let resolvedPrice = price ?? null;
      if (newPrivacyLevel === 'vip' && (resolvedPrice == null || resolvedPrice <= 0)) {
        const { data: current } = await (supabase as any)
          .from('posts')
          .select('paid_price')
          .eq('id', mediaId)
          .maybeSingle();
        const existing = Number(current?.paid_price ?? 0);
        if (existing > 0) resolvedPrice = existing;
      }

      const payload = buildPrivacyPayload(newPrivacyLevel, resolvedPrice);

      const { error } = await supabase
        .from('posts' as any)
        .update(payload as any)
        .eq('id', mediaId);

      if (error) throw error;

      // Conteúdo invisível: remover dos "salvos" de outros usuários
      if (newPrivacyLevel === 'hidden') {
        await supabase.from('saved_posts' as any).delete().eq('post_id', mediaId);
      }

      return { mediaId, newPrivacyLevel };
    },
    onMutate: async ({ mediaId, newPrivacyLevel, price }) => {
      await queryClient.cancelQueries({ queryKey: ['creator-media'] });
      const previousMedia = queryClient.getQueryData<MediaItem[]>(['creator-media', user?.id]);

      const currentItem = previousMedia?.find((item) => item.id === mediaId);
      queryClient.setQueryData<MediaItem[]>(['creator-media', user?.id], (old) =>
        old?.map((item) =>
          item.id === mediaId
            ? { ...item, ...(buildOptimisticPrivacyPatch(item, newPrivacyLevel, price ?? null) as any) }
            : item
        ) || []
      );

      return { previousMedia, currentItem };
    },
    onError: (err, variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(['creator-media', user?.id], context.previousMedia);
      }
      toast.error('Erro ao mover mídia');
    },
    onSuccess: (data) => {
      const levelLabels: Record<PrivacyLevel, string> = {
        public: 'Público',
        friends: 'Amigos',
        vip: 'VIP',
        hidden: 'Invisível',
      };
      toast.success(`Mídia movida para ${levelLabels[data.newPrivacyLevel]}!`);
    },
    onSettled: async () => {
      await syncPrivacySensitiveQueries(queryClient);
    },
  });
}

export function useDeleteMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (mediaId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('posts' as any)
        .delete()
        .eq('id', mediaId);

      if (error) throw error;
      return mediaId;
    },
    onMutate: async (mediaId) => {
      await queryClient.cancelQueries({ queryKey: ['creator-media'] });
      const previousMedia = queryClient.getQueryData<MediaItem[]>(['creator-media', user?.id]);

      queryClient.setQueryData<MediaItem[]>(['creator-media', user?.id], (old) =>
        old?.filter((item) => item.id !== mediaId) || []
      );

      return { previousMedia };
    },
    onError: (err, variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(['creator-media', user?.id], context.previousMedia);
      }
      toast.error('Erro ao excluir mídia');
    },
    onSuccess: () => {
      toast.success('Mídia excluída com sucesso!');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-media'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useBulkMoveMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      mediaIds,
      newPrivacyLevel,
      price,
    }: {
      mediaIds: string[];
      newPrivacyLevel: PrivacyLevel;
      price?: number | null;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const payload = buildPrivacyPayload(newPrivacyLevel, price ?? null);

      const { error } = await supabase
        .from('posts' as any)
        .update(payload as any)
        .in('id', mediaIds);

      if (error) throw error;

      if (newPrivacyLevel === 'hidden') {
        await supabase.from('saved_posts' as any).delete().in('post_id', mediaIds);
      }

      return { mediaIds, newPrivacyLevel };
    },
    onMutate: async ({ mediaIds, newPrivacyLevel, price }) => {
      await queryClient.cancelQueries({ queryKey: ['creator-media'] });
      const previousMedia = queryClient.getQueryData<MediaItem[]>(['creator-media', user?.id]);

      queryClient.setQueryData<MediaItem[]>(['creator-media', user?.id], (old) =>
        old?.map((item) =>
          mediaIds.includes(item.id)
            ? { ...item, ...(buildOptimisticPrivacyPatch(item, newPrivacyLevel, price ?? null) as any) }
            : item
        ) || []
      );

      return { previousMedia };
    },
    onError: (err, variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(['creator-media', user?.id], context.previousMedia);
      }
      toast.error('Erro ao mover mídias');
    },
    onSuccess: (data) => {
      const levelLabels: Record<PrivacyLevel, string> = {
        public: 'Público',
        friends: 'Amigos',
        vip: 'VIP',
        hidden: 'Invisível',
      };
      toast.success(`${data.mediaIds.length} mídias movidas para ${levelLabels[data.newPrivacyLevel]}!`);
    },
    onSettled: async () => {
      await syncPrivacySensitiveQueries(queryClient);
    },
  });
}

export function useBulkDeleteMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (mediaIds: string[]) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('posts' as any)
        .delete()
        .in('id', mediaIds);

      if (error) throw error;
      return mediaIds;
    },
    onMutate: async (mediaIds) => {
      await queryClient.cancelQueries({ queryKey: ['creator-media'] });
      const previousMedia = queryClient.getQueryData<MediaItem[]>(['creator-media', user?.id]);

      queryClient.setQueryData<MediaItem[]>(['creator-media', user?.id], (old) =>
        old?.filter((item) => !mediaIds.includes(item.id)) || []
      );

      return { previousMedia };
    },
    onError: (err, variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(['creator-media', user?.id], context.previousMedia);
      }
      toast.error('Erro ao excluir mídias');
    },
    onSuccess: (mediaIds) => {
      toast.success(`${mediaIds.length} mídias excluídas!`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-media'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useUpdateMedia() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      mediaId, 
      data 
    }: { 
      mediaId: string; 
      data: MediaUpdateData;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('posts' as any)
        .update(data)
        .eq('id', mediaId);

      if (error) throw error;
      return { mediaId, data };
    },
    onMutate: async ({ mediaId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['creator-media'] });
      const previousMedia = queryClient.getQueryData<MediaItem[]>(['creator-media', user?.id]);

      queryClient.setQueryData<MediaItem[]>(['creator-media', user?.id], (old) =>
        old?.map((item) =>
          item.id === mediaId ? { ...item, ...data } : item
        ) || []
      );

      return { previousMedia };
    },
    onError: (err, variables, context) => {
      if (context?.previousMedia) {
        queryClient.setQueryData(['creator-media', user?.id], context.previousMedia);
      }
      toast.error('Erro ao atualizar mídia');
    },
    onSuccess: () => {
      toast.success('Mídia atualizada com sucesso!');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-media'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
