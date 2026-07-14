-- ============================================================
-- Economia de XP — Alinhar catálogo admin com as action_keys
-- REAIS usadas pelo feed (RealPostCard) e demais componentes.
-- Executar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente.
-- ============================================================

-- 1) Inserir/atualizar os action_keys REAIS usados pelo feed,
--    com categoria 'action_button' (Botões de Ação) e 'interaction'.
INSERT INTO public.aura_xp_interaction_config
  (action_key, actor_cost, receiver_reward, enabled, category, description)
VALUES
  -- Botões de Ação (post card)
  ('post_like',     1, 1, true, 'action_button', '❤️ Curtir uma Postagem'),
  ('post_dislike',  1, -3, true, 'action_button', '👎 Descurtir uma Postagem'),
  ('post_comment',  1, 3, true, 'action_button', '💬 Comentar em uma Postagem'),
  ('post_share',    1, 5, true, 'action_button', '🔁 Compartilhar Postagem'),
  ('post_save',     1, 2, true, 'action_button', '🔖 Salvar Postagem'),
  -- Interações (modais / visões)
  ('view_likers',   5, 5, true, 'interaction',   '👀 Ver quem curtiu suas postagens'),
  ('view_comments', 5, 5, true, 'interaction',   '💭 Ver comentários da postagem')
ON CONFLICT (action_key) DO UPDATE
  SET category    = EXCLUDED.category,
      description = COALESCE(NULLIF(public.aura_xp_interaction_config.description, ''), EXCLUDED.description);

-- 2) Remover entradas duplicadas/sem efeito que confundem o admin.
--    (btn_* e inter_view_likes não são consumidos pelo frontend.)
DELETE FROM public.aura_xp_interaction_config
 WHERE action_key IN (
   'btn_like','btn_comment','btn_share','btn_save','btn_gift',
   'inter_view_likes'
 );

-- 3) Garantir que a RPC de cobrança trate aliases (defesa em profundidade):
--    se algum componente ainda chamar btn_like / inter_view_likes, mapeia
--    para a chave canônica antes de cobrar.
CREATE OR REPLACE FUNCTION public.aura_xp_normalize_action_key(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_key,''))
    WHEN 'btn_like'         THEN 'post_like'
    WHEN 'btn_dislike'      THEN 'post_dislike'
    WHEN 'btn_comment'      THEN 'post_comment'
    WHEN 'btn_share'        THEN 'post_share'
    WHEN 'btn_save'         THEN 'post_save'
    WHEN 'inter_view_likes' THEN 'view_likers'
    ELSE p_key
  END;
$$;
GRANT EXECUTE ON FUNCTION public.aura_xp_normalize_action_key(text) TO anon, authenticated, service_role;

-- 4) Patch da RPC de cobrança para normalizar a chave de entrada.
--    Mantém a mesma assinatura/retorno usado em useAuraXpInteraction.
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_charge(
  p_action_key  text,
  p_post_id     uuid,
  p_receiver_id uuid,
  p_ref_key     text
)
RETURNS TABLE(
  ok               boolean,
  reason           text,
  actor_cost       integer,
  receiver_reward  integer,
  actor_balance    integer,
  receiver_balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_actor_pid    uuid;
  v_action       text := public.aura_xp_normalize_action_key(p_action_key);
  v_cfg          record;
  v_global_on    boolean := true;
  v_actor_xp     integer := 0;
  v_receiver_xp  integer := 0;
  v_already      boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', 0, 0, 0, 0; RETURN;
  END IF;

  -- Chave geral
  SELECT COALESCE(billing_enabled, true) INTO v_global_on
    FROM public.aura_xp_global_config LIMIT 1;

  -- Catálogo
  SELECT * INTO v_cfg
    FROM public.aura_xp_interaction_config
   WHERE action_key = v_action LIMIT 1;

  IF v_cfg IS NULL OR v_cfg.enabled = false OR v_global_on = false THEN
    RETURN QUERY SELECT true, 'disabled', 0, 0, 0, 0; RETURN;
  END IF;

  -- Perfil do ator
  SELECT id, COALESCE(aura_xp, 0) INTO v_actor_pid, v_actor_xp
    FROM public.profiles
   WHERE id = v_uid OR user_id = v_uid
   LIMIT 1;

  IF v_actor_pid IS NULL THEN
    RETURN QUERY SELECT false, 'no_profile', v_cfg.actor_cost, v_cfg.receiver_reward, 0, 0; RETURN;
  END IF;

  -- Auto-ação: isenta
  IF p_receiver_id IS NOT NULL AND p_receiver_id = v_actor_pid THEN
    RETURN QUERY SELECT true, 'self_action', 0, 0, v_actor_xp, 0; RETURN;
  END IF;

  -- Idempotência via ref_key
  BEGIN
    INSERT INTO public.oculto_aura_xp_interaction_ledger
      (actor_profile_id, receiver_profile_id, post_id, action_key, actor_cost, receiver_reward, ref_key)
    VALUES
      (v_actor_pid, p_receiver_id, p_post_id, v_action, v_cfg.actor_cost, v_cfg.receiver_reward, p_ref_key);
  EXCEPTION WHEN unique_violation THEN
    v_already := true;
  END;

  IF v_already THEN
    SELECT COALESCE(aura_xp,0) INTO v_actor_xp FROM public.profiles WHERE id = v_actor_pid;
    RETURN QUERY SELECT true, 'already_charged', v_cfg.actor_cost, v_cfg.receiver_reward, v_actor_xp, 0; RETURN;
  END IF;

  -- Saldo insuficiente
  IF v_actor_xp < v_cfg.actor_cost THEN
    -- rollback do ledger pra permitir retry após o usuário ganhar XP
    DELETE FROM public.oculto_aura_xp_interaction_ledger
      WHERE ref_key = p_ref_key;
    RETURN QUERY SELECT false, 'insufficient_xp', v_cfg.actor_cost, v_cfg.receiver_reward, v_actor_xp, 0; RETURN;
  END IF;

  -- Debita ator
  UPDATE public.profiles
     SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) - v_cfg.actor_cost)
   WHERE id = v_actor_pid
   RETURNING aura_xp INTO v_actor_xp;

  -- Premia receiver (se houver)
  IF p_receiver_id IS NOT NULL THEN
    UPDATE public.profiles
       SET aura_xp = GREATEST(0, COALESCE(aura_xp,0) + v_cfg.receiver_reward)
     WHERE id = p_receiver_id
     RETURNING aura_xp INTO v_receiver_xp;
  END IF;

  RETURN QUERY SELECT true, 'charged', v_cfg.actor_cost, v_cfg.receiver_reward, v_actor_xp, COALESCE(v_receiver_xp,0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_charge(text, uuid, uuid, text)
  TO authenticated, service_role;

-- 5) Garante realtime nas tabelas de config (já adicionado em migrações anteriores, mas idempotente).
ALTER TABLE public.aura_xp_interaction_config REPLICA IDENTITY FULL;
ALTER TABLE public.aura_xp_global_config       REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='aura_xp_interaction_config';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_xp_interaction_config';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
