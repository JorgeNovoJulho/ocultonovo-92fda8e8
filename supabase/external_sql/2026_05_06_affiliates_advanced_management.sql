-- ============================================================
-- Sistema avançado de afiliados (NÃO-DESTRUTIVO)
-- Estende creator_referrals (Madrinhas) sem duplicar estruturas.
--
-- Acrescenta:
--   • Status detalhado (active|frozen|blocked|removed)
--   • Datas de freeze/block + motivo + notas admin
--   • Limite global configurável (platform_settings)
--   • RPC: check_creator_affiliate_limit, admin_set_affiliate_status,
--          admin_award_affiliate_reward, get_creator_affiliate_ranking
--   • Tabela affiliate_rewards (recompensas manuais por marco)
--
-- Idempotente. Pode rodar várias vezes.
-- ============================================================

-- 0. Garante tabela creator_referrals (Madrinhas) ------------
CREATE TABLE IF NOT EXISTS public.creator_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  madrinha_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  afilhada_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  total_commission_earned NUMERIC(10,2) DEFAULT 0,
  last_commission_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '365 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (madrinha_id, afilhada_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_referrals_madrinha ON public.creator_referrals(madrinha_id);
CREATE INDEX IF NOT EXISTS idx_creator_referrals_afilhada ON public.creator_referrals(afilhada_id);
ALTER TABLE public.creator_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_referrals_owner_read" ON public.creator_referrals;
CREATE POLICY "creator_referrals_owner_read"
  ON public.creator_referrals FOR SELECT TO authenticated
  USING (
    madrinha_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR afilhada_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('admin','admin_master'))
  );

-- 1. Status enum + colunas em creator_referrals --------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'affiliate_status') THEN
    CREATE TYPE public.affiliate_status AS ENUM ('active','frozen','blocked','removed');
  END IF;
END $$;

ALTER TABLE public.creator_referrals
  ADD COLUMN IF NOT EXISTS status public.affiliate_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS frozen_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_creator_referrals_status
  ON public.creator_referrals (madrinha_id, status);

-- Garante coerência de is_active com status
CREATE OR REPLACE FUNCTION public.sync_referral_active_with_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('blocked','removed') THEN
    NEW.is_active := FALSE;
  ELSIF NEW.status = 'frozen' AND NEW.frozen_until IS NOT NULL AND NEW.frozen_until > now() THEN
    NEW.is_active := FALSE;
  ELSIF NEW.status = 'active' THEN
    NEW.is_active := TRUE;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_referral_active ON public.creator_referrals;
CREATE TRIGGER trg_sync_referral_active
  BEFORE INSERT OR UPDATE OF status, frozen_until ON public.creator_referrals
  FOR EACH ROW EXECUTE FUNCTION public.sync_referral_active_with_status();

-- 2. platform_settings (chave/valor JSONB) -------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings_read_all" ON public.platform_settings;
CREATE POLICY "platform_settings_read_all"
  ON public.platform_settings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "platform_settings_admin_write" ON public.platform_settings;
CREATE POLICY "platform_settings_admin_write"
  ON public.platform_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role IN ('admin','admin_master')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid()
                        AND ur.role IN ('admin','admin_master')));

-- Valor default do limite global
INSERT INTO public.platform_settings (key, value, description)
VALUES ('max_affiliates_per_creator', '50'::jsonb,
        'Limite máximo de afiliados ativos por criador (override por plano via creator_pricing)')
ON CONFLICT (key) DO NOTHING;

-- 3. Recompensas manuais -------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  madrinha_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL,
  milestone TEXT,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_rewards_mad
  ON public.affiliate_rewards (madrinha_id, created_at DESC);

ALTER TABLE public.affiliate_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rewards_owner_or_admin_read" ON public.affiliate_rewards;
CREATE POLICY "rewards_owner_or_admin_read"
  ON public.affiliate_rewards FOR SELECT TO authenticated
  USING (
    madrinha_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('admin','admin_master'))
  );

DROP POLICY IF EXISTS "rewards_admin_write" ON public.affiliate_rewards;
CREATE POLICY "rewards_admin_write"
  ON public.affiliate_rewards FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = auth.uid()
                        AND ur.role IN ('admin','admin_master')));

