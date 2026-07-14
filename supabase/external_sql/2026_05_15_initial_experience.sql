-- ============================================================
-- INITIAL EXPERIENCE — Simplificação da experiência inicial
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. NÃO remove nem altera nada do que já existe.
-- ============================================================

-- 1) Tabela de configuração (master admin edita)
CREATE TABLE IF NOT EXISTS public.oculto_initial_experience_config (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('tip','cta','toggle')),
  title text NOT NULL,
  body text,
  cta_label text,
  cta_route text,
  icon text,
  hue integer NOT NULL DEFAULT 280,
  min_level text NOT NULL DEFAULT 'new' CHECK (min_level IN ('new','engaged','premium','vip')),
  max_level text CHECK (max_level IN ('new','engaged','premium','vip')),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_initial_experience_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "iec_read_all" ON public.oculto_initial_experience_config;
CREATE POLICY "iec_read_all" ON public.oculto_initial_experience_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "iec_master_write" ON public.oculto_initial_experience_config;
CREATE POLICY "iec_master_write" ON public.oculto_initial_experience_config
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

-- 2) Seed inicial (idempotente via ON CONFLICT)
INSERT INTO public.oculto_initial_experience_config
  (id, kind, title, body, cta_label, cta_route, icon, hue, min_level, max_level, sort_order)
VALUES
  ('tip_room_now',    'tip', 'Entre em uma sala agora', 'Salas ativas com pessoas reais.',         'Ver salas',    '/aura-rooms',  'users',    280, 'new',     NULL,      10),
  ('tip_who_online',  'tip', 'Veja quem está online',   'Pessoas conectadas perto de você.',       'Ver radar',    '/radar',       'radar',    200, 'new',     NULL,      20),
  ('tip_aura_match',  'tip', 'Sua aura chamou atenção', 'Descubra conexões com afinidade.',         'Aura Match',   '/aura-match',  'sparkles', 320, 'new',     NULL,      30),
  ('tip_referral',    'tip', 'Ganhe indicando amigos',  'Comissão recorrente por cada Premium/VIP.','Ver programa', '/affiliates',  'gift',     45,  'new',     NULL,      40),
  ('tip_vip_visible', 'tip', 'Usuários VIP aparecem mais','Destaque maior, reach 5x.',              'Ver planos',   '/subscriptions','crown',   42,  'engaged', 'premium', 50),
  ('cta_earn_referral','cta','Ganhe Indicando',         'Comissão de 5% recorrente em cada amigo Premium ou VIP.','Começar a ganhar','/affiliates','banknote', 45, 'new', NULL, 100)
ON CONFLICT (id) DO NOTHING;

-- 3) RPC: pega o nível de engajamento do usuário (sem expor PII)
--    Regras:
--    - vip      → plan_type='vip'
--    - premium  → plan_type IN ('premium','monthly')
--    - engaged  → tem >= 1 post OU created_at <= now() - 7 dias
--    - new      → caso contrário
CREATE OR REPLACE FUNCTION public.user_engagement_level_get(p_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_plan text;
  v_created timestamptz;
  v_posts int;
BEGIN
  IF v_uid IS NULL THEN RETURN 'new'; END IF;

  SELECT plan_type, created_at INTO v_plan, v_created
  FROM public.profiles
  WHERE user_id = v_uid OR id = v_uid
  LIMIT 1;

  IF v_plan = 'vip' THEN RETURN 'vip'; END IF;
  IF v_plan IN ('premium','monthly') THEN RETURN 'premium'; END IF;

  SELECT COUNT(*) INTO v_posts FROM public.posts WHERE author_id = v_uid;
  IF v_posts >= 1 OR v_created <= now() - interval '7 days' THEN
    RETURN 'engaged';
  END IF;

  RETURN 'new';
END $$;

GRANT EXECUTE ON FUNCTION public.user_engagement_level_get(uuid) TO authenticated, anon;

-- 4) RPC: items visíveis para o usuário atual (filtra por nível)
CREATE OR REPLACE FUNCTION public.initial_experience_items()
RETURNS TABLE (
  id text, kind text, title text, body text,
  cta_label text, cta_route text, icon text, hue integer, sort_order integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lvl text := public.user_engagement_level_get(NULL);
DECLARE v_rank int := CASE v_lvl WHEN 'new' THEN 0 WHEN 'engaged' THEN 1 WHEN 'premium' THEN 2 WHEN 'vip' THEN 3 ELSE 0 END;
BEGIN
  RETURN QUERY
  SELECT c.id, c.kind, c.title, c.body, c.cta_label, c.cta_route, c.icon, c.hue, c.sort_order
  FROM public.oculto_initial_experience_config c
  WHERE c.active = true
    AND (CASE c.min_level WHEN 'new' THEN 0 WHEN 'engaged' THEN 1 WHEN 'premium' THEN 2 WHEN 'vip' THEN 3 END) <= v_rank
    AND (c.max_level IS NULL OR
         (CASE c.max_level WHEN 'new' THEN 0 WHEN 'engaged' THEN 1 WHEN 'premium' THEN 2 WHEN 'vip' THEN 3 END) >= v_rank)
  ORDER BY c.sort_order ASC, c.id ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.initial_experience_items() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
