-- =====================================================================
-- 2026_06_05 — COMUNIDADES OCULTAS — ETAPA 1 (BASE + BANCO)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================
-- Auditoria: NÃO existe sistema de community/forum/topics no projeto.
-- Reaproveitamento: profiles, auth.uid, public.is_admin(uuid),
--                   sistema de storage existente (bucket separado).
-- Isolamento: prefixo oculto_community_* (mem rule).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CATEGORIAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 2. COMUNIDADES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  cover_url TEXT,
  avatar_url TEXT,
  category_id UUID REFERENCES public.oculto_community_categories(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',
  is_adult BOOLEAN NOT NULL DEFAULT FALSE,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  allow_topics BOOLEAN NOT NULL DEFAULT TRUE,
  allow_images BOOLEAN NOT NULL DEFAULT TRUE,
  allow_videos BOOLEAN NOT NULL DEFAULT FALSE,
  allow_audio BOOLEAN NOT NULL DEFAULT FALSE,
  require_post_approval BOOLEAN NOT NULL DEFAULT FALSE,
  require_join_approval BOOLEAN NOT NULL DEFAULT FALSE,
  members_count INTEGER NOT NULL DEFAULT 0,
  topics_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  rules TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oculto_communities_visibility_chk
    CHECK (visibility IN ('public','private','premium_only','vip_only','creator_exclusive')),
  CONSTRAINT oculto_communities_status_chk
    CHECK (status IN ('active','pending_review','paused','banned','archived'))
);

-- ---------------------------------------------------------------------
-- 3. MEMBROS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  banned_at TIMESTAMPTZ,
  ban_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (community_id, user_id),
  CONSTRAINT oculto_community_members_role_chk
    CHECK (role IN ('owner','moderator','member')),
  CONSTRAINT oculto_community_members_status_chk
    CHECK (status IN ('pending','active','muted','banned','left'))
);

-- ---------------------------------------------------------------------
-- 4. TÓPICOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_adult BOOLEAN NOT NULL DEFAULT FALSE,
  media_count INTEGER NOT NULL DEFAULT 0,
  replies_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ,
  last_reply_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oculto_community_topics_status_chk
    CHECK (status IN ('draft','pending_review','published','hidden','removed','locked'))
);

-- ---------------------------------------------------------------------
-- 5. RESPOSTAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.oculto_community_topics(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  parent_reply_id UUID REFERENCES public.oculto_community_replies(id) ON DELETE SET NULL,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  media_count INTEGER NOT NULL DEFAULT 0,
  reactions_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oculto_community_replies_status_chk
    CHECK (status IN ('pending_review','published','hidden','removed'))
);

