-- =====================================================================
-- 2026-06-03i — Hotfix _is_master_admin + Pin Global + Comentário Master
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ── 1) _is_master_admin: DROP antes de recriar (parâmetro renomeado) ─
DROP FUNCTION IF EXISTS public._is_master_admin(uuid);

CREATE OR REPLACE FUNCTION public._is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE (p.user_id = _user_id OR p.id = _user_id)
      AND (
        lower(coalesce(p.username, '')) = 'ocultomaster'
        OR coalesce(p.is_master_admin, false) = true
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public._is_master_admin(uuid) TO anon, authenticated, service_role;

-- ── 2) aura_xp_global_config ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aura_xp_global_config (
  id            int PRIMARY KEY DEFAULT 1,
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aura_xp_global_singleton CHECK (id = 1)
);
INSERT INTO public.aura_xp_global_config (id, config)
VALUES (1, '{"enabled":true,"default_actor_cost":0,"default_receiver_reward":0}'::jsonb)
ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.aura_xp_global_config TO anon, authenticated;
GRANT ALL    ON public.aura_xp_global_config TO service_role;
ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aura_xp_global_read"  ON public.aura_xp_global_config;
DROP POLICY IF EXISTS "aura_xp_global_write" ON public.aura_xp_global_config;
CREATE POLICY "aura_xp_global_read"  ON public.aura_xp_global_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "aura_xp_global_write" ON public.aura_xp_global_config FOR ALL TO authenticated
  USING (public._is_master_admin(auth.uid())) WITH CHECK (public._is_master_admin(auth.uid()));

-- ── 3) aura_xp_interaction_configs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.aura_xp_interaction_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key      text NOT NULL UNIQUE,
  category         text NOT NULL,
  label            text NOT NULL,
  description      text,
  actor_cost       int  NOT NULL DEFAULT 0,
  receiver_reward  int  NOT NULL DEFAULT 0,
  enabled          boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aura_xp_interaction_configs TO anon, authenticated;
GRANT ALL    ON public.aura_xp_interaction_configs TO service_role;
ALTER TABLE public.aura_xp_interaction_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aura_xp_cfg_read"  ON public.aura_xp_interaction_configs;
DROP POLICY IF EXISTS "aura_xp_cfg_write" ON public.aura_xp_interaction_configs;
CREATE POLICY "aura_xp_cfg_read"  ON public.aura_xp_interaction_configs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "aura_xp_cfg_write" ON public.aura_xp_interaction_configs FOR ALL TO authenticated
  USING (public._is_master_admin(auth.uid())) WITH CHECK (public._is_master_admin(auth.uid()));

