-- ============================================================
-- 2026_06_03k - FIX REAL do Aura XP + Master Admin + Master Comment
-- Compatível com o schema real já existente no banco externo
-- Idempotente e sem DROP da função _is_master_admin(uuid)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 0) Garantir flag de master em profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_master_admin boolean NOT NULL DEFAULT false;

UPDATE public.profiles
   SET is_master_admin = true
 WHERE lower(coalesce(username, '')) = 'ocultomaster';

-- ============================================================
-- 1) Função helper SEM alterar assinatura/parâmetro dependente
-- ============================================================
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
     WHERE (p.user_id = _uid OR p.id = _uid)
       AND (
         lower(coalesce(p.username, '')) = 'ocultomaster'
         OR coalesce(p.is_master_admin, false) = true
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public._is_master_admin(uuid) TO anon, authenticated, service_role;

-- ============================================================
-- 2) Aura XP - Config global
-- Schema real esperado pelo app: billing_enabled + updated_at
-- multiplier é opcional e só é adicionado para compatibilidade futura
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aura_xp_global_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_enabled boolean NOT NULL DEFAULT true,
  multiplier numeric(10,2) NOT NULL DEFAULT 1.00,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_xp_global_config
  ADD COLUMN IF NOT EXISTS billing_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.aura_xp_global_config
  ADD COLUMN IF NOT EXISTS multiplier numeric(10,2) NOT NULL DEFAULT 1.00;

ALTER TABLE public.aura_xp_global_config
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.aura_xp_global_config (billing_enabled, multiplier)
SELECT true, 1.00
WHERE NOT EXISTS (
  SELECT 1 FROM public.aura_xp_global_config
);

GRANT SELECT ON public.aura_xp_global_config TO anon;
GRANT SELECT, UPDATE ON public.aura_xp_global_config TO authenticated;
GRANT ALL ON public.aura_xp_global_config TO service_role;

ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone can view global config" ON public.aura_xp_global_config;
DROP POLICY IF EXISTS "Admin master can update global config" ON public.aura_xp_global_config;
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

