-- ============================================================================
-- BETA CONTROL — Onda 4: Auditoria + Checklist de pré-lançamento
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) AUDITORIA -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_runtime_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by    uuid,
  prev_mode     text,
  new_mode      text,
  prev_snapshot jsonb,
  new_snapshot  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_runtime_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select_master" ON public.platform_runtime_audit;
CREATE POLICY "audit_select_master" ON public.platform_runtime_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  );

CREATE OR REPLACE FUNCTION public._platform_runtime_audit_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.platform_runtime_audit (changed_by, prev_mode, new_mode, prev_snapshot, new_snapshot)
  VALUES (auth.uid(), OLD.platform_mode, NEW.platform_mode, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_platform_runtime_audit ON public.platform_runtime_settings;
CREATE TRIGGER trg_platform_runtime_audit
  AFTER UPDATE ON public.platform_runtime_settings
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public._platform_runtime_audit_trg();

-- 2) CHECKLIST DE PRÉ-LANÇAMENTO ------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_launch_checklist (
  key          text PRIMARY KEY,
  label        text NOT NULL,
  description  text,
  required     boolean NOT NULL DEFAULT true,
  done         boolean NOT NULL DEFAULT false,
  done_at      timestamptz,
  done_by      uuid,
  sort_order   int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_launch_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_select_all_admin" ON public.platform_launch_checklist;
CREATE POLICY "checklist_select_all_admin" ON public.platform_launch_checklist
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  );

DROP POLICY IF EXISTS "checklist_write_master" ON public.platform_launch_checklist;
CREATE POLICY "checklist_write_master" ON public.platform_launch_checklist
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  );

-- Items default (upsert idempotente — não sobrescreve "done")
INSERT INTO public.platform_launch_checklist (key, label, description, required, sort_order) VALUES
  ('asaas_production',    'ASAAS em PRODUÇÃO',          'Chave ASAAS_API_KEY apontando para produção, sandbox_mode=false.', true, 10),
  ('stripe_live',         'Stripe LIVE',                'Chaves Stripe em modo live, webhook configurado.', true, 20),
  ('emails_verified',     'E-mails (Resend) verificados', 'Domínio do remetente verificado no Resend.', true, 30),
  ('whatsapp_provider',   'WhatsApp provider OK',       'Token e webhook do provedor de WhatsApp validados.', false, 40),
  ('kyc_flow',            'Fluxo KYC ativo',            'Verificação de identidade obrigatória para criadores monetizados.', true, 50),
  ('payouts_ready',       'Saques homologados',         'Subconta ASAAS pronta e função creator-payout testada.', true, 60),
  ('capacity_check',      'Capacidade de plataforma',   'Limite e fila de espera revisados.', true, 70),
  ('legal_terms',         'Termos e LGPD publicados',   'Termos, políticas e fluxos +18 disponíveis.', true, 80),
  ('backup_snapshot',     'Snapshot pré-lançamento',    'Backup completo do banco gerado antes da virada.', true, 90),
  ('monitoring',          'Observabilidade',            'Discord/Sentry recebendo alertas críticos.', false, 100)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      required = EXCLUDED.required,
      sort_order = EXCLUDED.sort_order;

CREATE OR REPLACE FUNCTION public._touch_launch_checklist()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_launch_checklist ON public.platform_launch_checklist;
CREATE TRIGGER trg_touch_launch_checklist
  BEFORE UPDATE ON public.platform_launch_checklist
  FOR EACH ROW EXECUTE FUNCTION public._touch_launch_checklist();

-- 3) RPC: pode entrar em produção? ----------------------------------------
CREATE OR REPLACE FUNCTION public.launch_checklist_ready()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.platform_launch_checklist
    WHERE required = true AND done = false
  );
$$;

GRANT EXECUTE ON FUNCTION public.launch_checklist_ready() TO anon, authenticated;

-- 4) Realtime --------------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_launch_checklist;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