-- 4. RPC: limite de afiliados por criador --------------------
CREATE OR REPLACE FUNCTION public.check_creator_affiliate_limit(
  p_madrinha_id UUID
)
RETURNS TABLE (
  current_count INTEGER,
  max_allowed INTEGER,
  can_add_more BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INTEGER;
  v_max INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.creator_referrals
  WHERE madrinha_id = p_madrinha_id
    AND status = 'active';

  SELECT (value)::text::int INTO v_max
  FROM public.platform_settings WHERE key = 'max_affiliates_per_creator';
  v_max := COALESCE(v_max, 50);

  RETURN QUERY SELECT v_count, v_max, (v_count < v_max);
END $$;

-- 5. RPC: ações administrativas (status) ---------------------
CREATE OR REPLACE FUNCTION public.admin_set_affiliate_status(
  p_referral_id UUID,
  p_status public.affiliate_status,
  p_reason TEXT DEFAULT NULL,
  p_frozen_days INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.creator_referrals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.creator_referrals;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role IN ('admin','admin_master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.creator_referrals SET
    status = p_status,
    blocked_reason = CASE WHEN p_status = 'blocked' THEN p_reason ELSE blocked_reason END,
    blocked_at     = CASE WHEN p_status = 'blocked' THEN now()    ELSE blocked_at END,
    removed_at     = CASE WHEN p_status = 'removed' THEN now()    ELSE removed_at END,
    frozen_until   = CASE WHEN p_status = 'frozen' AND p_frozen_days IS NOT NULL
                          THEN now() + (p_frozen_days || ' days')::interval
                          WHEN p_status = 'active' THEN NULL
                          ELSE frozen_until END,
    admin_notes    = COALESCE(p_notes, admin_notes),
    updated_at     = now()
  WHERE id = p_referral_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'referral_not_found';
  END IF;

  RETURN v_row;
END $$;

-- 6. RPC: conceder recompensa manual -------------------------
CREATE OR REPLACE FUNCTION public.admin_award_affiliate_reward(
  p_madrinha_id UUID,
  p_amount NUMERIC,
  p_reason TEXT,
  p_milestone TEXT DEFAULT NULL
)
RETURNS public.affiliate_rewards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.affiliate_rewards;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = auth.uid()
                   AND ur.role IN ('admin','admin_master')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.affiliate_rewards (madrinha_id, amount, reason, milestone, granted_by)
  VALUES (p_madrinha_id, p_amount, p_reason, p_milestone, auth.uid())
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

-- 7. RPC: ranking de afiliados (para dashboard admin/criador)-
CREATE OR REPLACE FUNCTION public.get_creator_affiliate_ranking(
  p_madrinha_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  referral_id UUID,
  madrinha_id UUID,
  afilhada_id UUID,
  afilhada_name TEXT,
  afilhada_username TEXT,
  afilhada_avatar TEXT,
  status public.affiliate_status,
  total_commission_earned NUMERIC,
  last_commission_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cr.id,
    cr.madrinha_id,
    cr.afilhada_id,
    p.name,
    p.username,
    p.avatar_url,
    cr.status,
    cr.total_commission_earned,
    cr.last_commission_at,
    cr.started_at
  FROM public.creator_referrals cr
  JOIN public.profiles p ON p.id = cr.afilhada_id
  WHERE (p_madrinha_id IS NULL OR cr.madrinha_id = p_madrinha_id)
  ORDER BY cr.total_commission_earned DESC NULLS LAST, cr.started_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- 8. View materializável de stats por madrinha ---------------
CREATE OR REPLACE VIEW public.v_madrinha_affiliate_stats
WITH (security_invoker = true) AS
SELECT
  cr.madrinha_id,
  COUNT(*) FILTER (WHERE cr.status = 'active')  AS active_count,
  COUNT(*) FILTER (WHERE cr.status = 'frozen')  AS frozen_count,
  COUNT(*) FILTER (WHERE cr.status = 'blocked') AS blocked_count,
  COUNT(*) FILTER (WHERE cr.status = 'removed') AS removed_count,
  COALESCE(SUM(cr.total_commission_earned), 0)  AS total_commission,
  MAX(cr.last_commission_at)                    AS last_commission_at
FROM public.creator_referrals cr
GROUP BY cr.madrinha_id;

GRANT SELECT ON public.v_madrinha_affiliate_stats TO authenticated;
