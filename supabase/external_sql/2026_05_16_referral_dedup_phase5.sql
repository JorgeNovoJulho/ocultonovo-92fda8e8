-- =============================================================
-- FASE 5 — Limpeza de dados duplicados do Programa de Indicações
-- Idempotente. Apenas DELETE de linhas redundantes.
-- NÃO altera schema, views, funções ou RLS.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1) referral_users_tracking
--    A coluna referred_user_id é UNIQUE, mas linhas históricas
--    podem ter sido criadas antes do constraint. Mantém a mais
--    antiga (joined_at ASC, created_at ASC).
-- -------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY referred_user_id
      ORDER BY joined_at ASC, created_at ASC, id ASC
    ) AS rn
  FROM public.referral_users_tracking
)
DELETE FROM public.referral_users_tracking r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

-- Auto-referência (inviter == referred): inválida, remover.
DELETE FROM public.referral_users_tracking
WHERE inviter_user_id = referred_user_id;

-- -------------------------------------------------------------
-- 2) referral_withdrawals
--    Remove duplicatas de saques 'pending' idênticos
--    (mesmo user, mesmo valor, mesma chave PIX) criados na
--    mesma janela de 5 minutos — mantém o mais antigo.
-- -------------------------------------------------------------
WITH dup_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, amount, pix_key,
                   date_trunc('minute', requested_at)
      ORDER BY requested_at ASC, id ASC
    ) AS rn
  FROM public.referral_withdrawals
  WHERE status = 'pending'
)
DELETE FROM public.referral_withdrawals w
USING dup_pending d
WHERE w.id = d.id
  AND d.rn > 1;

-- -------------------------------------------------------------
-- 3) referral_antifraud_events
--    Eventos repetidos do mesmo tipo para o mesmo par
--    inviter+referred dentro de 1h são ruído. Mantém o 1º.
-- -------------------------------------------------------------
WITH dup_events AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(inviter_user_id::text,'-'),
                   COALESCE(referred_user_id::text,'-'),
                   event_type,
                   date_trunc('hour', created_at)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.referral_antifraud_events
)
DELETE FROM public.referral_antifraud_events e
USING dup_events d
WHERE e.id = d.id
  AND d.rn > 1;

COMMIT;

-- =============================================================
-- Relatório pós-limpeza (rode separadamente se quiser ver totais)
-- =============================================================
-- SELECT 'tracking' AS tabela, COUNT(*) FROM public.referral_users_tracking
-- UNION ALL SELECT 'withdrawals', COUNT(*) FROM public.referral_withdrawals
-- UNION ALL SELECT 'antifraud',   COUNT(*) FROM public.referral_antifraud_events;
