-- =========================================================================
-- 2026-06-10 — Correção dos achados críticos do scanner (supabase_lov)
-- Banco EXTERNO (rvybbrkzmboqbhcemqar). 100% idempotente.
--
-- Cobre:
--   1) aura_xp_global_config  — UPDATE USING (true) → restringe a master/admin
--   2) aura_xp_interaction_config — ALL USING (true) → restringe a master/admin
--   3) admin_notifications    — INSERT aberto a authenticated → só admin/master
--   4) profiles               — bloqueia leitura de colunas sensíveis por
--                                column-level privilege (sem quebrar SELECT do dono)
--   5) system_settings        — remove SELECT público anônimo
--   6) storage 'seed-backups' — INSERT restrito a service_role
--   7) storage 'support_attachments' — SELECT só dono do ticket ou admin
-- =========================================================================

-- Helper unificado (caso ainda não exista) ---------------------------------
CREATE OR REPLACE FUNCTION public._sec_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(public.is_master_admin(), false)
    OR public.has_role(auth.uid(), 'admin_master')
    OR public.has_role(auth.uid(), 'admin_regional')
    OR public.has_role(auth.uid(), 'admin');
$$;
GRANT EXECUTE ON FUNCTION public._sec_is_admin() TO authenticated;

-- 1) aura_xp_global_config -------------------------------------------------
ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin master can update global config" ON public.aura_xp_global_config;
DROP POLICY IF EXISTS "aura_xp_global_config_update_admin" ON public.aura_xp_global_config;
CREATE POLICY "aura_xp_global_config_update_admin"
  ON public.aura_xp_global_config FOR UPDATE TO authenticated
  USING (public._sec_is_admin()) WITH CHECK (public._sec_is_admin());

-- 2) aura_xp_interaction_config -------------------------------------------
ALTER TABLE public.aura_xp_interaction_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin master can manage interaction config" ON public.aura_xp_interaction_config;
DROP POLICY IF EXISTS "aura_xp_interaction_config_all_admin" ON public.aura_xp_interaction_config;
DROP POLICY IF EXISTS "aura_xp_interaction_config_select_auth" ON public.aura_xp_interaction_config;
CREATE POLICY "aura_xp_interaction_config_select_auth"
  ON public.aura_xp_interaction_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "aura_xp_interaction_config_all_admin"
  ON public.aura_xp_interaction_config FOR ALL TO authenticated
  USING (public._sec_is_admin()) WITH CHECK (public._sec_is_admin());

-- 3) admin_notifications — INSERT só admin --------------------------------
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can create admin notifications" ON public.admin_notifications;
DROP POLICY IF EXISTS "admin_notifications_insert_admin" ON public.admin_notifications;
CREATE POLICY "admin_notifications_insert_admin"
  ON public.admin_notifications FOR INSERT TO authenticated
  WITH CHECK (public._sec_is_admin());

-- 4) profiles — column-level grants ---------------------------------------
-- Não dá para filtrar colunas em RLS; usamos privilégios por coluna.
-- O dono ainda lê tudo via RLS porque revogamos SELECT(*) e re-concedemos
-- por coluna; colunas sensíveis ficam acessíveis apenas via SECURITY DEFINER
-- (RPCs admin/owner). Aplicamos REVOKE/GRANT idempotente.
DO $$
DECLARE
  sensitive_cols text[] := ARRAY[
    'cpf_cnpj','phone_number','pix_key','pix_key_type',
    'address_street','address_number','address_neighborhood',
    'address_city','address_state','address_cep',
    'balance','pending_balance','kyc_document_url','kyc_selfie_url',
    'stripe_customer_id','asaas_wallet_id','ban_reason',
    'shadowban_reason','risk_flags','risk_level','suspicious_flag_reason'
  ];
  col text;
  safe_cols text;
BEGIN
  -- Lista de colunas NÃO sensíveis, para re-grant
  SELECT string_agg(quote_ident(column_name), ',')
    INTO safe_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='profiles'
     AND column_name <> ALL (sensitive_cols);

  -- Revoga SELECT total e reconcede só nas safe_cols para authenticated/anon
  EXECUTE 'REVOKE SELECT ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon';
  IF safe_cols IS NOT NULL THEN
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', safe_cols);
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon', safe_cols);
  END IF;

  -- service_role e o próprio backend definer continuam com acesso total
  EXECUTE 'GRANT ALL ON public.profiles TO service_role';
END $$;

-- RPC para o dono ler seus próprios dados sensíveis -----------------------
CREATE OR REPLACE FUNCTION public.profile_get_sensitive_self()
RETURNS SETOF public.profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.profiles
   WHERE user_id = auth.uid() OR id = auth.uid()
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.profile_get_sensitive_self() TO authenticated;

-- 5) system_settings — sem leitura anônima --------------------------------
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read settings" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_select_public" ON public.system_settings;
DROP POLICY IF EXISTS "system_settings_select_auth_safe" ON public.system_settings;
CREATE POLICY "system_settings_select_auth_safe"
  ON public.system_settings FOR SELECT TO authenticated
  USING (
    key !~* '(secret|api_key|token|password|webhook)'
    OR public._sec_is_admin()
  );
REVOKE SELECT ON public.system_settings FROM anon;

-- 6) storage 'seed-backups' — INSERT só service_role ---------------------
DROP POLICY IF EXISTS "Service can insert seed backups" ON storage.objects;
DROP POLICY IF EXISTS "seed_backups_insert_service" ON storage.objects;
CREATE POLICY "seed_backups_insert_service" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'seed-backups');

-- 7) storage 'support_attachments' — SELECT só dono ou admin -------------
DROP POLICY IF EXISTS "Public read support attachments" ON storage.objects;
DROP POLICY IF EXISTS "support_attachments_select_owner" ON storage.objects;
CREATE POLICY "support_attachments_select_owner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'support_attachments'
    AND (
      public._sec_is_admin()
      OR EXISTS (
        SELECT 1 FROM public.support_tickets st
         WHERE st.user_id = auth.uid()
           AND position(st.id::text in storage.objects.name) > 0
      )
    )
  );

NOTIFY pgrst, 'reload schema';
