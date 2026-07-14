-- ============================================================================
-- OCULTO PLAY — PROMPT 2 (Incremental Cirúrgico)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente. NÃO duplica tabelas já existentes (config, items, comments,
-- reactions, saves, views, reports, challenges, gamification, audit_logs).
-- Apenas adiciona:
--   1) oculto_play_categories (+ seed)
--   2) Colunas faltantes em oculto_play_items: category_id, is_adult,
--      is_sensitive, score, last_activity_at, is_featured, is_vip_teaser
--   3) oculto_today_cards (Hoje no Oculto — cards por usuário)
--   4) oculto_return_hooks (Volte para Ver — ganchos por usuário)
--   5) Índices e RLS de tudo que foi criado/alterado
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) CATEGORIAS DO OCULTO PLAY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_play_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  slug        text NOT NULL UNIQUE,
  description text,
  icon        text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  is_adult    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oculto_play_categories TO authenticated;
GRANT ALL    ON public.oculto_play_categories TO service_role;

ALTER TABLE public.oculto_play_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_play_categories_select_auth" ON public.oculto_play_categories;
CREATE POLICY "oculto_play_categories_select_auth"
  ON public.oculto_play_categories FOR SELECT
  TO authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS "oculto_play_categories_master_write" ON public.oculto_play_categories;
CREATE POLICY "oculto_play_categories_master_write"
  ON public.oculto_play_categories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

INSERT INTO public.oculto_play_categories (name, slug, description, icon, sort_order, is_adult)
VALUES
('Vídeos',                'videos',              'Vídeos curtos e conteúdos rápidos.',                              'play',       1, false),
('Memes',                 'memes',               'Memes, humor e imagens criativas.',                                'smile',      2, false),
('Áudios Autorais',       'audios-autorais',     'Áudios, mensagens e músicas autorais ou autorizadas.',             'music',      3, false),
('Mistérios',             'misterios',           'Curiosidades, teorias e assuntos inexplicáveis.',                  'sparkles',   4, false),
('Relacionamentos',       'relacionamentos',     'Conversas, reflexões e conteúdos sobre conexões.',                'heart',      5, false),
('Comunidades',           'comunidades',         'Conteúdos ligados às Comunidades Ocultas.',                        'users',      6, false),
('Criadores VIP',         'criadores-vip',       'Teasers e conteúdos de criadores.',                                'crown',      7, true),
('Adulto Leve +18',       'adulto-leve-18',      'Conteúdo adulto leve, sensual e permitido no Play.',               'flame',      8, true),
('Notícias e Atualidades','noticias-atualidades','Notícias, fatos e comentários rápidos.',                          'newspaper',  9, false),
('Outros',                'outros',              'Conteúdos diversos.',                                              'circle',    99, false)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) COLUNAS FALTANTES EM oculto_play_items
--    (preserva colunas já existentes: kind, section, visibility, is_seed etc)
-- ---------------------------------------------------------------------------
ALTER TABLE public.oculto_play_items
  ADD COLUMN IF NOT EXISTS category_id      uuid REFERENCES public.oculto_play_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_adult         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sensitive     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_featured      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vip_teaser    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS score            numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_oculto_play_items_category
  ON public.oculto_play_items(category_id);
