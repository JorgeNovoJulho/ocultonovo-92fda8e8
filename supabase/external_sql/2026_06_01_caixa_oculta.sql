-- ============================================================
-- 2026_06_01_caixa_oculta.sql
-- Caixa Oculta — campanhas sociais pagas em XP, aprovação Master
-- e sorteio manual executado no backend (auditável).
--
-- Reusa: public.is_master_admin(uuid), oculto_aura_xp_interaction_ledger,
-- oculto_aura_xp_interaction_costs, profiles.balance (xp).
-- Não toca em posts, profiles (exceto leitura) nem XP existente.
-- Idempotente: pode rodar várias vezes.
-- ============================================================

-- ---------- Shim: garante public.is_master_admin(uuid) -----
-- Algumas instalações expõem apenas is_master_admin() (sem args)
-- ou _aura_is_master(uuid). Criamos a assinatura (uuid) consolidando
-- as regras conhecidas (email ocultomaster@*, username 'ocultomaster',
-- role admin/master em user_roles). Idempotente.
CREATE OR REPLACE FUNCTION public.is_master_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT lower(email) IN ('ocultomaster@ocultoswing.com.br','ocultomaster@oculto.com.br')
       FROM auth.users WHERE id = _uid),
    false
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
     WHERE user_id = _uid AND lower(coalesce(username,'')) = 'ocultomaster'
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid AND role::text IN ('admin','master','super_admin','admin_master')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_master_admin(uuid) TO authenticated, anon, service_role;



-- ---------- Função utilitária: criador VIP -----------------
CREATE OR REPLACE FUNCTION public.is_vip_creator(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _uid
      AND (LOWER(COALESCE(p.plan_type,'')) LIKE '%vip%'
           OR public.is_master_admin(_uid))
  );
$$;

-- ---------- 1) Tabela: campaigns ---------------------------
CREATE TABLE IF NOT EXISTS public.oculto_caixa_oculta_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  xp_cost INTEGER NOT NULL DEFAULT 1,
  draw_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  approval_status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  allow_public_feed BOOLEAN DEFAULT TRUE,
  prize_type TEXT NOT NULL DEFAULT 'digital',
  rules TEXT,
  participants_count INTEGER DEFAULT 0,
  winners_drawn BOOLEAN DEFAULT FALSE,
  drawn_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT cox_campaigns_xp_cost_chk CHECK (xp_cost >= 1),
  CONSTRAINT cox_campaigns_status_chk CHECK (status IN ('draft','active','closed','drawn','cancelled')),
  CONSTRAINT cox_campaigns_approval_chk CHECK (approval_status IN ('draft','pending_approval','approved','rejected'))
);

GRANT SELECT ON public.oculto_caixa_oculta_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE ON public.oculto_caixa_oculta_campaigns TO authenticated;
GRANT ALL ON public.oculto_caixa_oculta_campaigns TO service_role;

ALTER TABLE public.oculto_caixa_oculta_campaigns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cox_campaigns_creator ON public.oculto_caixa_oculta_campaigns(creator_id);
CREATE INDEX IF NOT EXISTS idx_cox_campaigns_status  ON public.oculto_caixa_oculta_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_cox_campaigns_approval ON public.oculto_caixa_oculta_campaigns(approval_status);
CREATE INDEX IF NOT EXISTS idx_cox_campaigns_draw_at ON public.oculto_caixa_oculta_campaigns(draw_at);

-- ---------- 2) Tabela: prizes ------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_caixa_oculta_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.oculto_caixa_oculta_campaigns(id) ON DELETE CASCADE,
  prize_position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  prize_kind TEXT NOT NULL DEFAULT 'digital',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT cox_prizes_kind_chk CHECK (prize_kind IN ('digital','symbolic','highlight','mention','custom_digital')),
  CONSTRAINT cox_prizes_position_chk CHECK (prize_position BETWEEN 1 AND 3),
  UNIQUE(campaign_id, prize_position)
);

GRANT SELECT ON public.oculto_caixa_oculta_prizes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_caixa_oculta_prizes TO authenticated;
GRANT ALL ON public.oculto_caixa_oculta_prizes TO service_role;

ALTER TABLE public.oculto_caixa_oculta_prizes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cox_prizes_campaign ON public.oculto_caixa_oculta_prizes(campaign_id);

-- ---------- 3) Tabela: entries -----------------------------
CREATE TABLE IF NOT EXISTS public.oculto_caixa_oculta_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.oculto_caixa_oculta_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  profile_id UUID,
  xp_spent INTEGER NOT NULL DEFAULT 0,
  entry_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, user_id)
);

