-- ============================================================
-- REFERRAL PROGRAM EXPANSION — Ganhe Indicando v2
-- 100% idempotente. Não altera/remove nada existente.
-- Reusa: referral_commissions, referral_affiliates, profiles, posts
-- ============================================================

-- 1) NÍVEIS DE AFILIADO
CREATE TABLE IF NOT EXISTS public.oculto_affiliate_levels (
  id text PRIMARY KEY,
  name text NOT NULL,
  min_referrals integer NOT NULL DEFAULT 0,
  min_revenue numeric(10,2) NOT NULL DEFAULT 0,
  perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  badge_hue integer NOT NULL DEFAULT 280,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_affiliate_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "afl_read_all" ON public.oculto_affiliate_levels;
CREATE POLICY "afl_read_all" ON public.oculto_affiliate_levels FOR SELECT USING (true);
DROP POLICY IF EXISTS "afl_master_write" ON public.oculto_affiliate_levels;
CREATE POLICY "afl_master_write" ON public.oculto_affiliate_levels
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

INSERT INTO public.oculto_affiliate_levels (id, name, min_referrals, min_revenue, perks, badge_hue, sort_order) VALUES
  ('explorador',   'Explorador',   0,  0,    '["Link de indicação","Comissão padrão 5%"]'::jsonb,                                       200, 10),
  ('conector',     'Conector',     5,  100,  '["Badge Conector","Destaque no perfil"]'::jsonb,                                          280, 20),
  ('influente',    'Influente',    20, 500,  '["Badge Influente","Bônus em campanhas","Prioridade em saque"]'::jsonb,                   320, 30),
  ('dominante',    'Dominante',    50, 1500, '["Badge Dominante","Suporte VIP","Acesso antecipado a recursos"]'::jsonb,                 45,  40),
  ('elite_social', 'Elite Social', 150, 5000,'["Badge Elite","Comissão estendida em campanhas","Convite para programa Madrinhas"]'::jsonb, 0, 50)
ON CONFLICT (id) DO NOTHING;

-- 2) CAMPANHAS (cards rotativos no feed)
CREATE TABLE IF NOT EXISTS public.oculto_affiliate_campaigns (
  id text PRIMARY KEY,
  title text NOT NULL,
  body text,
  cta_label text NOT NULL DEFAULT 'Ver programa',
  cta_route text NOT NULL DEFAULT '/affiliates',
  hue integer NOT NULL DEFAULT 45,
  min_level text NOT NULL DEFAULT 'explorador',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_affiliate_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "afc_read_all" ON public.oculto_affiliate_campaigns;
CREATE POLICY "afc_read_all" ON public.oculto_affiliate_campaigns FOR SELECT USING (true);
DROP POLICY IF EXISTS "afc_master_write" ON public.oculto_affiliate_campaigns;
CREATE POLICY "afc_master_write" ON public.oculto_affiliate_campaigns
  FOR ALL USING (public.is_admin_master()) WITH CHECK (public.is_admin_master());

INSERT INTO public.oculto_affiliate_campaigns (id, title, body, cta_label, cta_route, hue, min_level, sort_order) VALUES
  ('camp_invite',    'Convide amigos e ganhe recompensas',     'Comissão recorrente em cada Premium ou VIP que você indicar.', 'Ver meu link',     '/affiliates', 45,  'explorador', 10),
  ('camp_premium',   'Usuários Premium geram mais ganhos',     'Quanto mais Premiums você trouxer, maior seu nível e bônus.',  'Ganhar mais',      '/affiliates', 280, 'explorador', 20),
  ('camp_vip',       'Indique criadores VIP e ganhe extra',    'Comissão também na ativação de monetização do criador.',       'Como funciona',    '/affiliates', 0,   'conector',   30),
  ('camp_content',   'Ganhe quando seu indicado compra',       'Comissão em compras de mídia, PPV e canal VIP do indicado.',   'Ver detalhes',     '/affiliates', 320, 'conector',   40),
  ('camp_ranking',   'Top afiliados do mês',                   'Ative o ranking público e concorra a destaque.',               'Ativar ranking',   '/affiliates', 200, 'influente',  50)
ON CONFLICT (id) DO NOTHING;

-- 3) OPT-IN RANKING (LGPD) — adiciona coluna apenas se profiles for tabela
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='profiles' AND table_type='BASE TABLE'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='affiliate_ranking_opt_in'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ADD COLUMN affiliate_ranking_opt_in boolean NOT NULL DEFAULT false';
  END IF;
END $$;

-- Recarrega cache do PostgREST para reconhecer a coluna nova antes da view
NOTIFY pgrst, 'reload schema';

-- 4) VIEW: estatísticas do afiliado (sem PII de terceiros)
DROP VIEW IF EXISTS public.vw_affiliate_user_stats CASCADE;
CREATE VIEW public.vw_affiliate_user_stats
WITH (security_invoker = true) AS
SELECT
  p.id AS profile_id,
  p.user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.affiliate_ranking_opt_in,
  COALESCE((SELECT COUNT(DISTINCT rl.referred_user_id)
            FROM public.referral_ledger rl
            WHERE rl.affiliate_id = p.user_id), 0)::int AS total_referrals,
  COALESCE((SELECT SUM(rl.commission_amount)
            FROM public.referral_ledger rl
            WHERE rl.affiliate_id = p.user_id
              AND rl.status IN ('confirmed','paid')), 0)::numeric(10,2) AS total_revenue,
  COALESCE((SELECT SUM(rl.commission_amount)
            FROM public.referral_ledger rl
            WHERE rl.affiliate_id = p.user_id
              AND rl.status = 'pending'), 0)::numeric(10,2) AS pending_revenue
