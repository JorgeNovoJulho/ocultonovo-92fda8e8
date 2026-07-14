-- ============================================================================
-- BETA CONTROL — Sistema global de fase da plataforma Oculto
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente. Não duplica nada. Não remove planos/ASAAS/VIP.
-- Apenas controla disponibilidade em tempo real.
-- ============================================================================

-- 1) Tabela única de runtime settings (singleton via id fixo)
CREATE TABLE IF NOT EXISTS public.platform_runtime_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_mode text NOT NULL DEFAULT 'beta'
    CHECK (platform_mode IN ('beta','production','maintenance')),

  beta_enabled                   boolean NOT NULL DEFAULT true,
  beta_free_has_premium_social   boolean NOT NULL DEFAULT true,
  beta_founders_enabled          boolean NOT NULL DEFAULT true,

  monetization_enabled           boolean NOT NULL DEFAULT false,
  subscriptions_enabled          boolean NOT NULL DEFAULT false,
  vip_channels_enabled           boolean NOT NULL DEFAULT false,
  paid_content_enabled           boolean NOT NULL DEFAULT false,
  payouts_enabled                boolean NOT NULL DEFAULT false,
  safe_meetings_enabled          boolean NOT NULL DEFAULT false,
  whatsapp_enabled               boolean NOT NULL DEFAULT false,
  real_experiences_enabled       boolean NOT NULL DEFAULT false,

  launch_checklist_required      boolean NOT NULL DEFAULT true,

  beta_welcome_title    text NOT NULL DEFAULT 'Você entrou no Beta do Oculto',
  beta_welcome_message  text NOT NULL DEFAULT 'Plataforma em fase de testes. Funções Premium sociais liberadas temporariamente. Monetização, canais pagos, encontros seguros e WhatsApp em breve.',

  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Garantir 1 linha singleton (não recria se já existir)
INSERT INTO public.platform_runtime_settings (platform_mode)
SELECT 'beta'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_runtime_settings);

-- 3) RLS — todos leem (precisa pra hook global), só master escreve
ALTER TABLE public.platform_runtime_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_runtime_select_all" ON public.platform_runtime_settings;
CREATE POLICY "platform_runtime_select_all"
  ON public.platform_runtime_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "platform_runtime_master_write" ON public.platform_runtime_settings;
CREATE POLICY "platform_runtime_master_write"
  ON public.platform_runtime_settings FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND coalesce(p.is_admin, false) = true
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.user_id = auth.uid()
         AND coalesce(p.is_admin, false) = true
    )
  );

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public._touch_platform_runtime()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_platform_runtime ON public.platform_runtime_settings;
CREATE TRIGGER trg_touch_platform_runtime
  BEFORE UPDATE ON public.platform_runtime_settings
  FOR EACH ROW EXECUTE FUNCTION public._touch_platform_runtime();

-- 5) RPC pública leve — qualquer um pode ler a fase atual
CREATE OR REPLACE FUNCTION public.get_platform_runtime()
RETURNS public.platform_runtime_settings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.platform_runtime_settings ORDER BY created_at ASC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_runtime() TO anon, authenticated;

-- 6) Realtime — replicar mudanças
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND tablename='platform_runtime_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_runtime_settings;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.platform_runtime_settings REPLICA IDENTITY FULL;

-- 7) Marcador de fundador (idempotente, não destrutivo)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='is_beta_founder'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN is_beta_founder boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='beta_founder_since'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN beta_founder_since timestamptz;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles' AND column_name='beta_welcome_seen_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN beta_welcome_seen_at timestamptz;
  END IF;
END $$;

-- 8) RPC: marcar fundador (chamado no primeiro acesso durante beta)
CREATE OR REPLACE FUNCTION public.mark_beta_founder_self()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mode text;
  v_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT platform_mode, beta_founders_enabled INTO v_mode, v_enabled
    FROM public.platform_runtime_settings ORDER BY created_at LIMIT 1;
  IF v_mode <> 'beta' OR coalesce(v_enabled,false) = false THEN RETURN false; END IF;

  UPDATE public.profiles
     SET is_beta_founder = true,
         beta_founder_since = COALESCE(beta_founder_since, now())
   WHERE user_id = v_uid AND coalesce(is_beta_founder,false) = false;

  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_beta_founder_self() TO authenticated;

-- 9) RPC: marcar boas-vindas vista
CREATE OR REPLACE FUNCTION public.mark_beta_welcome_seen()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET beta_welcome_seen_at = now() WHERE user_id = v_uid;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.mark_beta_welcome_seen() TO authenticated;

NOTIFY pgrst, 'reload schema';
