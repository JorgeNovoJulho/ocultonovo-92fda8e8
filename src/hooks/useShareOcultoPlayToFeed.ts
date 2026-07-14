/**
 * useShareOcultoPlayToFeed — cria um post no feed principal apontando
 * para um item do OCULTO PLAY (capa + player de prévia + CTA).
 *
 * O post nasce com:
 *  - oculto_play_item_id  → referência ao item (FK)
 *  - thumbnail_url        → capa do item (para preview rápido se algo falhar)
 *  - content_text         → legenda fornecida (ou título do item)
 *  - sem media_url        → o card do feed renderiza o embed do Play
 *
 * Também incrementa o share_count do item via RPC já existente.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { getCanonicalAuthorIds } from '@/lib/postAuthorResolver';
import type { OcultoPlayItem } from '@/hooks/useOcultoPlayContent';

export interface ShareToFeedInput {
  /** Pode passar o item já carregado OU apenas o id (o hook busca o resto). */
  item?: Partial<OcultoPlayItem> & { id: string };
  itemId?: string;
  caption?: string | null;
}

export function useShareOcultoPlayToFeed() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ item, itemId, caption }: ShareToFeedInput) => {
      if (!user?.id) throw new Error('Você precisa estar logado para compartilhar.');

      const id = item?.id ?? itemId;
      if (!id) throw new Error('Item do Oculto Play ausente.');

      // Garante título e capa quando só recebemos o id
      let thumb = item?.thumb_url ?? null;
      let title = item?.title ?? null;
      let itemCaption = item?.caption ?? null;
      let isAdult = (item as any)?.is_adult ?? null;
      if (!item || !thumb || !title || isAdult === null) {
        const { data: it } = await supabase
          .from('oculto_play_items')
          .select('title,caption,thumb_url,is_adult')
          .eq('id', id)
          .maybeSingle();
        thumb = thumb ?? (it?.thumb_url ?? null);
        title = title ?? (it?.title ?? null);
        itemCaption = itemCaption ?? (it?.caption ?? null);
        isAdult = isAdult ?? ((it as any)?.is_adult ?? false);
      }

      const { authorProfileId, creatorId } = await getCanonicalAuthorIds(user.id);

      const text =
        (caption ?? '').trim() ||
        title ||
        itemCaption ||
        'Ouça no OCULTO PLAY';


      const payload: Record<string, unknown> = {
        author_id: authorProfileId,
        creator_id: creatorId,
        content_text: text,
        thumbnail_url: thumb,
        media_url: null,
        media_type: null,
        privacy_level: 'public',
        allow_sharing: true,
        oculto_play_item_id: id,
        is_adult: !!isAdult,
      };

      const { data, error } = await supabase
        .from('posts')
        .insert(payload as never)
        .select('*')
        .single();
      if (error) throw error;

      // Conta o compartilhamento no item (best-effort)
      try {
        await supabase.rpc('register_oculto_play_share' as never, { p_item_id: id } as never);
      } catch {
        /* opcional — RPC pode não existir; ignora */
      }

      return data as any;
    },

    onSuccess: (newPost: any) => {
      toast.success('Compartilhado no feed principal');

      // Prepend otimista: injeta o novo post no topo dos caches do feed
      // para aparecer instantaneamente, sem esperar refetch/realtime.
      if (newPost?.id) {
        qc.setQueriesData({ queryKey: ['posts-infinite'] }, (old: any) => {
          if (!old?.pages?.length) return old;
          const already = old.pages.some((pg: any) =>
            (pg.posts || []).some((p: any) => p.id === newPost.id),
          );
          if (already) return old;
          const pages = old.pages.slice();
          pages[0] = {
            ...pages[0],
            posts: [newPost, ...(pages[0].posts || [])],
          };
          return { ...old, pages };
        });
        qc.setQueriesData({ queryKey: ['posts'] }, (old: any) => {
          if (!Array.isArray(old)) return old;
          if (old.some((p: any) => p.id === newPost.id)) return old;
          return [newPost, ...old];
        });
      }

      qc.invalidateQueries({ queryKey: ['posts'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['posts-infinite'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['my-posts'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['my-diary-posts'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['creator-channel'], refetchType: 'all' });
      qc.invalidateQueries({ queryKey: ['creator-posts'], refetchType: 'all' });
    },

    onError: (err: any) => {
      toast.error('Não foi possível compartilhar no feed', {
        description: err?.message,
      });
    },
  });
}
