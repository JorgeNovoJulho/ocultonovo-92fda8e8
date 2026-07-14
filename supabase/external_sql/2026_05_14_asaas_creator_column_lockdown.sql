-- =====================================================================
-- ASAAS Column-Level Lockdown — creator_pricing_config & profiles
-- =====================================================================
-- Objetivo: garantir que NENHUM criador (mesmo via API/CLI) possa ler ou
-- gravar colunas técnicas do ASAAS. Apenas admin_master pode acessar.
-- Idempotente: pode rodar quantas vezes precisar.
-- =====================================================================

-- 0) Helper master (criado em hardening anterior; recriamos por segurança)
CREATE OR REPLACE FUNCTION public._is_oculto_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = 'admin_master'
  )
$$;

-- =====================================================================
-- 1) creator_pricing_config — revoga colunas ASAAS dos roles públicos
-- =====================================================================
DO $$
DECLARE
  v_cols text[] := ARRAY[
    'asaas_api_key',
    'asaas_webhook_secret',
    'asaas_wallet_id',
    'asaas_connection_status',
    'asaas_last_test_at'
  ];
  c text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='creator_pricing_config'
  ) THEN
    FOREACH c IN ARRAY v_cols LOOP
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='creator_pricing_config'
          AND column_name=c
      ) THEN
        EXECUTE format(
          'REVOKE SELECT (%I), UPDATE (%I), INSERT (%I) ON public.creator_pricing_config FROM anon, authenticated',
          c, c, c
        );
      END IF;
    END LOOP;
  END IF;
END $$;

-- 2) profiles.asaas_wallet_id — também bloqueia update/select pelo dono
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='asaas_wallet_id'
  ) THEN
    REVOKE UPDATE (asaas_wallet_id), INSERT (asaas_wallet_id)
      ON public.profiles FROM anon, authenticated;
    -- SELECT permanece (já filtrado por RLS); admin_master pode tudo via service_role / policies.
  END IF;
END $$;

-- =====================================================================
-- 3) Trigger de proteção: impede UPDATE de colunas ASAAS por não-master
-- =====================================================================
CREATE OR REPLACE FUNCTION public._block_creator_asaas_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / admin_master sempre pode
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public._is_oculto_master() THEN
    RETURN NEW;
  END IF;

  -- Bloqueia se algum campo técnico ASAAS estiver mudando
  IF TG_OP = 'INSERT' THEN
    NEW.asaas_api_key := NULL;
    NEW.asaas_webhook_secret := NULL;
    NEW.asaas_wallet_id := NULL;
    NEW.asaas_connection_status := NULL;
    NEW.asaas_last_test_at := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.asaas_api_key := OLD.asaas_api_key;
    NEW.asaas_webhook_secret := OLD.asaas_webhook_secret;
    NEW.asaas_wallet_id := OLD.asaas_wallet_id;
    NEW.asaas_connection_status := OLD.asaas_connection_status;
    NEW.asaas_last_test_at := OLD.asaas_last_test_at;
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='creator_pricing_config'
  ) THEN
    DROP TRIGGER IF EXISTS trg_block_creator_asaas_writes ON public.creator_pricing_config;
    CREATE TRIGGER trg_block_creator_asaas_writes
      BEFORE INSERT OR UPDATE ON public.creator_pricing_config
      FOR EACH ROW EXECUTE FUNCTION public._block_creator_asaas_writes();
  END IF;
END $$;

-- 4) Trigger equivalente para profiles.asaas_wallet_id
CREATE OR REPLACE FUNCTION public._block_profile_asaas_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR public._is_oculto_master() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.asaas_wallet_id := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.asaas_wallet_id := OLD.asaas_wallet_id;
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='asaas_wallet_id'
  ) THEN
    DROP TRIGGER IF EXISTS trg_block_profile_asaas_writes ON public.profiles;
    CREATE TRIGGER trg_block_profile_asaas_writes
      BEFORE INSERT OR UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public._block_profile_asaas_writes();
  END IF;
END $$;

-- =====================================================================
-- FIM
-- =====================================================================
