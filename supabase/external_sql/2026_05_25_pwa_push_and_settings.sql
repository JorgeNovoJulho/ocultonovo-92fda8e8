-- ============================================================================
-- PWA Premium OCULTO — colunas pwa_* + tabela push_subscriptions
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente: pode rodar várias vezes sem efeito colateral.
-- Não altera Beta Control, ASAAS, monetização ou auth.
-- ============================================================================

-- 1) Colunas pwa_* em platform_runtime_settings (singleton já existente)
ALTER TABLE public.platform_runtime_settings
  ADD COLUMN IF NOT EXISTS pwa_install_banner_enabled    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pwa_install_page_enabled      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pwa_min_version               text,
  ADD COLUMN IF NOT EXISTS pwa_update_message            text NOT NULL DEFAULT 'Uma nova versão do OCULTO está disponível.',
  ADD COLUMN IF NOT EXISTS pwa_force_update              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pwa_offline_fallback_enabled  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pwa_push_enabled              boolean NOT NULL DEFAULT false;

-- 2) Tabela push_subscriptions (own-only via RLS)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_own_select" ON public.push_subscriptions;
CREATE POLICY "push_subs_own_select"
  ON public.push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_own_insert" ON public.push_subscriptions;
CREATE POLICY "push_subs_own_insert"
  ON public.push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_own_update" ON public.push_subscriptions;
CREATE POLICY "push_subs_own_update"
  ON public.push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subs_own_delete" ON public.push_subscriptions;
CREATE POLICY "push_subs_own_delete"
  ON public.push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- 3) Service-role / edge function pode ler tudo (sem policy: service_role bypassa RLS)

-- 4) Recarga schema PostgREST
NOTIFY pgrst, 'reload schema';