GRANT SELECT ON public.oculto_caixa_oculta_entries TO anon;
GRANT SELECT ON public.oculto_caixa_oculta_entries TO authenticated;
GRANT ALL ON public.oculto_caixa_oculta_entries TO service_role;

ALTER TABLE public.oculto_caixa_oculta_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cox_entries_campaign ON public.oculto_caixa_oculta_entries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cox_entries_user     ON public.oculto_caixa_oculta_entries(user_id);

-- ---------- 4) Tabela: winners -----------------------------
CREATE TABLE IF NOT EXISTS public.oculto_caixa_oculta_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.oculto_caixa_oculta_campaigns(id) ON DELETE CASCADE,
  prize_id UUID REFERENCES public.oculto_caixa_oculta_prizes(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  profile_id UUID,
  prize_position INTEGER NOT NULL,
  draw_seed TEXT,
  draw_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, prize_position)
);

GRANT SELECT ON public.oculto_caixa_oculta_winners TO anon;
GRANT SELECT ON public.oculto_caixa_oculta_winners TO authenticated;
GRANT ALL ON public.oculto_caixa_oculta_winners TO service_role;

ALTER TABLE public.oculto_caixa_oculta_winners ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cox_winners_campaign ON public.oculto_caixa_oculta_winners(campaign_id);

-- ---------- 5) Tabela: audit_logs --------------------------
CREATE TABLE IF NOT EXISTS public.oculto_caixa_oculta_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.oculto_caixa_oculta_campaigns(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  old_data JSONB DEFAULT '{}'::jsonb,
  new_data JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT ON public.oculto_caixa_oculta_audit_logs TO authenticated;
GRANT ALL ON public.oculto_caixa_oculta_audit_logs TO service_role;

ALTER TABLE public.oculto_caixa_oculta_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cox_audit_campaign ON public.oculto_caixa_oculta_audit_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cox_audit_actor    ON public.oculto_caixa_oculta_audit_logs(actor_id);

-- ---------- 6) Tabela: settings (singleton) ----------------
CREATE TABLE IF NOT EXISTS public.oculto_caixa_oculta_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled BOOLEAN DEFAULT TRUE,
  require_admin_approval BOOLEAN DEFAULT TRUE,
  creator_vip_only BOOLEAN DEFAULT TRUE,
  allow_physical_prizes BOOLEAN DEFAULT FALSE,
  max_entries_per_user INTEGER DEFAULT 1,
  min_xp_cost INTEGER DEFAULT 1,
  max_xp_cost INTEGER DEFAULT 10000,
  allow_second_prize BOOLEAN DEFAULT TRUE,
  allow_third_prize BOOLEAN DEFAULT TRUE,
  show_participants_publicly BOOLEAN DEFAULT TRUE,
  show_in_feed BOOLEAN DEFAULT TRUE,
  custom_feature_name TEXT DEFAULT 'Caixa Oculta',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT ON public.oculto_caixa_oculta_settings TO anon, authenticated;
GRANT ALL ON public.oculto_caixa_oculta_settings TO service_role;

ALTER TABLE public.oculto_caixa_oculta_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.oculto_caixa_oculta_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_caixa_oculta_settings);

-- ---------- 7) RLS policies (drop+recreate idempotente) ----

-- campaigns
DROP POLICY IF EXISTS cox_campaigns_select_public ON public.oculto_caixa_oculta_campaigns;
CREATE POLICY cox_campaigns_select_public ON public.oculto_caixa_oculta_campaigns
  FOR SELECT TO anon, authenticated
  USING (
    approval_status = 'approved' AND status IN ('active','closed','drawn')
  );

DROP POLICY IF EXISTS cox_campaigns_select_owner ON public.oculto_caixa_oculta_campaigns;
CREATE POLICY cox_campaigns_select_owner ON public.oculto_caixa_oculta_campaigns
  FOR SELECT TO authenticated
  USING (creator_id = auth.uid() OR public.is_master_admin(auth.uid()));

DROP POLICY IF EXISTS cox_campaigns_insert_creator ON public.oculto_caixa_oculta_campaigns;
CREATE POLICY cox_campaigns_insert_creator ON public.oculto_caixa_oculta_campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    creator_id = auth.uid()
    AND public.is_vip_creator(auth.uid())
    AND approval_status IN ('draft','pending_approval')
  );

DROP POLICY IF EXISTS cox_campaigns_update_owner ON public.oculto_caixa_oculta_campaigns;
CREATE POLICY cox_campaigns_update_owner ON public.oculto_caixa_oculta_campaigns
  FOR UPDATE TO authenticated
  USING (
    (creator_id = auth.uid()
       AND participants_count = 0
       AND approval_status IN ('draft','pending_approval','rejected'))
    OR public.is_master_admin(auth.uid())
  );

