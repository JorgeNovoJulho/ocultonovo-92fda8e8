-- ============================================================
-- Oculto — Hardening RLS: tabelas MASTER ONLY
-- ============================================================
-- Garante que tabelas financeiras / infra sensíveis sejam
-- legíveis/escrevíveis EXCLUSIVAMENTE pelo admin_master.
--
-- Estratégia:
--   1. Reaproveita helper public._is_oculto_admin() (pacote
--      cron-jobs-panel) e cria um helper MASTER-ONLY mais
--      restrito (public._is_oculto_master()).
--   2. Para cada tabela candidata: se EXISTIR, habilita RLS,
--      remove policies antigas com nome conhecido, e instala
--      policy ALL "master_only" + bloqueia anon/authenticated.
--
-- Idempotente. Tabelas inexistentes são silenciosamente puladas.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Helper: APENAS admin_master (sem moderator/regional)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._is_oculto_master()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.user_id = auth.uid()
       AND (
         LOWER(COALESCE(p.username, '')) = 'ocultomaster'
         OR LOWER(COALESCE(p.email,    '')) = 'ocultomaster@ocultoswing.com.br'
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role = 'admin_master'
         )
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public._is_oculto_master() TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Procedure: aplica RLS master-only em uma tabela (se existir)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._apply_master_only_rls(p_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oid REGCLASS;
  v_policy TEXT;
  v_relkind CHAR;
BEGIN
  v_oid := to_regclass('public.' || p_table);
  IF v_oid IS NULL THEN
    RAISE NOTICE '[master-rls] skip: relação % não existe', p_table;
    RETURN;
  END IF;

  SELECT relkind INTO v_relkind FROM pg_class WHERE oid = v_oid;
  -- Apenas tabelas comuns ('r') e particionadas ('p') suportam RLS.
  IF v_relkind NOT IN ('r', 'p') THEN
    RAISE NOTICE '[master-rls] skip: % é view/relkind=% (RLS não suportado)', p_table, v_relkind;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  -- Drop policies anteriores conhecidas
  FOR v_policy IN
    SELECT polname FROM pg_policy WHERE polrelid = v_oid
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, p_table);
  END LOOP;

  -- Policy ALL master-only
  EXECUTE format($f$
    CREATE POLICY "master_only_all" ON public.%I
      FOR ALL
      TO authenticated
      USING (public._is_oculto_master())
      WITH CHECK (public._is_oculto_master())
  $f$, p_table);

  RAISE NOTICE '[master-rls] OK: % protegida (master only)', p_table;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- Aplica em todas as tabelas-alvo (existentes serão tratadas)
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  alvos TEXT[] := ARRAY[
    -- gateways / configs financeiras
    'pix_gateway_config',
    'split_config',
    'system_settings',
    'api_keys',
    'webhooks',
    'backups',
    -- ASAAS
    'oculto_asaas_webhook_logs',
    'oculto_asaas_subscriptions',
    'oculto_asaas_subaccounts',
    'asaas_webhook_logs',
    -- carteiras / saques / disputas
    'oculto_creator_wallets',
    'oculto_wallet_ledger',
    'creator_wallets',
    'wallet_ledger',
    'withdrawal_requests',
    'oculto_chargebacks_disputes',
    'chargebacks_disputes',
    'oculto_fraud_scores',
    'fraud_scores'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    PERFORM public._apply_master_only_rls(t);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────
-- audit_logs: leitura master-only, inserção pelo próprio user
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY';

    -- Limpa policies antigas conflitantes
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_select_master" ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "audit_logs_insert_self"  ON public.audit_logs';

    EXECUTE $p$
      CREATE POLICY "audit_logs_select_master" ON public.audit_logs
        FOR SELECT
        TO authenticated
        USING (public._is_oculto_master())
    $p$;

    EXECUTE $p$
      CREATE POLICY "audit_logs_insert_self" ON public.audit_logs
        FOR INSERT
        TO authenticated
        WITH CHECK (admin_id = auth.uid() OR public._is_oculto_master())
    $p$;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- user_roles: somente master pode ler/gravar (anti privilege escalation)
-- ──────────────────────────────────────────────────────────────
SELECT public._apply_master_only_rls('user_roles');

-- ============================================================
-- FIM
-- ============================================================