-- ============================================================
-- 3) Aura XP - Configurações individuais
-- Schema real esperado pelo app: action_key / actor_cost / receiver_reward
-- ============================================================
CREATE TABLE IF NOT EXISTS public.aura_xp_interaction_configs (
  action_key text PRIMARY KEY,
  actor_cost integer NOT NULL DEFAULT 50,
  receiver_reward integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  category text NOT NULL DEFAULT 'interaction',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS actor_cost integer NOT NULL DEFAULT 50;

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS receiver_reward integer NOT NULL DEFAULT 0;

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'interaction';

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.aura_xp_interaction_configs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

GRANT SELECT ON public.aura_xp_interaction_configs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_xp_interaction_configs TO authenticated;
GRANT ALL ON public.aura_xp_interaction_configs TO service_role;

ALTER TABLE public.aura_xp_interaction_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read configs" ON public.aura_xp_interaction_configs;
DROP POLICY IF EXISTS "Admin master can manage interaction config" ON public.aura_xp_interaction_configs;
DROP POLICY IF EXISTS aura_xp_configs_read ON public.aura_xp_interaction_configs;
DROP POLICY IF EXISTS aura_xp_configs_master_write ON public.aura_xp_interaction_configs;

CREATE POLICY aura_xp_configs_read
ON public.aura_xp_interaction_configs
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY aura_xp_configs_master_write
ON public.aura_xp_interaction_configs
FOR ALL
TO authenticated
USING (public._is_master_admin(auth.uid()))
WITH CHECK (public._is_master_admin(auth.uid()));

-- ============================================================
-- 4) RPC catálogo admin compatível com a tela /admin/aura-xp-economy
-- ============================================================
CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS TABLE (
  action_key text,
  actor_cost integer,
  receiver_reward integer,
  enabled boolean,
  category text,
  description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH defaults AS (
    SELECT 'menu_feed'::text AS action_key, 50::integer AS actor_cost, 0::integer AS receiver_reward, true AS enabled, 'menu'::text AS category, 'Acesso ao Feed Principal'::text AS description
    UNION ALL SELECT 'menu_pesquisar', 50, 0, true, 'menu', 'Acesso à Busca de Usuários'
    UNION ALL SELECT 'menu_profile', 50, 0, true, 'menu', 'Acesso ao Próprio Perfil'
    UNION ALL SELECT 'menu_radar', 50, 0, true, 'menu', 'Acesso ao Radar de Proximidade'
    UNION ALL SELECT 'menu_canal_vip', 50, 0, true, 'menu', 'Acesso ao Canal VIP'
    UNION ALL SELECT 'menu_aura_match', 50, 0, true, 'menu', 'Acesso ao Aura Match'
    UNION ALL SELECT 'menu_perfect_pair', 50, 0, true, 'menu', 'Acesso ao Par Perfeito'
    UNION ALL SELECT 'menu_postar', 50, 0, true, 'menu', 'Acesso ao Criador de Posts'
    UNION ALL SELECT 'tool_scheduled_posts', 50, 0, true, 'tool', 'Agendamento de Postagens'
    UNION ALL SELECT 'tool_photo_editor', 50, 0, true, 'tool', 'Editor de Imagens Integrado'
    UNION ALL SELECT 'tool_video_filters', 50, 0, true, 'tool', 'Filtros Avançados de Vídeo'
    UNION ALL SELECT 'tool_ghost_mode', 50, 0, true, 'tool', 'Navegação em Modo Invisível'
    UNION ALL SELECT 'tool_profile_analytics', 50, 0, true, 'tool', 'Estatísticas de Engajamento'
    UNION ALL SELECT 'btn_like', 50, 0, true, 'action_button', 'Curtir uma Postagem'
    UNION ALL SELECT 'btn_comment', 50, 0, true, 'action_button', 'Comentar em uma Postagem'
    UNION ALL SELECT 'btn_share', 50, 0, true, 'action_button', 'Compartilhar Postagem'
    UNION ALL SELECT 'btn_gift', 50, 0, true, 'action_button', 'Enviar Presentes'
    UNION ALL SELECT 'btn_save', 50, 0, true, 'action_button', 'Salvar Postagem'
    UNION ALL SELECT 'inter_view_likes', 50, 0, true, 'interaction', 'Ver quem curtiu suas postagens'
    UNION ALL SELECT 'inter_view_visits', 50, 0, true, 'interaction', 'Ver quem visitou seu perfil'
    UNION ALL SELECT 'inter_super_like', 50, 0, true, 'interaction', 'Enviar Super Like'
    UNION ALL SELECT 'inter_boost_profile', 50, 0, true, 'interaction', 'Impulsionar perfil'
  )
  SELECT
    d.action_key,
    COALESCE(c.actor_cost, d.actor_cost) AS actor_cost,
    COALESCE(c.receiver_reward, d.receiver_reward) AS receiver_reward,
    COALESCE(c.enabled, d.enabled) AS enabled,
    COALESCE(c.category, d.category) AS category,
    COALESCE(c.description, d.description) AS description
  FROM defaults d
  LEFT JOIN public.aura_xp_interaction_configs c
    ON c.action_key = d.action_key
  ORDER BY category, action_key;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO anon, authenticated, service_role;

-- ============================================================
-- 5) UPSERT usado pelo painel admin atual
-- ============================================================
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

  INSERT INTO public.aura_xp_interaction_configs (
    action_key,
    actor_cost,
    receiver_reward,
    enabled,
    category,
    description,
    updated_at
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
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_upsert(text, integer, boolean, text, text)
TO authenticated, service_role;

-- ============================================================
-- 6) Comentário master no topo do post
-- ============================================================
CREATE TABLE IF NOT EXISTS public.oculto_post_admin_comments (
  post_id uuid PRIMARY KEY,
  content text NOT NULL,
  bg_color text NOT NULL DEFAULT '#1f1f1f',
  text_color text NOT NULL DEFAULT '#ffffff',
  font_size integer NOT NULL DEFAULT 14,
  font_family text NOT NULL DEFAULT 'sans-serif',
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS content text;

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS bg_color text NOT NULL DEFAULT '#1f1f1f';

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS text_color text NOT NULL DEFAULT '#ffffff';

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS font_size integer NOT NULL DEFAULT 14;

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT 'sans-serif';

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS author_id uuid;

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.oculto_post_admin_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.oculto_post_admin_comments
   SET content = coalesce(content, ''),
       author_id = coalesce(author_id, '00000000-0000-0000-0000-000000000000'::uuid)
 WHERE content IS NULL OR author_id IS NULL;

ALTER TABLE public.oculto_post_admin_comments
  ALTER COLUMN content SET NOT NULL;

ALTER TABLE public.oculto_post_admin_comments
  ALTER COLUMN author_id SET NOT NULL;

GRANT SELECT ON public.oculto_post_admin_comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_post_admin_comments TO authenticated;
GRANT ALL ON public.oculto_post_admin_comments TO service_role;

ALTER TABLE public.oculto_post_admin_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opac_read ON public.oculto_post_admin_comments;
DROP POLICY IF EXISTS opac_master ON public.oculto_post_admin_comments;
DROP POLICY IF EXISTS opac_master_all ON public.oculto_post_admin_comments;

CREATE POLICY opac_read
ON public.oculto_post_admin_comments
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY opac_master_all
ON public.oculto_post_admin_comments
FOR ALL
TO authenticated
USING (public._is_master_admin(auth.uid()))
WITH CHECK (public._is_master_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.oculto_post_admin_comments_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_opac_touch ON public.oculto_post_admin_comments;
CREATE TRIGGER trg_opac_touch
BEFORE UPDATE ON public.oculto_post_admin_comments
FOR EACH ROW
EXECUTE FUNCTION public.oculto_post_admin_comments_touch();

NOTIFY pgrst, 'reload schema';