-- prizes
DROP POLICY IF EXISTS cox_prizes_select_public ON public.oculto_caixa_oculta_prizes;
CREATE POLICY cox_prizes_select_public ON public.oculto_caixa_oculta_prizes
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_campaigns c
      WHERE c.id = campaign_id
        AND (
          (c.approval_status = 'approved' AND c.status IN ('active','closed','drawn'))
          OR c.creator_id = auth.uid()
          OR public.is_master_admin(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS cox_prizes_mutate_owner ON public.oculto_caixa_oculta_prizes;
CREATE POLICY cox_prizes_mutate_owner ON public.oculto_caixa_oculta_prizes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_campaigns c
      WHERE c.id = campaign_id
        AND (
          (c.creator_id = auth.uid()
             AND c.participants_count = 0
             AND c.approval_status IN ('draft','pending_approval','rejected'))
          OR public.is_master_admin(auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_campaigns c
      WHERE c.id = campaign_id
        AND (
          (c.creator_id = auth.uid()
             AND c.participants_count = 0
             AND c.approval_status IN ('draft','pending_approval','rejected'))
          OR public.is_master_admin(auth.uid())
        )
    )
  );

-- entries (SELECT público; INSERT só via RPC com service_role)
DROP POLICY IF EXISTS cox_entries_select_public ON public.oculto_caixa_oculta_entries;
CREATE POLICY cox_entries_select_public ON public.oculto_caixa_oculta_entries
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_campaigns c, public.oculto_caixa_oculta_settings s
      WHERE c.id = campaign_id
        AND s.show_participants_publicly = TRUE
        AND (
          (c.approval_status = 'approved' AND c.status IN ('active','closed','drawn'))
          OR c.creator_id = auth.uid()
          OR public.is_master_admin(auth.uid())
        )
    )
  );

-- winners
DROP POLICY IF EXISTS cox_winners_select_public ON public.oculto_caixa_oculta_winners;
CREATE POLICY cox_winners_select_public ON public.oculto_caixa_oculta_winners
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_campaigns c
      WHERE c.id = campaign_id AND c.winners_drawn = TRUE
    )
  );

-- audit_logs
DROP POLICY IF EXISTS cox_audit_select_master ON public.oculto_caixa_oculta_audit_logs;
CREATE POLICY cox_audit_select_master ON public.oculto_caixa_oculta_audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.oculto_caixa_oculta_campaigns c
      WHERE c.id = campaign_id AND c.creator_id = auth.uid()
    )
  );

-- settings
DROP POLICY IF EXISTS cox_settings_select_all ON public.oculto_caixa_oculta_settings;
CREATE POLICY cox_settings_select_all ON public.oculto_caixa_oculta_settings
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS cox_settings_update_master ON public.oculto_caixa_oculta_settings;
CREATE POLICY cox_settings_update_master ON public.oculto_caixa_oculta_settings
  FOR UPDATE TO authenticated
  USING (public.is_master_admin(auth.uid()))
  WITH CHECK (public.is_master_admin(auth.uid()));

-- ---------- 8) Trigger updated_at --------------------------
CREATE OR REPLACE FUNCTION public._cox_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_cox_campaigns_touch ON public.oculto_caixa_oculta_campaigns;
CREATE TRIGGER trg_cox_campaigns_touch BEFORE UPDATE ON public.oculto_caixa_oculta_campaigns
  FOR EACH ROW EXECUTE FUNCTION public._cox_touch_updated_at();

DROP TRIGGER IF EXISTS trg_cox_settings_touch ON public.oculto_caixa_oculta_settings;
CREATE TRIGGER trg_cox_settings_touch BEFORE UPDATE ON public.oculto_caixa_oculta_settings
  FOR EACH ROW EXECUTE FUNCTION public._cox_touch_updated_at();

