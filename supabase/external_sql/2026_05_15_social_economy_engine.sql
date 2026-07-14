-- =====================================================================
-- PRIORIDADE 5 — ECONOMIA SOCIAL PREMIUM (catálogo + ativação roteada)
-- Reaproveita motores existentes:
--   - magnetic_activate            → Energia Magnética
--   - vip_social_pass (tier)       → Pass VIP Social
--   - hidden_connections           → Conexões Ocultas (boost diário)
--   - oculto_rooms / aura_rooms    → Destaque em Salas / Salas Raras
--   - feed_vivo_events             → Destaque no Feed Vivo
--   - real_experiences             → Experiência VIP
--   - matchmaking priority         → Entrada Prioritária
--
-- Anti-abuso:  cooldown + daily_limit + min_plan + active flag.
-- LGPD-safe :  só registra usuario / produto / origem / valor.
-- ASAAS     :  callback chama social_economy_activate(p_purchase_id).
-- =====================================================================

-- 1) Catálogo de produtos sociais ----------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_social_economy_products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  name            text NOT NULL,
  description     text,
  icon            text DEFAULT '✨',
  kind            text NOT NULL CHECK (kind IN (
    'energia_magnetica','pass_vip_social','conexoes_ocultas',
    'entrada_prioritaria','destaque_salas','destaque_feed_vivo',
    'salas_raras','experiencia_vip'
  )),
  price_cents     int NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_minutes int NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 60*24*30),
  cooldown_minutes int NOT NULL DEFAULT 60 CHECK (cooldown_minutes >= 0),
  daily_limit     int NOT NULL DEFAULT 3 CHECK (daily_limit BETWEEN 1 AND 50),
  min_plan        text NOT NULL DEFAULT 'free' CHECK (min_plan IN ('free','premium','vip')),
  multiplier      numeric(3,2) NOT NULL DEFAULT 1.50 CHECK (multiplier BETWEEN 1.0 AND 5.0),
  tier            text,                       -- usado por pass_vip_social
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  active          boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_social_economy_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_economy_products read all" ON public.oculto_social_economy_products;
CREATE POLICY "social_economy_products read all" ON public.oculto_social_economy_products
  FOR SELECT TO authenticated USING (active = true);

