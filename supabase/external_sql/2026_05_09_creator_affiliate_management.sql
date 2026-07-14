-- ============================================================
-- Gestão de afiliados pelo CRIADOR (não-destrutivo, idempotente)
-- Cria tabela de candidaturas + RPCs creator_approve/reject_affiliate
-- + view consolidada com link, totais e ranking por período.
-- ============================================================

-- 1. Tabela de candidaturas ----------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_affiliate_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','canceled')),
  message TEXT,
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (affiliate_user_id, creator_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_oculto_affreq_creator ON public.oculto_affiliate_requests(creator_profile_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oculto_affreq_affiliate ON public.oculto_affiliate_requests(affiliate_user_id, status);

ALTER TABLE public.oculto_affiliate_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affreq_owner_read" ON public.oculto_affiliate_requests;
CREATE POLICY "affreq_owner_read" ON public.oculto_affiliate_requests
  FOR SELECT TO authenticated
  USING (
    affiliate_user_id = auth.uid()
    OR creator_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin','admin_master'))
  );

DROP POLICY IF EXISTS "affreq_self_insert" ON public.oculto_affiliate_requests;
CREATE POLICY "affreq_self_insert" ON public.oculto_affiliate_requests
  FOR INSERT TO authenticated
  WITH CHECK (affiliate_user_id = auth.uid());

DROP POLICY IF EXISTS "affreq_self_update" ON public.oculto_affiliate_requests;
CREATE POLICY "affreq_self_update" ON public.oculto_affiliate_requests
  FOR UPDATE TO authenticated
  USING (
    affiliate_user_id = auth.uid()
    OR creator_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- 2. Coluna referral_code em creator_referrals (link único) --
ALTER TABLE public.creator_referrals
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- referral_code já existe na tabela (definido em 2026_05_06_affiliates_advanced_management.sql)

-- 3. RPC: criador APROVA candidatura -------------------------
CREATE OR REPLACE FUNCTION public.creator_approve_affiliate(_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_creator_profile_id UUID;
  v_affiliate_profile_id UUID;
  v_referral_id UUID;
  v_code TEXT;
BEGIN
  SELECT * INTO v_req FROM public.oculto_affiliate_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  -- Confirma que quem chama é o dono do canal
  SELECT id INTO v_creator_profile_id FROM public.profiles
  WHERE id = v_req.creator_profile_id AND user_id = auth.uid();
  IF v_creator_profile_id IS NULL THEN RAISE EXCEPTION 'not_channel_owner'; END IF;

  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;

  SELECT id INTO v_affiliate_profile_id FROM public.profiles WHERE user_id = v_req.affiliate_user_id;
  IF v_affiliate_profile_id IS NULL THEN RAISE EXCEPTION 'affiliate_profile_not_found'; END IF;

  -- Gera código único
  v_code := 'AFF' || upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8));

  -- Cria/atualiza vínculo em creator_referrals (Madrinhas reaproveitada)
  INSERT INTO public.creator_referrals (madrinha_id, afilhada_id, referral_code, status, approved_at)
  VALUES (v_creator_profile_id, v_affiliate_profile_id, v_code, 'active', now())
  ON CONFLICT (madrinha_id, afilhada_id) DO UPDATE
    SET status = 'active', approved_at = COALESCE(public.creator_referrals.approved_at, now())
  RETURNING id INTO v_referral_id;

  UPDATE public.oculto_affiliate_requests
  SET status='approved', decided_at=now(), decided_by=auth.uid(), updated_at=now()
  WHERE id = _request_id;

  RETURN v_referral_id;
END $$;

REVOKE ALL ON FUNCTION public.creator_approve_affiliate(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_approve_affiliate(UUID) TO authenticated;

-- 4. RPC: criador REJEITA candidatura ------------------------
CREATE OR REPLACE FUNCTION public.creator_reject_affiliate(_request_id UUID, _reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req RECORD;
BEGIN
  SELECT * INTO v_req FROM public.oculto_affiliate_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_req.creator_profile_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_channel_owner';
  END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'already_decided'; END IF;

  UPDATE public.oculto_affiliate_requests
  SET status='rejected', decided_at=now(), decided_by=auth.uid(),
      rejection_reason=_reason, updated_at=now()
  WHERE id = _request_id;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.creator_reject_affiliate(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_reject_affiliate(UUID, TEXT) TO authenticated;

-- 5. RPC: ranking por período --------------------------------
-- Períodos: 'week','biweek','month','semester','year','all'
CREATE OR REPLACE FUNCTION public.creator_affiliate_ranking(
  _creator_profile_id UUID,
  _period TEXT DEFAULT 'month',
  _from TIMESTAMPTZ DEFAULT NULL,
  _to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  affiliate_id UUID,
  sales BIGINT,
  gross NUMERIC,
  commission NUMERIC,
  last_sale_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ := COALESCE(_to, now());
BEGIN
  IF _from IS NOT NULL THEN
    v_from := _from;
  ELSE
    v_from := CASE lower(coalesce(_period,'month'))
      WHEN 'week' THEN now() - interval '7 days'
      WHEN 'biweek' THEN now() - interval '15 days'
      WHEN 'month' THEN now() - interval '30 days'
      WHEN 'semester' THEN now() - interval '180 days'
      WHEN 'year' THEN now() - interval '365 days'
      ELSE TIMESTAMPTZ '1970-01-01'
    END;
  END IF;

  RETURN QUERY
  SELECT rl.affiliate_id,
         count(*)::BIGINT AS sales,
         COALESCE(sum(rl.gross_amount),0)::NUMERIC AS gross,
         COALESCE(sum(rl.commission_amount),0)::NUMERIC AS commission,
         max(rl.created_at) AS last_sale_at
  FROM public.referral_ledger rl
  WHERE rl.creator_id = _creator_profile_id
    AND rl.status IN ('confirmed','paid')
    AND rl.created_at >= v_from
    AND rl.created_at <= v_to
  GROUP BY rl.affiliate_id
  ORDER BY commission DESC;
END $$;

REVOKE ALL ON FUNCTION public.creator_affiliate_ranking(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_affiliate_ranking(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 6. RPC: série diária de comissões para o gráfico
CREATE OR REPLACE FUNCTION public.creator_affiliate_daily_series(
  _creator_profile_id UUID, _period TEXT DEFAULT 'month',
  _from TIMESTAMPTZ DEFAULT NULL, _to TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (day DATE, sales BIGINT, gross NUMERIC, commission NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_from TIMESTAMPTZ; v_to TIMESTAMPTZ := COALESCE(_to, now());
BEGIN
  IF _from IS NOT NULL THEN v_from := _from;
  ELSE v_from := CASE lower(coalesce(_period,'month'))
    WHEN 'week' THEN now() - interval '7 days'
    WHEN 'biweek' THEN now() - interval '15 days'
    WHEN 'month' THEN now() - interval '30 days'
    WHEN 'semester' THEN now() - interval '180 days'
    WHEN 'year' THEN now() - interval '365 days'
    ELSE now() - interval '365 days' END;
  END IF;
  RETURN QUERY
  SELECT (rl.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
         count(*)::BIGINT,
         COALESCE(sum(rl.gross_amount),0)::NUMERIC,
         COALESCE(sum(rl.commission_amount),0)::NUMERIC
  FROM public.referral_ledger rl
  WHERE rl.creator_id = _creator_profile_id
    AND rl.status IN ('confirmed','paid')
    AND rl.created_at >= v_from AND rl.created_at <= v_to
  GROUP BY 1 ORDER BY 1;
END $$;
REVOKE ALL ON FUNCTION public.creator_affiliate_daily_series(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_affiliate_daily_series(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