-- ============================================================
-- 9) RPC: enviar para aprovação
-- ============================================================
CREATE OR REPLACE FUNCTION public.cox_submit_for_approval(p_campaign_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_camp public.oculto_caixa_oculta_campaigns; v_set public.oculto_caixa_oculta_settings; v_prizes int;
BEGIN
  SELECT * INTO v_camp FROM public.oculto_caixa_oculta_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_camp.creator_id <> auth.uid() AND NOT public.is_master_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_camp.approval_status = 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_approved');
  END IF;

  SELECT * INTO v_set FROM public.oculto_caixa_oculta_settings LIMIT 1;

  IF v_camp.draw_at <= NOW() + INTERVAL '30 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'draw_at_too_soon');
  END IF;
  IF v_camp.xp_cost < v_set.min_xp_cost OR v_camp.xp_cost > v_set.max_xp_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'xp_cost_out_of_range');
  END IF;
  IF COALESCE(v_camp.cover_url, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_cover');
  END IF;

  SELECT count(*) INTO v_prizes FROM public.oculto_caixa_oculta_prizes WHERE campaign_id = p_campaign_id;
  IF v_prizes < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_prizes');
  END IF;

  UPDATE public.oculto_caixa_oculta_campaigns
     SET approval_status = 'pending_approval', status = 'draft', updated_at = NOW()
   WHERE id = p_campaign_id;

  INSERT INTO public.oculto_caixa_oculta_audit_logs (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, auth.uid(), 'submitted_for_approval', jsonb_build_object('at', NOW()));

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.cox_submit_for_approval(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_submit_for_approval(uuid) TO authenticated;

-- ============================================================
-- 10) RPC: aprovar / reprovar / cancelar (Master)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cox_approve_campaign(p_campaign_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false, 'reason','forbidden'); END IF;
  UPDATE public.oculto_caixa_oculta_campaigns
     SET approval_status = 'approved', status = 'active',
         approved_by = auth.uid(), approved_at = NOW(),
         rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
   WHERE id = p_campaign_id;
  INSERT INTO public.oculto_caixa_oculta_audit_logs (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, auth.uid(), 'approved', jsonb_build_object('at', NOW()));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.cox_approve_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_approve_campaign(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cox_reject_campaign(p_campaign_id UUID, p_reason TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_master_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false, 'reason','forbidden'); END IF;
  UPDATE public.oculto_caixa_oculta_campaigns
     SET approval_status = 'rejected',
         rejected_by = auth.uid(), rejected_at = NOW(), rejection_reason = p_reason
   WHERE id = p_campaign_id;
  INSERT INTO public.oculto_caixa_oculta_audit_logs (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, auth.uid(), 'rejected', jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.cox_reject_campaign(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_reject_campaign(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cox_cancel_campaign(p_campaign_id UUID, p_refund BOOLEAN DEFAULT TRUE)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_camp public.oculto_caixa_oculta_campaigns; r RECORD;
BEGIN
  IF NOT public.is_master_admin(auth.uid()) THEN RETURN jsonb_build_object('ok', false, 'reason','forbidden'); END IF;
  SELECT * INTO v_camp FROM public.oculto_caixa_oculta_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF v_camp.winners_drawn THEN RETURN jsonb_build_object('ok', false, 'reason','already_drawn'); END IF;

  UPDATE public.oculto_caixa_oculta_campaigns
     SET status = 'cancelled', updated_at = NOW()
   WHERE id = p_campaign_id;

  IF p_refund THEN
    -- Reembolsa XP a cada participante somando ao balance.
    FOR r IN SELECT user_id, xp_spent FROM public.oculto_caixa_oculta_entries WHERE campaign_id = p_campaign_id LOOP
      UPDATE public.profiles SET balance = COALESCE(balance,0) + r.xp_spent WHERE id = r.user_id;
    END LOOP;
  END IF;

  INSERT INTO public.oculto_caixa_oculta_audit_logs (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, auth.uid(), 'cancelled', jsonb_build_object('refund', p_refund));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.cox_cancel_campaign(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_cancel_campaign(uuid, boolean) TO authenticated;

-- ============================================================
-- 11) RPC: participar (cobra XP via profiles.balance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cox_participate(p_campaign_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_camp public.oculto_caixa_oculta_campaigns;
  v_balance int;
  v_entry_no int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason','unauthenticated'); END IF;

  SELECT * INTO v_camp FROM public.oculto_caixa_oculta_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','not_found'); END IF;
  IF v_camp.approval_status <> 'approved' OR v_camp.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason','not_open');
  END IF;
  IF v_camp.draw_at <= NOW() OR v_camp.winners_drawn THEN
    RETURN jsonb_build_object('ok', false, 'reason','closed');
  END IF;
  IF v_camp.creator_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason','creator_cannot_participate');
  END IF;
  IF EXISTS (SELECT 1 FROM public.oculto_caixa_oculta_entries WHERE campaign_id = p_campaign_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason','already_participating');
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_balance < v_camp.xp_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason','insufficient_xp', 'balance', v_balance, 'required', v_camp.xp_cost);
  END IF;

  -- Debita XP
  UPDATE public.profiles SET balance = v_balance - v_camp.xp_cost WHERE id = v_uid;

  -- Cria entrada
  v_entry_no := v_camp.participants_count + 1;
  INSERT INTO public.oculto_caixa_oculta_entries (campaign_id, user_id, profile_id, xp_spent, entry_number)
  VALUES (p_campaign_id, v_uid, v_uid, v_camp.xp_cost, v_entry_no);

  UPDATE public.oculto_caixa_oculta_campaigns
     SET participants_count = v_entry_no, updated_at = NOW()
   WHERE id = p_campaign_id;

  INSERT INTO public.oculto_caixa_oculta_audit_logs (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, v_uid, 'entry_created', jsonb_build_object('entry_number', v_entry_no, 'xp_spent', v_camp.xp_cost));

  RETURN jsonb_build_object('ok', true, 'entry_number', v_entry_no, 'xp_spent', v_camp.xp_cost, 'balance_after', v_balance - v_camp.xp_cost);
END $$;
REVOKE ALL ON FUNCTION public.cox_participate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_participate(uuid) TO authenticated;

-- ============================================================
-- 12) RPC: sortear (manual, executado no backend)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cox_draw(p_campaign_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_camp public.oculto_caixa_oculta_campaigns;
  v_prizes_count int;
  v_seed text;
  v_hash_input text := '';
  r RECORD;
BEGIN
  SELECT * INTO v_camp FROM public.oculto_caixa_oculta_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','not_found'); END IF;
  IF v_camp.creator_id <> v_uid AND NOT public.is_master_admin(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'reason','forbidden');
  END IF;
  IF v_camp.approval_status <> 'approved' THEN RETURN jsonb_build_object('ok', false, 'reason','not_approved'); END IF;
  IF v_camp.winners_drawn THEN RETURN jsonb_build_object('ok', false, 'reason','already_drawn'); END IF;
  IF v_camp.draw_at > NOW() THEN RETURN jsonb_build_object('ok', false, 'reason','too_early'); END IF;

  SELECT count(*) INTO v_prizes_count FROM public.oculto_caixa_oculta_prizes WHERE campaign_id = p_campaign_id;
  IF v_prizes_count = 0 THEN RETURN jsonb_build_object('ok', false, 'reason','no_prizes'); END IF;
  IF v_camp.participants_count < v_prizes_count THEN
    RETURN jsonb_build_object('ok', false, 'reason','not_enough_participants');
  END IF;

  v_seed := gen_random_uuid()::text || ':' || extract(epoch from now())::text;

  -- Seleciona vencedores: 1 por prize_position, determinístico via md5(seed||entry_id).
  WITH ranked AS (
    SELECT e.id AS entry_id, e.user_id, md5(v_seed || e.id::text) AS h
      FROM public.oculto_caixa_oculta_entries e
     WHERE e.campaign_id = p_campaign_id
     ORDER BY h ASC
     LIMIT v_prizes_count
  ), prized AS (
    SELECT row_number() OVER (ORDER BY r.h ASC) AS pos, r.user_id
      FROM ranked r
  )
  INSERT INTO public.oculto_caixa_oculta_winners
    (campaign_id, prize_id, user_id, profile_id, prize_position, draw_seed, draw_hash)
  SELECT
    p_campaign_id,
    pr.id,
    pz.user_id,
    pz.user_id,
    pz.pos,
    v_seed,
    md5(v_seed || pz.user_id::text)
  FROM prized pz
  JOIN public.oculto_caixa_oculta_prizes pr
    ON pr.campaign_id = p_campaign_id AND pr.prize_position = pz.pos;

  UPDATE public.oculto_caixa_oculta_campaigns
     SET winners_drawn = TRUE, drawn_at = NOW(), status = 'drawn', updated_at = NOW()
   WHERE id = p_campaign_id;

  -- hash agregado
  FOR r IN SELECT user_id, prize_position FROM public.oculto_caixa_oculta_winners WHERE campaign_id = p_campaign_id ORDER BY prize_position LOOP
    v_hash_input := v_hash_input || r.prize_position::text || ':' || r.user_id::text || '|';
  END LOOP;

  INSERT INTO public.oculto_caixa_oculta_audit_logs (campaign_id, actor_id, action, new_data)
  VALUES (p_campaign_id, v_uid, 'draw_executed', jsonb_build_object('seed', v_seed, 'hash', md5(v_seed || v_hash_input)));

  RETURN jsonb_build_object('ok', true, 'seed', v_seed);
END $$;
REVOKE ALL ON FUNCTION public.cox_draw(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cox_draw(uuid) TO authenticated;

-- ============================================================
-- 13) Realtime
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY ARRAY[
    'oculto_caixa_oculta_campaigns',
    'oculto_caixa_oculta_entries',
    'oculto_caixa_oculta_winners'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