-- 2) Compras ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_social_economy_purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  product_id      uuid NOT NULL REFERENCES public.oculto_social_economy_products(id) ON DELETE RESTRICT,
  product_slug    text NOT NULL,
  amount_cents    int  NOT NULL,
  asaas_payment_id text,                                   -- idempotência
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','activated','refunded','failed','cancelled')),
  activated_at    timestamptz,
  expires_at      timestamptz,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_se_purch_user      ON public.oculto_social_economy_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_purch_product   ON public.oculto_social_economy_purchases (product_slug, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_se_purch_asaas
  ON public.oculto_social_economy_purchases (asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

ALTER TABLE public.oculto_social_economy_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "se_purch read self" ON public.oculto_social_economy_purchases;
CREATE POLICY "se_purch read self" ON public.oculto_social_economy_purchases
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 3) Helper master --------------------------------------------------------
CREATE OR REPLACE FUNCTION public._is_master_admin_now()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  BEGIN SELECT public.has_role(auth.uid(),'master_admin') INTO v;
  EXCEPTION WHEN OTHERS THEN
    BEGIN SELECT COALESCE(is_master,false) INTO v FROM public.profiles WHERE id=auth.uid();
    EXCEPTION WHEN OTHERS THEN v := false; END;
  END;
  RETURN COALESCE(v,false);
END$$;
GRANT EXECUTE ON FUNCTION public._is_master_admin_now() TO authenticated;

-- 4) Listar catálogo ativo -----------------------------------------------
CREATE OR REPLACE FUNCTION public.social_economy_list()
RETURNS TABLE(
  id uuid, slug text, name text, description text, icon text, kind text,
  price_cents int, duration_minutes int, cooldown_minutes int, daily_limit int,
  min_plan text, multiplier numeric, tier text, payload jsonb, sort_order int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, slug, name, description, icon, kind,
         price_cents, duration_minutes, cooldown_minutes, daily_limit,
         min_plan, multiplier, tier, payload, sort_order
    FROM public.oculto_social_economy_products
   WHERE active = true
   ORDER BY sort_order ASC, name ASC;
$$;
GRANT EXECUTE ON FUNCTION public.social_economy_list() TO authenticated;

-- 5) Verifica se pode comprar (anti-abuso) -------------------------------
CREATE OR REPLACE FUNCTION public.social_economy_can_purchase(p_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_p       public.oculto_social_economy_products;
  v_plan    text := 'free';
  v_today   int  := 0;
  v_last    timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','no_user'); END IF;
  SELECT * INTO v_p FROM public.oculto_social_economy_products WHERE slug = p_slug AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;

  BEGIN SELECT COALESCE(plan_type,'free') INTO v_plan FROM public.profiles WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN v_plan := 'free'; END;

  IF v_p.min_plan = 'vip' AND v_plan <> 'vip' THEN
    RETURN jsonb_build_object('ok',false,'reason','plan_required','min_plan','vip');
  END IF;
  IF v_p.min_plan = 'premium' AND v_plan = 'free' THEN
    RETURN jsonb_build_object('ok',false,'reason','plan_required','min_plan','premium');
  END IF;

  SELECT count(*), max(created_at) INTO v_today, v_last
    FROM public.oculto_social_economy_purchases
   WHERE user_id = v_uid AND product_slug = p_slug
     AND status IN ('paid','activated')
     AND created_at > now() - interval '24 hours';

  IF v_today >= v_p.daily_limit THEN
    RETURN jsonb_build_object('ok',false,'reason','daily_limit','limit',v_p.daily_limit);
  END IF;
  IF v_last IS NOT NULL AND v_last > now() - make_interval(mins => v_p.cooldown_minutes) THEN
    RETURN jsonb_build_object('ok',false,'reason','cooldown',
      'next_at', v_last + make_interval(mins => v_p.cooldown_minutes));
  END IF;

  RETURN jsonb_build_object('ok',true,'price_cents',v_p.price_cents,'product_id',v_p.id);
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_can_purchase(text) TO authenticated;

-- 6) Cria pedido pendente (para ASAAS) -----------------------------------
CREATE OR REPLACE FUNCTION public.social_economy_purchase_create(
  p_slug text, p_asaas_payment_id text DEFAULT NULL, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_can jsonb;
  v_p   public.oculto_social_economy_products;
  v_id  uuid;
BEGIN
  v_can := public.social_economy_can_purchase(p_slug);
  IF NOT COALESCE((v_can->>'ok')::boolean,false) THEN RETURN v_can; END IF;
  SELECT * INTO v_p FROM public.oculto_social_economy_products WHERE slug = p_slug;
  INSERT INTO public.oculto_social_economy_purchases(
    user_id, product_id, product_slug, amount_cents, asaas_payment_id, meta
  ) VALUES (auth.uid(), v_p.id, v_p.slug, v_p.price_cents, p_asaas_payment_id, COALESCE(p_meta,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'purchase_id',v_id,'product_slug',v_p.slug,'amount_cents',v_p.price_cents);
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_purchase_create(text,text,jsonb) TO authenticated;

-- 7) Ativação roteada (chamada pelo webhook ASAAS / admin) --------------
CREATE OR REPLACE FUNCTION public.social_economy_activate(p_purchase_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pur record;
  v_p   public.oculto_social_economy_products;
  v_end timestamptz;
BEGIN
  SELECT * INTO v_pur FROM public.oculto_social_economy_purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','not_found'); END IF;
  IF v_pur.status = 'activated' THEN
    RETURN jsonb_build_object('ok',true,'already_activated',true,'expires_at',v_pur.expires_at);
  END IF;

  SELECT * INTO v_p FROM public.oculto_social_economy_products WHERE id = v_pur.product_id;
  v_end := now() + make_interval(mins => v_p.duration_minutes);

  -- roteamento por kind
  IF v_p.kind = 'energia_magnetica' THEN
    INSERT INTO public.oculto_magnetic_boosts(user_id, ends_at, multiplier, source)
    VALUES (v_pur.user_id, v_end, v_p.multiplier, 'social_economy:'||v_p.slug);

  ELSIF v_p.kind = 'pass_vip_social' THEN
    INSERT INTO public.oculto_vip_social_pass(user_id, tier, ends_at, perks)
    VALUES (v_pur.user_id, COALESCE(v_p.tier,'standard'), v_end, COALESCE(v_p.payload,'{}'::jsonb))
    ON CONFLICT (user_id) DO UPDATE
      SET tier     = EXCLUDED.tier,
          ends_at  = GREATEST(public.oculto_vip_social_pass.ends_at, EXCLUDED.ends_at),
          perks    = EXCLUDED.perks;

  ELSE
    -- destaque_salas / destaque_feed_vivo / salas_raras / entrada_prioritaria /
    -- conexoes_ocultas / experiencia_vip → registramos só ativação (motor consome via meta)
    NULL;
  END IF;

  UPDATE public.oculto_social_economy_purchases
     SET status='activated', activated_at=now(), expires_at=v_end, updated_at=now()
   WHERE id = p_purchase_id;

  RETURN jsonb_build_object('ok',true,'kind',v_p.kind,'expires_at',v_end);
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_activate(uuid) TO authenticated;

-- 8) Marca como pago (para webhook ASAAS) -------------------------------
CREATE OR REPLACE FUNCTION public.social_economy_mark_paid(p_asaas_payment_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.oculto_social_economy_purchases
     SET status='paid', updated_at=now()
   WHERE asaas_payment_id = p_asaas_payment_id AND status = 'pending'
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','not_found_or_not_pending'); END IF;
  RETURN public.social_economy_activate(v_id);
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_mark_paid(text) TO authenticated;

-- 9) Admin: upsert / toggle / métricas ----------------------------------
CREATE OR REPLACE FUNCTION public.social_economy_admin_upsert(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_master_admin_now() THEN RAISE EXCEPTION 'forbidden: master only'; END IF;
  INSERT INTO public.oculto_social_economy_products (
    id, slug, name, description, icon, kind, price_cents, duration_minutes,
    cooldown_minutes, daily_limit, min_plan, multiplier, tier, payload, active, sort_order, updated_at
  ) VALUES (
    COALESCE((p->>'id')::uuid, gen_random_uuid()),
    p->>'slug', p->>'name', p->>'description',
    COALESCE(p->>'icon','✨'), p->>'kind',
    COALESCE((p->>'price_cents')::int, 0),
    COALESCE((p->>'duration_minutes')::int, 30),
    COALESCE((p->>'cooldown_minutes')::int, 60),
    COALESCE((p->>'daily_limit')::int, 3),
    COALESCE(p->>'min_plan','free'),
    COALESCE((p->>'multiplier')::numeric, 1.5),
    p->>'tier',
    COALESCE(p->'payload','{}'::jsonb),
    COALESCE((p->>'active')::boolean, true),
    COALESCE((p->>'sort_order')::int, 0),
    now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
    kind = EXCLUDED.kind, price_cents = EXCLUDED.price_cents,
    duration_minutes = EXCLUDED.duration_minutes, cooldown_minutes = EXCLUDED.cooldown_minutes,
    daily_limit = EXCLUDED.daily_limit, min_plan = EXCLUDED.min_plan,
    multiplier = EXCLUDED.multiplier, tier = EXCLUDED.tier, payload = EXCLUDED.payload,
    active = EXCLUDED.active, sort_order = EXCLUDED.sort_order, updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'id',v_id);
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_admin_upsert(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_economy_admin_toggle(p_slug text, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin_now() THEN RAISE EXCEPTION 'forbidden: master only'; END IF;
  UPDATE public.oculto_social_economy_products SET active = p_active, updated_at = now() WHERE slug = p_slug;
  RETURN jsonb_build_object('ok',true);
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_admin_toggle(text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.social_economy_admin_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin_now() THEN RAISE EXCEPTION 'forbidden: master only'; END IF;
  RETURN jsonb_build_object(
    'purchases_24h',   (SELECT count(*) FROM public.oculto_social_economy_purchases WHERE created_at > now()-interval '24 hours'),
    'paid_24h',        (SELECT count(*) FROM public.oculto_social_economy_purchases WHERE status IN ('paid','activated') AND created_at > now()-interval '24 hours'),
    'revenue_cents_24h',(SELECT COALESCE(sum(amount_cents),0) FROM public.oculto_social_economy_purchases WHERE status IN ('paid','activated') AND created_at > now()-interval '24 hours'),
    'by_product_7d',   (SELECT COALESCE(jsonb_object_agg(product_slug, c),'{}'::jsonb)
                        FROM (SELECT product_slug, count(*) c
                                FROM public.oculto_social_economy_purchases
                               WHERE status IN ('paid','activated')
                                 AND created_at > now()-interval '7 days'
                               GROUP BY product_slug) x)
  );
END$$;
GRANT EXECUTE ON FUNCTION public.social_economy_admin_metrics() TO authenticated;

-- 10) Catálogo inicial (8 produtos) -------------------------------------
INSERT INTO public.oculto_social_economy_products
  (slug, name, description, icon, kind, price_cents, duration_minutes, cooldown_minutes, daily_limit, min_plan, multiplier, tier, sort_order)
VALUES
  ('energia_magnetica_30', 'Energia Magnética 30min', 'Boost discreto: aumenta sua presença e descoberta por 30 min.', '🧲', 'energia_magnetica', 990, 30, 60, 3, 'free', 1.5, NULL, 10),
  ('energia_magnetica_60', 'Energia Magnética 60min', 'Boost prolongado de presença e descoberta por 1h.', '🧲', 'energia_magnetica', 1790, 60, 90, 2, 'premium', 1.8, NULL, 20),
  ('pass_vip_social_24h',  'Pass VIP Social — 24h',   'Entrada antecipada em salas, prioridade no Feed Vivo, eventos premium.', '👑', 'pass_vip_social', 2490, 60*24, 0, 1, 'premium', 1.0, 'standard', 30),
  ('pass_vip_social_7d',   'Pass VIP Social — 7 dias','Tudo do Pass por 7 dias: salas raras + destaque + eventos VIP.',     '👑', 'pass_vip_social', 9990, 60*24*7, 0, 1, 'vip', 1.0, 'plus', 40),
  ('conexoes_ocultas_x3',  'Conexões Ocultas +3',     'Revela 3 conexões raras adicionais hoje.',                            '🔮', 'conexoes_ocultas', 1490, 60*24, 0, 2, 'premium', 1.0, NULL, 50),
  ('entrada_prioritaria',  'Entrada Prioritária',     'Sua próxima descoberta entra na fila VIP.',                           '⚡', 'entrada_prioritaria', 690, 30, 30, 5, 'free', 1.0, NULL, 60),
  ('destaque_salas_60',    'Destaque em Salas 60min', 'Aparece em destaque nas salas que entrar por 1h.',                    '🌟', 'destaque_salas', 1290, 60, 60, 3, 'premium', 1.0, NULL, 70),
  ('destaque_feed_vivo',   'Destaque no Feed Vivo',   'Sua atividade ganha destaque no Feed Vivo por 30 min.',               '📡', 'destaque_feed_vivo', 990, 30, 60, 3, 'premium', 1.0, NULL, 80)
ON CONFLICT (slug) DO NOTHING;
