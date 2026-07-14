-- ============================================================
-- 2026_06_03n_aura_xp_rpc_canonical_fix.sql
-- Corrige overload duplicado da RPC e estabiliza o painel admin Aura XP
-- Banco EXTERNO: rvybbrkzmboqbhcemqar
-- Idempotente
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Garantir helper master admin
CREATE OR REPLACE FUNCTION public._is_master_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.user_id OR u.id = p.id
    WHERE (p.user_id = _uid OR p.id = _uid)
      AND (
        lower(coalesce(p.username, '')) = 'ocultomaster'
        OR lower(coalesce(u.email, '')) = 'ocultomaster@ocultoswing.com.br'
        OR coalesce(p.is_master_admin, false) = true
      )
  )
  OR EXISTS (
    SELECT 1
    FROM auth.users u
    WHERE u.id = _uid
      AND lower(coalesce(u.email, '')) = 'ocultomaster@ocultoswing.com.br'
  );
$$;

GRANT EXECUTE ON FUNCTION public._is_master_admin(uuid) TO anon, authenticated, service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_master_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles
SET is_master_admin = true
WHERE lower(coalesce(username, '')) = 'ocultomaster'
   OR lower(coalesce(email, '')) = 'ocultomaster@ocultoswing.com.br';

-- 2) Garantir tabela global
CREATE TABLE IF NOT EXISTS public.aura_xp_global_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_enabled boolean NOT NULL DEFAULT true,
  multiplier numeric(10,2) NOT NULL DEFAULT 1.00,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.aura_xp_global_config TO anon;
GRANT SELECT, UPDATE ON public.aura_xp_global_config TO authenticated;
GRANT ALL ON public.aura_xp_global_config TO service_role;

ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aura_xp_global_read ON public.aura_xp_global_config;
DROP POLICY IF EXISTS aura_xp_global_write ON public.aura_xp_global_config;

CREATE POLICY aura_xp_global_read
ON public.aura_xp_global_config
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY aura_xp_global_write
ON public.aura_xp_global_config
FOR UPDATE
TO authenticated
USING (public._is_master_admin(auth.uid()))
WITH CHECK (public._is_master_admin(auth.uid()));

INSERT INTO public.aura_xp_global_config (billing_enabled, multiplier)
SELECT true, 1.00
WHERE NOT EXISTS (
  SELECT 1 FROM public.aura_xp_global_config
);

-- 3) Garantir tabela singular usada pelo app
CREATE TABLE IF NOT EXISTS public.aura_xp_interaction_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_key text NOT NULL UNIQUE,
  actor_cost integer NOT NULL DEFAULT 50,
  receiver_reward integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  category text NOT NULL DEFAULT 'interaction',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS actor_cost integer NOT NULL DEFAULT 50;
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS receiver_reward integer NOT NULL DEFAULT 0;
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'interaction';
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.aura_xp_interaction_config
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.aura_xp_interaction_config'::regclass
      AND conname = 'aura_xp_interaction_config_pkey'
  ) THEN
    BEGIN
      ALTER TABLE public.aura_xp_interaction_config
        ADD CONSTRAINT aura_xp_interaction_config_pkey PRIMARY KEY (id);
    EXCEPTION WHEN invalid_table_definition THEN
      NULL;
    WHEN duplicate_table THEN
      NULL;
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.aura_xp_interaction_config'::regclass
      AND conname = 'aura_xp_interaction_config_action_key_key'
  ) THEN
    ALTER TABLE public.aura_xp_interaction_config
      ADD CONSTRAINT aura_xp_interaction_config_action_key_key UNIQUE (action_key);
  END IF;
END $$;

GRANT SELECT ON public.aura_xp_interaction_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_xp_interaction_config TO authenticated;
GRANT ALL ON public.aura_xp_interaction_config TO service_role;

ALTER TABLE public.aura_xp_interaction_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aura_xp_config_read ON public.aura_xp_interaction_config;
DROP POLICY IF EXISTS aura_xp_config_master_write ON public.aura_xp_interaction_config;

CREATE POLICY aura_xp_config_read
ON public.aura_xp_interaction_config
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY aura_xp_config_master_write
ON public.aura_xp_interaction_config
FOR ALL
TO authenticated
USING (public._is_master_admin(auth.uid()))
WITH CHECK (public._is_master_admin(auth.uid()));