-- ── 4) aura_xp_admin_features_list() ─────────────────────────────────
DROP FUNCTION IF EXISTS public.aura_xp_admin_features_list();
CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS TABLE (feature_key text, category text, label text, description text,
               actor_cost int, receiver_reward int, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH defaults(feature_key, category, label, description, actor_cost, receiver_reward) AS (VALUES
    ('menu_feed','Menus','Feed Social','Acesso ao feed principal',0,0),
    ('menu_radar','Menus','Radar','Acesso ao radar abstrato',0,0),
    ('menu_aura_match','Menus','Aura Match','Acesso ao Aura Match',0,0),
    ('menu_chat','Menus','Chat','Acesso à central de mensagens',0,0),
    ('menu_eventos','Menus','Eventos VIP','Acesso à agenda de eventos',0,0),
    ('menu_marketplace','Menus','Marketplace','Acesso ao marketplace',0,0),
    ('tool_photo_editor','Ferramentas','Editor de Fotos','Editor com blur/stickers/marca dágua',0,0),
    ('tool_ghost_mode','Ferramentas','Modo Fantasma','Navegação anônima Premium/VIP',5,0),
    ('tool_safety_checkin','Ferramentas','Encontro Seguro','Alerta WhatsApp em encontros',0,0),
    ('tool_translator','Ferramentas','Tradutor de Chat','Tradução automática de mensagens',1,0),
    ('act_super_like','Botões de Ação','Super Like','Curtida destacada com prioridade',10,5),
    ('act_gift_xp','Botões de Ação','Presente XP','Envio de presente em XP',0,0),
    ('act_approach','Botões de Ação','Aproximar','Iniciar match no carrossel',2,1),
    ('act_unlock_chat','Botões de Ação','Desbloquear Chat','Abrir conversa privada',15,5),
    ('act_priority_msg','Botões de Ação','Mensagem Prioritária','Destacar DM no topo do inbox',20,10),
    ('act_boost_post','Botões de Ação','Impulsionar Post','Aumentar alcance de uma publicação',25,0),
    ('int_like','Interações','Curtir','Like simples em post',0,1),
    ('int_dislike','Interações','Descurtir','Dislike em post',0,0),
    ('int_comment','Interações','Comentar','Comentário em post',0,2),
    ('int_share','Interações','Compartilhar','Compartilhamento de post',0,3),
    ('int_follow','Interações','Seguir','Seguir um perfil',0,2),
    ('int_save_post','Interações','Salvar Post','Salvar publicação',0,1)
  )
  SELECT d.feature_key, d.category,
         coalesce(c.label, d.label), coalesce(c.description, d.description),
         coalesce(c.actor_cost, d.actor_cost), coalesce(c.receiver_reward, d.receiver_reward),
         coalesce(c.enabled, true)
  FROM defaults d
  LEFT JOIN public.aura_xp_interaction_configs c ON c.feature_key = d.feature_key
  ORDER BY CASE d.category WHEN 'Menus' THEN 1 WHEN 'Ferramentas' THEN 2
                           WHEN 'Botões de Ação' THEN 3 WHEN 'Interações' THEN 4 ELSE 5 END, d.label;
$$;
GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO anon, authenticated, service_role;

-- ── 5) aura_xp_interaction_config_upsert ─────────────────────────────
DROP FUNCTION IF EXISTS public.aura_xp_interaction_config_upsert(text,text,text,text,int,int,boolean);
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_upsert(
  _feature_key text, _category text, _label text, _description text,
  _actor_cost int, _receiver_reward int, _enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: master admin only';
  END IF;
  INSERT INTO public.aura_xp_interaction_configs
    (feature_key, category, label, description, actor_cost, receiver_reward, enabled, updated_at)
  VALUES (_feature_key,_category,_label,_description,_actor_cost,_receiver_reward,_enabled, now())
  ON CONFLICT (feature_key) DO UPDATE SET
    category=EXCLUDED.category, label=EXCLUDED.label, description=EXCLUDED.description,
    actor_cost=EXCLUDED.actor_cost, receiver_reward=EXCLUDED.receiver_reward,
    enabled=EXCLUDED.enabled, updated_at=now();
END; $$;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_upsert(text,text,text,text,int,int,boolean)
  TO authenticated, service_role;

-- ── 6) NOVO: Comentário Master no topo da postagem ───────────────────
CREATE TABLE IF NOT EXISTS public.oculto_post_admin_comments (
  post_id      uuid PRIMARY KEY,
  content      text NOT NULL,
  bg_color     text NOT NULL DEFAULT '#1f1f1f',
  text_color   text NOT NULL DEFAULT '#ffffff',
  font_size    int  NOT NULL DEFAULT 14,
  font_family  text NOT NULL DEFAULT 'sans-serif',
  author_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_post_admin_comments TO anon, authenticated;
GRANT ALL    ON public.oculto_post_admin_comments TO service_role;

ALTER TABLE public.oculto_post_admin_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opac_read"   ON public.oculto_post_admin_comments;
DROP POLICY IF EXISTS "opac_master" ON public.oculto_post_admin_comments;

CREATE POLICY "opac_read" ON public.oculto_post_admin_comments
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "opac_master" ON public.oculto_post_admin_comments
  FOR ALL TO authenticated
  USING (public._is_master_admin(auth.uid()))
  WITH CHECK (public._is_master_admin(auth.uid()));

-- Atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.oculto_post_admin_comments_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_opac_touch ON public.oculto_post_admin_comments;
CREATE TRIGGER trg_opac_touch BEFORE UPDATE ON public.oculto_post_admin_comments
  FOR EACH ROW EXECUTE FUNCTION public.oculto_post_admin_comments_touch();

-- ── 7) Reload do PostgREST ───────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