FROM public.profiles p;

-- 5) RPC: nível do afiliado (resolvido server-side)
CREATE OR REPLACE FUNCTION public.affiliate_level_get(p_user_id uuid DEFAULT NULL)
RETURNS TABLE (
  level_id text, level_name text, badge_hue integer,
  total_referrals int, total_revenue numeric,
  next_level_id text, next_level_name text,
  next_min_referrals int, next_min_revenue numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_refs int := 0;
  v_rev numeric := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 'explorador'::text, 'Explorador'::text, 200, 0, 0::numeric, NULL::text, NULL::text, NULL::int, NULL::numeric;
    RETURN;
  END IF;

  SELECT s.total_referrals, s.total_revenue INTO v_refs, v_rev
  FROM public.vw_affiliate_user_stats s
  WHERE s.user_id = v_uid LIMIT 1;

  v_refs := COALESCE(v_refs, 0);
  v_rev  := COALESCE(v_rev, 0);

  RETURN QUERY
  WITH ranked AS (
    SELECT l.*, ROW_NUMBER() OVER (ORDER BY l.sort_order DESC) rn
    FROM public.oculto_affiliate_levels l
    WHERE l.active = true
      AND v_refs >= l.min_referrals
      AND v_rev  >= l.min_revenue
  ),
  current_l AS (SELECT * FROM ranked WHERE rn = 1),
  next_l AS (
    SELECT l.* FROM public.oculto_affiliate_levels l, current_l c
    WHERE l.active = true AND l.sort_order > c.sort_order
    ORDER BY l.sort_order ASC LIMIT 1
  )
  SELECT
    COALESCE((SELECT id FROM current_l), 'explorador'),
    COALESCE((SELECT name FROM current_l), 'Explorador'),
    COALESCE((SELECT badge_hue FROM current_l), 200),
    v_refs, v_rev,
    (SELECT id FROM next_l),
    (SELECT name FROM next_l),
    (SELECT min_referrals FROM next_l),
    (SELECT min_revenue FROM next_l);
END $$;

GRANT EXECUTE ON FUNCTION public.affiliate_level_get(uuid) TO authenticated, anon;

-- 6) RPC: campanhas ativas filtradas por nível do usuário
CREATE OR REPLACE FUNCTION public.affiliate_campaigns_active()
RETURNS TABLE (
  id text, title text, body text,
  cta_label text, cta_route text, hue integer, sort_order integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lvl text; v_rank int;
BEGIN
  SELECT (al.level_id) INTO v_lvl FROM public.affiliate_level_get(NULL) al LIMIT 1;
  v_lvl := COALESCE(v_lvl, 'explorador');
  SELECT sort_order INTO v_rank FROM public.oculto_affiliate_levels WHERE id = v_lvl LIMIT 1;
  v_rank := COALESCE(v_rank, 0);

  RETURN QUERY
  SELECT c.id, c.title, c.body, c.cta_label, c.cta_route, c.hue, c.sort_order
  FROM public.oculto_affiliate_campaigns c
  LEFT JOIN public.oculto_affiliate_levels l ON l.id = c.min_level
  WHERE c.active = true
    AND COALESCE(l.sort_order, 0) <= v_rank
  ORDER BY c.sort_order ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.affiliate_campaigns_active() TO authenticated, anon;

-- 7) RPC: ranking público (apenas opt-in)
CREATE OR REPLACE FUNCTION public.affiliate_top_ranking(p_limit int DEFAULT 20)
RETURNS TABLE (
  rank int, user_id uuid, username text, display_name text, avatar_url text,
  total_referrals int, total_revenue numeric, level_id text, badge_hue integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT s.user_id, s.username, s.display_name, s.avatar_url,
           s.total_referrals, s.total_revenue
    FROM public.vw_affiliate_user_stats s
    WHERE s.affiliate_ranking_opt_in = true
      AND s.total_referrals > 0
    ORDER BY s.total_revenue DESC, s.total_referrals DESC
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT (ROW_NUMBER() OVER ())::int AS rank,
         b.user_id, b.username, b.display_name, b.avatar_url,
         b.total_referrals, b.total_revenue,
         (SELECT al.level_id FROM public.affiliate_level_get(b.user_id) al LIMIT 1),
         (SELECT al.badge_hue FROM public.affiliate_level_get(b.user_id) al LIMIT 1)
  FROM base b;
END $$;

GRANT EXECUTE ON FUNCTION public.affiliate_top_ranking(int) TO authenticated, anon;

-- 8) RPC: toggle opt-in ranking (LGPD)
CREATE OR REPLACE FUNCTION public.affiliate_ranking_optin_set(p_value boolean)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET affiliate_ranking_opt_in = COALESCE(p_value, false) WHERE user_id = v_uid;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.affiliate_ranking_optin_set(boolean) TO authenticated;