CREATE INDEX IF NOT EXISTS idx_oculto_play_items_score
  ON public.oculto_play_items(score DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_play_items_last_activity
  ON public.oculto_play_items(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_play_items_featured
  ON public.oculto_play_items(is_featured) WHERE is_featured = true;

-- ---------------------------------------------------------------------------
-- 3) HOJE NO OCULTO — cards diários por usuário (ou globais quando user_id NULL)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_today_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,                              -- NULL = card global
  card_type   text NOT NULL,                     -- 'highlight','challenge','creator','community','tip'
  title       text NOT NULL,
  description text,
  target_type text,                              -- 'play_item','community','vip','post','url'
  target_id   uuid,
  action_url  text,
  priority    integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  expires_at  timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_today_cards_user_active
  ON public.oculto_today_cards(user_id, is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_today_cards_global_active
  ON public.oculto_today_cards(is_active, priority DESC) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_oculto_today_cards_expires
  ON public.oculto_today_cards(expires_at) WHERE expires_at IS NOT NULL;

GRANT SELECT ON public.oculto_today_cards TO authenticated;
GRANT ALL    ON public.oculto_today_cards TO service_role;

ALTER TABLE public.oculto_today_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_today_cards_select_own_or_global" ON public.oculto_today_cards;
CREATE POLICY "oculto_today_cards_select_own_or_global"
  ON public.oculto_today_cards FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (user_id IS NULL OR user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin_master')
  );

DROP POLICY IF EXISTS "oculto_today_cards_master_write" ON public.oculto_today_cards;
CREATE POLICY "oculto_today_cards_master_write"
  ON public.oculto_today_cards FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

-- ---------------------------------------------------------------------------
-- 4) VOLTE PARA VER — ganchos personalizados por usuário
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_return_hooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  hook_type    text NOT NULL,                    -- 'unfinished_video','new_from_creator','community_activity','challenge_ending'
  title        text NOT NULL,
  description  text,
  target_type  text,
  target_id    uuid,
  action_url   text,
  status       text NOT NULL DEFAULT 'pending',
  priority     integer NOT NULL DEFAULT 0,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  seen_at      timestamptz,
  completed_at timestamptz,
  expires_at   timestamptz,
  CONSTRAINT oculto_return_hooks_status_chk
    CHECK (status IN ('pending','seen','completed','dismissed','expired'))
);

CREATE INDEX IF NOT EXISTS idx_oculto_return_hooks_user_status
  ON public.oculto_return_hooks(user_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_return_hooks_expires
  ON public.oculto_return_hooks(expires_at) WHERE expires_at IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.oculto_return_hooks TO authenticated;
GRANT ALL ON public.oculto_return_hooks TO service_role;

ALTER TABLE public.oculto_return_hooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oculto_return_hooks_select_own" ON public.oculto_return_hooks;
CREATE POLICY "oculto_return_hooks_select_own"
  ON public.oculto_return_hooks FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin_master'));

DROP POLICY IF EXISTS "oculto_return_hooks_update_own" ON public.oculto_return_hooks;
CREATE POLICY "oculto_return_hooks_update_own"
  ON public.oculto_return_hooks FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "oculto_return_hooks_master_write" ON public.oculto_return_hooks;
CREATE POLICY "oculto_return_hooks_master_write"
  ON public.oculto_return_hooks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin_master'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_master'));

-- ---------------------------------------------------------------------------
-- 5) TRIGGERS updated_at (categorias)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._touch_oculto_play_categories()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_oculto_play_categories ON public.oculto_play_categories;
CREATE TRIGGER trg_touch_oculto_play_categories
  BEFORE UPDATE ON public.oculto_play_categories
  FOR EACH ROW EXECUTE FUNCTION public._touch_oculto_play_categories();

-- ---------------------------------------------------------------------------
-- 6) TRIGGER last_activity_at em oculto_play_items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._touch_oculto_play_items_activity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (
       NEW.view_count   IS DISTINCT FROM OLD.view_count
    OR NEW.like_count   IS DISTINCT FROM OLD.like_count
    OR NEW.save_count   IS DISTINCT FROM OLD.save_count
    OR NEW.share_count  IS DISTINCT FROM OLD.share_count
  ) THEN
    NEW.last_activity_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_oculto_play_items_activity ON public.oculto_play_items;
CREATE TRIGGER trg_touch_oculto_play_items_activity
  BEFORE UPDATE ON public.oculto_play_items
  FOR EACH ROW EXECUTE FUNCTION public._touch_oculto_play_items_activity();

-- ---------------------------------------------------------------------------
-- FIM
-- ---------------------------------------------------------------------------