-- 4) Seed catálogo padrão
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, receiver_reward, enabled, category, description)
VALUES
  ('menu_feed', 50, 0, true, 'menu', '🏠 Início (Feed)'),
  ('menu_pesquisar', 50, 0, true, 'menu', '🔍 Pesquisar'),
  ('menu_profile', 50, 0, true, 'menu', '👤 Meu Perfil'),
  ('menu_radar', 50, 0, true, 'menu', '📍 Radar'),
  ('menu_canal_vip', 50, 0, true, 'menu', '👑 Meu Canal VIP'),
  ('menu_aura_match', 50, 0, true, 'menu', '✨ Aura Match'),
  ('menu_perfect_pair', 50, 0, true, 'menu', '❤️ Perfect Pair'),
  ('menu_publicar', 50, 0, true, 'menu', '➕ Publicar'),
  ('menu_sessoes_ocultas', 50, 0, true, 'menu', '🌌 Sessões Ocultas'),
  ('menu_followers', 50, 0, true, 'menu', '👥 Seguidores'),
  ('menu_following', 50, 0, true, 'menu', '🤝 Seguindo'),
  ('menu_my_gifts', 50, 0, true, 'menu', '🎁 Meus Presentes'),
  ('menu_matches', 50, 0, true, 'menu', '🔥 Matches'),
  ('menu_chat', 50, 0, true, 'menu', '💬 Chat'),
  ('menu_notepad', 50, 0, true, 'menu', '📝 Bloco de Notas'),
  ('menu_likes', 50, 0, true, 'menu', '❤️ Curtidas'),
  ('menu_ranking', 50, 0, true, 'menu', '🏆 Ranking'),
  ('menu_visits', 50, 0, true, 'menu', '👁️ Visitas Recebidas'),
  ('menu_notifications', 50, 0, true, 'menu', '🔔 Notificações'),
  ('menu_promotions', 50, 0, true, 'menu', '🎉 Promoções'),
  ('menu_my_media', 50, 0, true, 'menu', '📁 Minhas Mídias'),
  ('menu_vip_downloads', 50, 0, true, 'menu', '⬇️ Meus Downloads VIP'),
  ('menu_safety_checkin', 50, 0, true, 'menu', '🛡️ Encontro Seguro'),
  ('menu_support', 50, 0, true, 'menu', '⚠️ Problemas / Suporte'),
  ('menu_plans_paid', 50, 0, true, 'menu', '👑 Planos Pagos'),
  ('menu_subscriptions', 50, 0, true, 'menu', '👑 Assinaturas'),
  ('menu_vitrine', 50, 0, true, 'menu', '🛍️ Vitrine'),
  ('menu_affiliates', 50, 0, true, 'menu', '🎁 Ganhe Indicando'),
  ('menu_events', 50, 0, true, 'menu', '🎊 Eventos'),
  ('menu_saved', 50, 0, true, 'menu', '🔖 Salvos'),
  ('menu_auctions', 50, 0, true, 'menu', '🔨 Leilões'),
  ('menu_financeiro', 50, 0, true, 'menu', '💰 Financeiro'),
  ('menu_settings', 50, 0, true, 'menu', '⚙️ Configurações'),
  ('menu_experiencias_ocultas', 50, 0, true, 'menu', '🌒 Experiências Ocultas'),
  ('tool_scheduled_posts', 50, 0, true, 'tool', 'Agendamento de Postagens'),
  ('tool_photo_editor', 50, 0, true, 'tool', 'Editor de Imagens Integrado'),
  ('tool_video_filters', 50, 0, true, 'tool', 'Filtros Avançados de Vídeo'),
  ('tool_ghost_mode', 50, 0, true, 'tool', 'Modo Invisível'),
  ('tool_profile_analytics', 50, 0, true, 'tool', 'Estatísticas de Engajamento'),
  ('btn_like', 1, 1, true, 'action_button', 'Curtir uma Postagem'),
  ('btn_comment', 1, 3, true, 'action_button', 'Comentar em uma Postagem'),
  ('btn_share', 1, 5, true, 'action_button', 'Compartilhar Postagem'),
  ('btn_gift', 50, 0, true, 'action_button', 'Enviar Presente'),
  ('btn_save', 1, 2, true, 'action_button', 'Salvar Postagem'),
  ('inter_view_likes', 5, 5, true, 'interaction', 'Ver quem curtiu suas postagens'),
  ('inter_view_visits', 5, 0, true, 'interaction', 'Ver quem visitou seu perfil'),
  ('inter_super_like', 50, 0, true, 'interaction', 'Super Like no Aura Match'),
  ('inter_boost_profile', 50, 0, true, 'interaction', 'Impulsionar perfil')
ON CONFLICT (action_key) DO UPDATE
SET category = EXCLUDED.category,
    description = COALESCE(NULLIF(public.aura_xp_interaction_config.description, ''), EXCLUDED.description);

-- 5) Remover overloads antigas da RPC para evitar ambiguidade/AbortError
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      p.oid::regprocedure AS regproc,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'aura_xp_interaction_config_upsert'
  LOOP
    IF r.identity_args <> 'p_action_key text, p_actor_cost integer, p_enabled boolean, p_category text, p_description text' THEN
      EXECUTE format('DROP FUNCTION IF EXISTS public.aura_xp_interaction_config_upsert(%s);', r.identity_args);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS TABLE(
  action_key text,
  actor_cost integer,
  receiver_reward integer,
  enabled boolean,
  category text,
  description text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.action_key::text,
    c.actor_cost,
    c.receiver_reward,
    c.enabled,
    c.category::text,
    c.description::text
  FROM public.aura_xp_interaction_config c
  ORDER BY c.category, c.action_key;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_upsert(
  p_action_key text,
  p_actor_cost integer,
  p_enabled boolean,
  p_category text,
  p_description text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas o admin master pode alterar configs de XP';
  END IF;

  INSERT INTO public.aura_xp_interaction_config (
    action_key, actor_cost, receiver_reward, enabled, category, description, updated_at
  )
  VALUES (
    p_action_key,
    COALESCE(p_actor_cost, 0),
    0,
    COALESCE(p_enabled, true),
    COALESCE(p_category, 'interaction'),
    p_description,
    now()
  )
  ON CONFLICT (action_key) DO UPDATE SET
    actor_cost = EXCLUDED.actor_cost,
    enabled = EXCLUDED.enabled,
    category = COALESCE(EXCLUDED.category, public.aura_xp_interaction_config.category),
    description = COALESCE(EXCLUDED.description, public.aura_xp_interaction_config.description),
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_upsert(text, integer, boolean, text, text)
TO authenticated, service_role;

-- 6) Realtime + refresh schema
ALTER TABLE public.aura_xp_interaction_config REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'aura_xp_interaction_config'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_xp_interaction_config';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
