-- =====================================================================
-- 2026_06_24_volte_para_ver_purge_seed_interactions.sql
-- "Volte para Ver" — remove ganchos gerados por interações de SEED/BOT.
--
-- Problema: ganchos do tipo content_liked / content_saved / comment_reply
-- foram criados antes do filtro de ator seed. Resultado: o painel mostra
-- "Alguém curtiu …" quando, na verdade, só bots interagiram.
--
-- Esta migração:
--   1) Faz limpeza retroativa: dispensa qualquer hook desses tipos cujo
--      item NÃO tenha NENHUMA interação correspondente vinda de usuário
--      real (is_seed = false ou nulo).
--   2) Endurece a RPC oculto_return_hooks_list — passa a exigir, em tempo
--      de leitura, que exista pelo menos UMA interação real do tipo
--      correspondente no item vinculado.
--
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Limpeza retroativa --------------------------------------------------
UPDATE public.oculto_return_hooks h
   SET status = 'dismissed'
 WHERE h.status IN ('pending','seen')
   AND h.item_id IS NOT NULL
   AND h.hook_type = 'content_liked'
   AND NOT EXISTS (
     SELECT 1
       FROM public.oculto_play_likes l
       LEFT JOIN public.profiles p ON p.id = l.user_id
      WHERE l.item_id = h.item_id
        AND COALESCE(p.is_seed, false) = false
   );

UPDATE public.oculto_return_hooks h
   SET status = 'dismissed'
 WHERE h.status IN ('pending','seen')
   AND h.item_id IS NOT NULL
   AND h.hook_type = 'content_saved'
   AND NOT EXISTS (
     SELECT 1
       FROM public.oculto_play_saves s
       LEFT JOIN public.profiles p ON p.id = s.user_id
      WHERE s.item_id = h.item_id
        AND COALESCE(p.is_seed, false) = false
   );

UPDATE public.oculto_return_hooks h
   SET status = 'dismissed'
 WHERE h.status IN ('pending','seen')
   AND h.item_id IS NOT NULL
   AND h.hook_type = 'comment_reply'
   AND NOT EXISTS (
     SELECT 1
       FROM public.oculto_play_comments c
       LEFT JOIN public.profiles p ON p.id = c.author_id
      WHERE c.item_id = h.item_id
        AND COALESCE(p.is_seed, false) = false
   );

-- 2) RPC endurecida ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oculto_return_hooks_list(p_limit int DEFAULT 8)
RETURNS SETOF public.oculto_return_hooks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h.*
  FROM public.oculto_return_hooks h
  LEFT JOIN public.oculto_play_items i ON i.id = h.item_id
  LEFT JOIN public.profiles pa ON pa.id = i.author_id
  WHERE h.user_id = auth.uid()
    AND h.status IN ('pending','seen')
    AND (h.expires_at IS NULL OR h.expires_at > now())
    AND (
      h.item_id IS NULL
      OR (
        i.id IS NOT NULL
        AND (i.is_published IS NULL OR i.is_published = true)
        AND COALESCE(pa.is_seed, false) = false
      )
    )
    -- Exige pelo menos UMA interação real para hooks de like/save/reply
    AND (
      h.hook_type NOT IN ('content_liked','content_saved','comment_reply')
      OR (
        h.hook_type = 'content_liked' AND EXISTS (
          SELECT 1 FROM public.oculto_play_likes l
            LEFT JOIN public.profiles pp ON pp.id = l.user_id
           WHERE l.item_id = h.item_id
             AND COALESCE(pp.is_seed,false) = false
        )
      )
      OR (
        h.hook_type = 'content_saved' AND EXISTS (
          SELECT 1 FROM public.oculto_play_saves s
            LEFT JOIN public.profiles pp ON pp.id = s.user_id
           WHERE s.item_id = h.item_id
             AND COALESCE(pp.is_seed,false) = false
        )
      )
      OR (
        h.hook_type = 'comment_reply' AND EXISTS (
          SELECT 1 FROM public.oculto_play_comments c
            LEFT JOIN public.profiles pp ON pp.id = c.author_id
           WHERE c.item_id = h.item_id
             AND COALESCE(pp.is_seed,false) = false
        )
      )
    )
  ORDER BY h.priority DESC, h.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50))
$$;
GRANT EXECUTE ON FUNCTION public.oculto_return_hooks_list(int) TO authenticated;

NOTIFY pgrst, 'reload schema';
