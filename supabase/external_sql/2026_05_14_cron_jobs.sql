-- ============================================================
-- Oculto — Etapa 2: Cron jobs automáticos (pg_cron)
-- ============================================================
-- Executar no SQL Editor do Supabase EXTERNO.
-- Idempotente: usa cron.unschedule + cron.schedule.
-- Pré-requisitos:
--   * extensão pg_cron já habilitada (Database → Extensions)
--   * funções existentes:
--     - public.release_due_balances(uuid, boolean, uuid)
--     - public.cleanup_stress_test_artifacts()
--     - public.auto_purge_old_seeds()  [criada em 2026_05_14_admin_dashboard_metrics_rpc.sql]
-- ============================================================

-- Garantir extensão
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ──────────────────────────────────────────────────────────────
-- 1) Auto-purge de seeds antigos — diário às 03:00 UTC (00:00 BRT)
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('oculto-auto-purge-seeds');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'oculto-auto-purge-seeds',
  '0 3 * * *',
  $$ SELECT public.auto_purge_old_seeds(); $$
);

-- ──────────────────────────────────────────────────────────────
-- 2) Liberação de saldos D+7 — a cada hora cheia
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('oculto-release-due-balances');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'oculto-release-due-balances',
  '0 * * * *',
  $$ SELECT public.release_due_balances(NULL, FALSE, NULL); $$
);

-- ──────────────────────────────────────────────────────────────
-- 3) Limpeza dos artefatos de stress test — diário às 04:00 UTC
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('oculto-cleanup-stress-test');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'oculto-cleanup-stress-test',
  '0 4 * * *',
  $$ SELECT public.cleanup_stress_test_artifacts(); $$
);

-- ──────────────────────────────────────────────────────────────
-- Verificação: listar jobs agendados
-- ──────────────────────────────────────────────────────────────
-- SELECT jobid, schedule, command, active FROM cron.job
--  WHERE jobname LIKE 'oculto-%';