-- ---------------------------------------------------------------------
-- 6. MÍDIAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.oculto_community_topics(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES public.oculto_community_replies(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL,
  media_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  thumbnail_url TEXT,
  size_bytes BIGINT,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oculto_community_media_type_chk
    CHECK (media_type IN ('image','video','audio')),
  CONSTRAINT oculto_community_media_status_chk
    CHECK (status IN ('active','hidden','removed'))
);

-- ---------------------------------------------------------------------
-- 7. REAÇÕES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.oculto_community_topics(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES public.oculto_community_replies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  reaction TEXT NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oculto_community_reaction_target_chk
    CHECK (
      (topic_id IS NOT NULL AND reply_id IS NULL)
      OR (topic_id IS NULL AND reply_id IS NOT NULL)
    )
);

-- ---------------------------------------------------------------------
-- 8. DENÚNCIAS (isoladas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.oculto_communities(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES public.oculto_community_topics(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES public.oculto_community_replies(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT oculto_community_reports_status_chk
    CHECK (status IN ('pending','reviewing','resolved','dismissed'))
);

-- ---------------------------------------------------------------------
-- 9. CONFIGURAÇÕES ADMIN MASTER
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  feature_name TEXT NOT NULL DEFAULT 'Comunidades Ocultas',
  allow_free_join BOOLEAN NOT NULL DEFAULT TRUE,
  allow_free_create BOOLEAN NOT NULL DEFAULT FALSE,
  allow_premium_create BOOLEAN NOT NULL DEFAULT TRUE,
  allow_vip_create BOOLEAN NOT NULL DEFAULT TRUE,
  premium_max_communities INTEGER NOT NULL DEFAULT 5,
  vip_max_communities INTEGER NOT NULL DEFAULT 5,
  require_admin_approval_for_new_communities BOOLEAN NOT NULL DEFAULT FALSE,
  allow_private_communities BOOLEAN NOT NULL DEFAULT TRUE,
  allow_premium_only_communities BOOLEAN NOT NULL DEFAULT TRUE,
  allow_vip_only_communities BOOLEAN NOT NULL DEFAULT TRUE,
  allow_creator_exclusive_communities BOOLEAN NOT NULL DEFAULT TRUE,
  allow_images BOOLEAN NOT NULL DEFAULT TRUE,
  allow_videos BOOLEAN NOT NULL DEFAULT FALSE,
  allow_audio BOOLEAN NOT NULL DEFAULT FALSE,
  max_image_size_mb INTEGER NOT NULL DEFAULT 5,
  max_video_size_mb INTEGER NOT NULL DEFAULT 50,
  max_audio_size_mb INTEGER NOT NULL DEFAULT 20,
  max_topics_per_day INTEGER NOT NULL DEFAULT 10,
  max_replies_per_day INTEGER NOT NULL DEFAULT 50,
  show_featured_on_home BOOLEAN NOT NULL DEFAULT TRUE,
  show_hot_topics_on_feed BOOLEAN NOT NULL DEFAULT TRUE,
  moderation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  banned_words TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- 10. AUDIT LOGS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_community_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES public.oculto_communities(id) ON DELETE SET NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  old_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- ÍNDICES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_oculto_communities_owner       ON public.oculto_communities(owner_id);
CREATE INDEX IF NOT EXISTS idx_oculto_communities_status      ON public.oculto_communities(status);
CREATE INDEX IF NOT EXISTS idx_oculto_communities_visibility  ON public.oculto_communities(visibility);
CREATE INDEX IF NOT EXISTS idx_oculto_communities_category    ON public.oculto_communities(category_id);
CREATE INDEX IF NOT EXISTS idx_oculto_communities_featured    ON public.oculto_communities(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_oculto_community_members_community ON public.oculto_community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_oculto_community_members_user      ON public.oculto_community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_oculto_community_topics_community_created ON public.oculto_community_topics(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_community_topics_activity        ON public.oculto_community_topics(last_reply_at DESC NULLS LAST, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_community_replies_topic_created  ON public.oculto_community_replies(topic_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_oculto_community_media_topic            ON public.oculto_community_media(topic_id);
CREATE INDEX IF NOT EXISTS idx_oculto_community_reports_status         ON public.oculto_community_reports(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_oculto_community_reactions_unique_topic
  ON public.oculto_community_reactions(user_id, topic_id, reaction) WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_oculto_community_reactions_unique_reply
  ON public.oculto_community_reactions(user_id, reply_id, reaction) WHERE reply_id IS NOT NULL;

-- =====================================================================
-- GRANTS
-- =====================================================================
GRANT SELECT ON public.oculto_community_categories TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_communities         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_members   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_topics    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_replies   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_media     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_community_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.oculto_community_reports   TO authenticated;
GRANT SELECT                         ON public.oculto_community_settings  TO authenticated;
GRANT SELECT                         ON public.oculto_community_audit_logs TO authenticated;
GRANT ALL ON public.oculto_community_categories,
            public.oculto_communities,
            public.oculto_community_members,
            public.oculto_community_topics,
            public.oculto_community_replies,
            public.oculto_community_media,
            public.oculto_community_reactions,
            public.oculto_community_reports,
            public.oculto_community_settings,
            public.oculto_community_audit_logs TO service_role;

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.oculto_community_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_communities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_topics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_media      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oculto_community_audit_logs ENABLE ROW LEVEL SECURITY;

-- Helpers SECURITY DEFINER (evita recursão em RLS)
CREATE OR REPLACE FUNCTION public.oculto_is_community_member(_community UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_community_members
    WHERE community_id = _community AND user_id = _user AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.oculto_community_user_role(_community UUID, _user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.oculto_community_members
  WHERE community_id = _community AND user_id = _user AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.oculto_is_master() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.is_admin(auth.uid()), FALSE);
$$;

-- ---- categories
DROP POLICY IF EXISTS occ_categories_read ON public.oculto_community_categories;
CREATE POLICY occ_categories_read ON public.oculto_community_categories FOR SELECT USING (is_active OR oculto_is_master());
DROP POLICY IF EXISTS occ_categories_admin ON public.oculto_community_categories;
CREATE POLICY occ_categories_admin ON public.oculto_community_categories FOR ALL USING (oculto_is_master()) WITH CHECK (oculto_is_master());

-- ---- communities
DROP POLICY IF EXISTS occ_communities_read ON public.oculto_communities;
CREATE POLICY occ_communities_read ON public.oculto_communities FOR SELECT USING (
  oculto_is_master()
  OR owner_id = auth.uid()
  OR (status = 'active' AND visibility IN ('public','premium_only','vip_only','creator_exclusive'))
  OR (visibility = 'private' AND oculto_is_community_member(id, auth.uid()))
);
DROP POLICY IF EXISTS occ_communities_insert ON public.oculto_communities;
CREATE POLICY occ_communities_insert ON public.oculto_communities FOR INSERT WITH CHECK (
  owner_id = auth.uid() AND auth.uid() IS NOT NULL
);
DROP POLICY IF EXISTS occ_communities_update ON public.oculto_communities;
CREATE POLICY occ_communities_update ON public.oculto_communities FOR UPDATE USING (
  owner_id = auth.uid() OR oculto_is_master()
) WITH CHECK (owner_id = auth.uid() OR oculto_is_master());
DROP POLICY IF EXISTS occ_communities_delete ON public.oculto_communities;
CREATE POLICY occ_communities_delete ON public.oculto_communities FOR DELETE USING (
  owner_id = auth.uid() OR oculto_is_master()
);

-- ---- members
DROP POLICY IF EXISTS occ_members_read ON public.oculto_community_members;
CREATE POLICY occ_members_read ON public.oculto_community_members FOR SELECT USING (
  user_id = auth.uid()
  OR oculto_is_master()
  OR oculto_is_community_member(community_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);
DROP POLICY IF EXISTS occ_members_insert ON public.oculto_community_members;
CREATE POLICY occ_members_insert ON public.oculto_community_members FOR INSERT WITH CHECK (
  user_id = auth.uid() OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);
DROP POLICY IF EXISTS occ_members_update ON public.oculto_community_members;
CREATE POLICY occ_members_update ON public.oculto_community_members FOR UPDATE USING (
  user_id = auth.uid()
  OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
  OR oculto_community_user_role(community_id, auth.uid()) = 'moderator'
);
DROP POLICY IF EXISTS occ_members_delete ON public.oculto_community_members;
CREATE POLICY occ_members_delete ON public.oculto_community_members FOR DELETE USING (
  user_id = auth.uid() OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);

-- ---- topics
DROP POLICY IF EXISTS occ_topics_read ON public.oculto_community_topics;
CREATE POLICY occ_topics_read ON public.oculto_community_topics FOR SELECT USING (
  oculto_is_master()
  OR author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.oculto_communities c
    WHERE c.id = community_id
      AND (
        (c.visibility = 'public' AND c.status = 'active' AND status = 'published')
        OR oculto_is_community_member(c.id, auth.uid())
        OR c.owner_id = auth.uid()
      )
  )
);
DROP POLICY IF EXISTS occ_topics_insert ON public.oculto_community_topics;
CREATE POLICY occ_topics_insert ON public.oculto_community_topics FOR INSERT WITH CHECK (
  author_id = auth.uid() AND oculto_is_community_member(community_id, auth.uid())
);
DROP POLICY IF EXISTS occ_topics_update ON public.oculto_community_topics;
CREATE POLICY occ_topics_update ON public.oculto_community_topics FOR UPDATE USING (
  author_id = auth.uid()
  OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
  OR oculto_community_user_role(community_id, auth.uid()) = 'moderator'
);
DROP POLICY IF EXISTS occ_topics_delete ON public.oculto_community_topics;
CREATE POLICY occ_topics_delete ON public.oculto_community_topics FOR DELETE USING (
  author_id = auth.uid() OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);

-- ---- replies
DROP POLICY IF EXISTS occ_replies_read ON public.oculto_community_replies;
CREATE POLICY occ_replies_read ON public.oculto_community_replies FOR SELECT USING (
  oculto_is_master()
  OR author_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.oculto_communities c
    WHERE c.id = community_id
      AND (
        (c.visibility = 'public' AND status = 'published')
        OR oculto_is_community_member(c.id, auth.uid())
        OR c.owner_id = auth.uid()
      )
  )
);
DROP POLICY IF EXISTS occ_replies_insert ON public.oculto_community_replies;
CREATE POLICY occ_replies_insert ON public.oculto_community_replies FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND oculto_is_community_member(community_id, auth.uid())
  AND NOT EXISTS (SELECT 1 FROM public.oculto_community_topics t WHERE t.id = topic_id AND t.is_locked)
);
DROP POLICY IF EXISTS occ_replies_update ON public.oculto_community_replies;
CREATE POLICY occ_replies_update ON public.oculto_community_replies FOR UPDATE USING (
  author_id = auth.uid()
  OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
  OR oculto_community_user_role(community_id, auth.uid()) = 'moderator'
);
DROP POLICY IF EXISTS occ_replies_delete ON public.oculto_community_replies;
CREATE POLICY occ_replies_delete ON public.oculto_community_replies FOR DELETE USING (
  author_id = auth.uid() OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);

-- ---- media
DROP POLICY IF EXISTS occ_media_read ON public.oculto_community_media;
CREATE POLICY occ_media_read ON public.oculto_community_media FOR SELECT USING (
  oculto_is_master()
  OR uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.oculto_communities c
    WHERE c.id = community_id
      AND (
        (c.visibility = 'public' AND status = 'active')
        OR oculto_is_community_member(c.id, auth.uid())
        OR c.owner_id = auth.uid()
      )
  )
);
DROP POLICY IF EXISTS occ_media_insert ON public.oculto_community_media;
CREATE POLICY occ_media_insert ON public.oculto_community_media FOR INSERT WITH CHECK (
  uploaded_by = auth.uid() AND oculto_is_community_member(community_id, auth.uid())
);
DROP POLICY IF EXISTS occ_media_modify ON public.oculto_community_media;
CREATE POLICY occ_media_modify ON public.oculto_community_media FOR UPDATE USING (
  uploaded_by = auth.uid() OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);
DROP POLICY IF EXISTS occ_media_delete ON public.oculto_community_media;
CREATE POLICY occ_media_delete ON public.oculto_community_media FOR DELETE USING (
  uploaded_by = auth.uid() OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);

-- ---- reactions
DROP POLICY IF EXISTS occ_reactions_read ON public.oculto_community_reactions;
CREATE POLICY occ_reactions_read ON public.oculto_community_reactions FOR SELECT USING (
  oculto_is_master()
  OR EXISTS (
    SELECT 1 FROM public.oculto_communities c
    WHERE c.id = community_id
      AND (c.visibility = 'public' OR oculto_is_community_member(c.id, auth.uid()) OR c.owner_id = auth.uid())
  )
);
DROP POLICY IF EXISTS occ_reactions_insert ON public.oculto_community_reactions;
CREATE POLICY occ_reactions_insert ON public.oculto_community_reactions FOR INSERT WITH CHECK (
  user_id = auth.uid() AND oculto_is_community_member(community_id, auth.uid())
);
DROP POLICY IF EXISTS occ_reactions_delete ON public.oculto_community_reactions;
CREATE POLICY occ_reactions_delete ON public.oculto_community_reactions FOR DELETE USING (
  user_id = auth.uid() OR oculto_is_master()
);

-- ---- reports
DROP POLICY IF EXISTS occ_reports_insert ON public.oculto_community_reports;
CREATE POLICY occ_reports_insert ON public.oculto_community_reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
DROP POLICY IF EXISTS occ_reports_read ON public.oculto_community_reports;
CREATE POLICY occ_reports_read ON public.oculto_community_reports FOR SELECT USING (
  reporter_id = auth.uid()
  OR oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
  OR (community_id IS NOT NULL AND oculto_community_user_role(community_id, auth.uid()) = 'moderator')
);
DROP POLICY IF EXISTS occ_reports_update ON public.oculto_community_reports;
CREATE POLICY occ_reports_update ON public.oculto_community_reports FOR UPDATE USING (
  oculto_is_master()
  OR EXISTS (SELECT 1 FROM public.oculto_communities c WHERE c.id = community_id AND c.owner_id = auth.uid())
);

-- ---- settings
DROP POLICY IF EXISTS occ_settings_read ON public.oculto_community_settings;
CREATE POLICY occ_settings_read ON public.oculto_community_settings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS occ_settings_admin ON public.oculto_community_settings;
CREATE POLICY occ_settings_admin ON public.oculto_community_settings FOR ALL USING (oculto_is_master()) WITH CHECK (oculto_is_master());

-- ---- audit_logs
DROP POLICY IF EXISTS occ_audit_read ON public.oculto_community_audit_logs;
CREATE POLICY occ_audit_read ON public.oculto_community_audit_logs FOR SELECT USING (oculto_is_master());

-- =====================================================================
-- RPCs / FUNÇÕES
-- =====================================================================

-- Pode criar comunidade?
CREATE OR REPLACE FUNCTION public.community_can_create(_user UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
  v_settings RECORD;
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'feature_disabled');
  END IF;
  SELECT COALESCE(plan_type, 'free') INTO v_plan FROM public.profiles WHERE id = _user;
  IF v_plan = 'vip' THEN v_limit := v_settings.vip_max_communities;
  ELSIF v_plan IN ('premium','monthly') THEN
    IF NOT v_settings.allow_premium_create THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_allowed');
    END IF;
    v_limit := v_settings.premium_max_communities;
  ELSE
    IF NOT v_settings.allow_free_create THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'plan_not_allowed');
    END IF;
    v_limit := 1;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.oculto_communities
   WHERE owner_id = _user AND status IN ('active','pending_review');
  IF v_count >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'limit_reached', 'limit', v_limit, 'current', v_count);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'limit', v_limit, 'current', v_count);
END;
$$;

-- Criar comunidade
CREATE OR REPLACE FUNCTION public.community_create(
  _title TEXT, _slug TEXT, _description TEXT, _category_id UUID,
  _visibility TEXT DEFAULT 'public', _is_adult BOOLEAN DEFAULT FALSE,
  _cover_url TEXT DEFAULT NULL, _avatar_url TEXT DEFAULT NULL,
  _rules TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_can JSONB; v_id UUID; v_status TEXT := 'active'; v_settings RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  v_can := public.community_can_create(auth.uid());
  IF NOT (v_can->>'allowed')::BOOLEAN THEN
    RAISE EXCEPTION 'cannot_create: %', v_can->>'reason';
  END IF;
  SELECT * INTO v_settings FROM public.oculto_community_settings LIMIT 1;
  IF v_settings.require_admin_approval_for_new_communities THEN
    v_status := 'pending_review';
  END IF;
  INSERT INTO public.oculto_communities(
    owner_id, title, slug, description, category_id, visibility, status,
    is_adult, cover_url, avatar_url, rules, last_activity_at
  ) VALUES (
    auth.uid(), _title, _slug, _description, _category_id, _visibility, v_status,
    _is_adult, _cover_url, _avatar_url, _rules, NOW()
  ) RETURNING id INTO v_id;
  INSERT INTO public.oculto_community_members(community_id, user_id, role, status, joined_at)
  VALUES (v_id, auth.uid(), 'owner', 'active', NOW());
  RETURN v_id;
END;
$$;

-- Entrar
CREATE OR REPLACE FUNCTION public.community_join(_community UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c RECORD; v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT * INTO v_c FROM public.oculto_communities WHERE id = _community AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'community_not_found'; END IF;
  v_status := CASE WHEN v_c.require_join_approval OR v_c.visibility = 'private' THEN 'pending' ELSE 'active' END;
  INSERT INTO public.oculto_community_members(community_id, user_id, role, status, joined_at)
  VALUES (_community, auth.uid(), 'member', v_status, NOW())
  ON CONFLICT (community_id, user_id) DO UPDATE SET status = EXCLUDED.status;
  RETURN v_status;
END;
$$;

-- Sair
CREATE OR REPLACE FUNCTION public.community_leave(_community UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.oculto_communities WHERE id = _community AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'owner_cannot_leave';
  END IF;
  UPDATE public.oculto_community_members SET status = 'left'
  WHERE community_id = _community AND user_id = auth.uid();
END;
$$;

-- Toggle reação
CREATE OR REPLACE FUNCTION public.community_toggle_reaction(
  _community UUID, _topic UUID, _reply UUID, _reaction TEXT DEFAULT 'like'
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exists UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT id INTO v_exists FROM public.oculto_community_reactions
   WHERE user_id = auth.uid() AND reaction = _reaction
     AND ((_topic IS NOT NULL AND topic_id = _topic) OR (_reply IS NOT NULL AND reply_id = _reply))
   LIMIT 1;
  IF v_exists IS NOT NULL THEN
    DELETE FROM public.oculto_community_reactions WHERE id = v_exists;
    RETURN FALSE;
  END IF;
  INSERT INTO public.oculto_community_reactions(community_id, topic_id, reply_id, user_id, reaction)
  VALUES (_community, _topic, _reply, auth.uid(), _reaction);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_can_create(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_create(TEXT,TEXT,TEXT,UUID,TEXT,BOOLEAN,TEXT,TEXT,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_join(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_leave(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.community_toggle_reaction(UUID,UUID,UUID,TEXT) TO authenticated;

-- =====================================================================
-- TRIGGERS DE CONTADORES
-- =====================================================================
CREATE OR REPLACE FUNCTION public.oculto_community_members_count_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE public.oculto_communities SET members_count = members_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE public.oculto_communities SET members_count = GREATEST(members_count - 1, 0) WHERE id = OLD.community_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'active' AND OLD.status <> 'active' THEN
      UPDATE public.oculto_communities SET members_count = members_count + 1 WHERE id = NEW.community_id;
    ELSIF OLD.status = 'active' AND NEW.status <> 'active' THEN
      UPDATE public.oculto_communities SET members_count = GREATEST(members_count - 1, 0) WHERE id = NEW.community_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_occ_members_count ON public.oculto_community_members;
CREATE TRIGGER trg_occ_members_count AFTER INSERT OR UPDATE OR DELETE ON public.oculto_community_members
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_members_count_trg();

CREATE OR REPLACE FUNCTION public.oculto_community_topics_count_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_communities SET topics_count = topics_count + 1, last_activity_at = NOW() WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.oculto_communities SET topics_count = GREATEST(topics_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_occ_topics_count ON public.oculto_community_topics;
CREATE TRIGGER trg_occ_topics_count AFTER INSERT OR DELETE ON public.oculto_community_topics
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_topics_count_trg();

CREATE OR REPLACE FUNCTION public.oculto_community_replies_count_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.oculto_community_topics
       SET replies_count = replies_count + 1, last_reply_at = NOW(), last_reply_by = NEW.author_id
     WHERE id = NEW.topic_id;
    UPDATE public.oculto_communities
       SET replies_count = replies_count + 1, last_activity_at = NOW()
     WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.oculto_community_topics SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.topic_id;
    UPDATE public.oculto_communities SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_occ_replies_count ON public.oculto_community_replies;
CREATE TRIGGER trg_occ_replies_count AFTER INSERT OR DELETE ON public.oculto_community_replies
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_replies_count_trg();

CREATE OR REPLACE FUNCTION public.oculto_community_reactions_count_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_id IS NOT NULL THEN
      UPDATE public.oculto_community_topics SET reactions_count = reactions_count + 1 WHERE id = NEW.topic_id;
    ELSIF NEW.reply_id IS NOT NULL THEN
      UPDATE public.oculto_community_replies SET reactions_count = reactions_count + 1 WHERE id = NEW.reply_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.topic_id IS NOT NULL THEN
      UPDATE public.oculto_community_topics SET reactions_count = GREATEST(reactions_count - 1, 0) WHERE id = OLD.topic_id;
    ELSIF OLD.reply_id IS NOT NULL THEN
      UPDATE public.oculto_community_replies SET reactions_count = GREATEST(reactions_count - 1, 0) WHERE id = OLD.reply_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_occ_reactions_count ON public.oculto_community_reactions;
CREATE TRIGGER trg_occ_reactions_count AFTER INSERT OR DELETE ON public.oculto_community_reactions
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_reactions_count_trg();

CREATE OR REPLACE FUNCTION public.oculto_community_media_count_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.topic_id IS NOT NULL THEN
      UPDATE public.oculto_community_topics SET media_count = media_count + 1 WHERE id = NEW.topic_id;
    ELSIF NEW.reply_id IS NOT NULL THEN
      UPDATE public.oculto_community_replies SET media_count = media_count + 1 WHERE id = NEW.reply_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.topic_id IS NOT NULL THEN
      UPDATE public.oculto_community_topics SET media_count = GREATEST(media_count - 1, 0) WHERE id = OLD.topic_id;
    ELSIF OLD.reply_id IS NOT NULL THEN
      UPDATE public.oculto_community_replies SET media_count = GREATEST(media_count - 1, 0) WHERE id = OLD.reply_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_occ_media_count ON public.oculto_community_media;
CREATE TRIGGER trg_occ_media_count AFTER INSERT OR DELETE ON public.oculto_community_media
FOR EACH ROW EXECUTE FUNCTION public.oculto_community_media_count_trg();

-- =====================================================================
-- SEEDS
-- =====================================================================
INSERT INTO public.oculto_community_categories (name, slug, description, icon, sort_order) VALUES
('Mistérios','misterios','Teorias, curiosidades, fenômenos e assuntos inexplicáveis.','sparkles',1),
('Relacionamentos','relacionamentos','Conversas sobre conexões, encontros e vida afetiva.','heart',2),
('Adulto +18','adulto-18','Temas adultos permitidos pela plataforma.','flame',3),
('Cinema e Séries','cinema-series','Filmes, séries, terror, suspense e cultura pop.','film',4),
('Música','musica','Músicas, artistas, playlists e descobertas sonoras.','music',5),
('Viagens','viagens','Lugares, experiências, roteiros e aventuras.','map',6),
('Tecnologia','tecnologia','Apps, IA, inovação e cultura digital.','cpu',7),
('Humor','humor','Memes, piadas e conversas leves.','smile',8),
('Vida Real','vida-real','Dia a dia, notícias, pensamentos e experiências pessoais.','message-circle',9),
('Criadores VIP','criadores-vip','Comunidades de criadores e fãs.','crown',10),
('Outros','outros','Assuntos diversos.','circle',99)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.oculto_community_settings (enabled)
SELECT TRUE WHERE NOT EXISTS (SELECT 1 FROM public.oculto_community_settings);

NOTIFY pgrst, 'reload schema';
