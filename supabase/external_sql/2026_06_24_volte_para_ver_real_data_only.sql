-- =====================================================================
-- 2026_06_24_volte_para_ver_real_data_only.sql
-- "Volte para Ver" — apenas dados REAIS.
--
-- Correções:
--   1) Trigger de like/save/comment ignora ações de usuários SEED/bot
--      (profiles.is_seed = true), evitando que conteúdo gerado por bots
--      crie ganchos no painel do usuário real.
--   2) RPC oculto_return_hooks_list filtra hooks cujo item:
--        - não existe mais
--        - está despublicado / oculto
--        - pertence a autor seed (não é conteúdo real)
--      e exige item_id presente quando o tipo for vinculado a item.
--   3) Limpeza retroativa: marca como 'dismissed' todos os hooks
--      pendentes/vistos atualmente ligados a item ausente ou de autor
--      seed.
--
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- -------------------------------------------------------------------
-- 1) Triggers atualizados — ignoram atores SEED
-- -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_oculto_hook_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author uuid;
  v_title  text;
  v_actor_seed boolean := false;
  v_author_seed boolean := false;
BEGIN
  -- Ignora ações de bots/seed
  SELECT COALESCE(is_seed,false) INTO v_actor_seed FROM public.profiles WHERE id = NEW.user_id;
  IF v_actor_seed THEN RETURN NEW; END IF;

  SELECT author_id, COALESCE(title, caption, 'seu conteúdo')
    INTO v_author, v_title
    FROM public.oculto_play_items WHERE id = NEW.item_id;
  IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;

  -- Não gera hook para dono seed (não é conteúdo real)
  SELECT COALESCE(is_seed,false) INTO v_author_seed FROM public.profiles WHERE id = v_author;
  IF v_author_seed THEN RETURN NEW; END IF;

  PERFORM public._oculto_hook_upsert(
    v_author, 'content_liked',
    'Seu conteúdo recebeu novas curtidas',
    'Alguém curtiu: ' || COALESCE(v_title,''),
    '/play/p/' || NEW.item_id::text,
    NEW.item_id, 2, interval '7 days'
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_oculto_hook_on_save()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_author uuid;
  v_title  text;
  v_actor_seed boolean := false;
  v_author_seed boolean := false;
BEGIN
  SELECT COALESCE(is_seed,false) INTO v_actor_seed FROM public.profiles WHERE id = NEW.user_id;
  IF v_actor_seed THEN RETURN NEW; END IF;

  SELECT author_id, COALESCE(title, caption, 'seu conteúdo')
    INTO v_author, v_title
    FROM public.oculto_play_items WHERE id = NEW.item_id;
  IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(is_seed,false) INTO v_author_seed FROM public.profiles WHERE id = v_author;
  IF v_author_seed THEN RETURN NEW; END IF;

  PERFORM public._oculto_hook_upsert(
    v_author, 'content_saved',
    'Seu conteúdo foi salvo',
    'Alguém adicionou aos salvos: ' || COALESCE(v_title,''),
    '/play/p/' || NEW.item_id::text,
    NEW.item_id, 2, interval '7 days'
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_oculto_hook_on_comment_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent_user uuid;
  v_title text;
  v_actor_seed boolean := false;
  v_parent_seed boolean := false;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(is_seed,false) INTO v_actor_seed FROM public.profiles WHERE id = NEW.user_id;
  IF v_actor_seed THEN RETURN NEW; END IF;

  SELECT user_id INTO v_parent_user FROM public.oculto_play_comments WHERE id = NEW.parent_id;
  IF v_parent_user IS NULL OR v_parent_user = NEW.user_id THEN RETURN NEW; END IF;

  SELECT COALESCE(is_seed,false) INTO v_parent_seed FROM public.profiles WHERE id = v_parent_user;
  IF v_parent_seed THEN RETURN NEW; END IF;

  SELECT COALESCE(title, caption, 'um conteúdo') INTO v_title
    FROM public.oculto_play_items WHERE id = NEW.item_id;

  PERFORM public._oculto_hook_upsert(
    v_parent_user, 'comment_reply',
    'Responderam seu comentário',
    'Em: ' || COALESCE(v_title,''),
    '/play/p/' || NEW.item_id::text,
    NEW.item_id, 3, interval '7 days'
  );
  RETURN NEW;
END $$;

-- -------------------------------------------------------------------
-- 2) RPC de leitura — filtra hooks "fantasmas" e de autor seed
-- -------------------------------------------------------------------
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
    -- hooks vinculados a item PRECISAM ter item real e publicado
    AND (
      h.item_id IS NULL
      OR (
        i.id IS NOT NULL
        AND (i.is_published IS NULL OR i.is_published = true)
        AND COALESCE(pa.is_seed, false) = false
      )
    )
  ORDER BY h.priority DESC, h.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 8), 50))
$$;
GRANT EXECUTE ON FUNCTION public.oculto_return_hooks_list(int) TO authenticated;

-- -------------------------------------------------------------------
-- 3) Limpeza retroativa: dispensa hooks já criados que apontam para
--    itens deletados, despublicados ou de autor seed.
-- -------------------------------------------------------------------
UPDATE public.oculto_return_hooks h
   SET status = 'dismissed', updated_at = now()
  FROM public.oculto_return_hooks h2
  LEFT JOIN public.oculto_play_items i ON i.id = h2.item_id
  LEFT JOIN public.profiles pa ON pa.id = i.author_id
 WHERE h.id = h2.id
   AND h.status IN ('pending','seen')
   AND h2.item_id IS NOT NULL
   AND (
     i.id IS NULL
     OR COALESCE(i.is_published, true) = false
     OR COALESCE(pa.is_seed, false) = true
   );

NOTIFY pgrst, 'reload schema';
