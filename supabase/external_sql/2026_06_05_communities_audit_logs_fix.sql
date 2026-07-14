-- =====================================================================
-- FIX: oculto_community_audit_logs — adicionar colunas usadas pelas RPCs
-- (target_user_id, payload) que estavam faltando no schema base.
-- Idempotente: pode ser executado várias vezes sem efeitos colaterais.
-- =====================================================================

ALTER TABLE public.oculto_community_audit_logs
  ADD COLUMN IF NOT EXISTS target_user_id UUID;

ALTER TABLE public.oculto_community_audit_logs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Índices úteis para consultas de auditoria
CREATE INDEX IF NOT EXISTS idx_occ_audit_target_user
  ON public.oculto_community_audit_logs(target_user_id);

CREATE INDEX IF NOT EXISTS idx_occ_audit_created
  ON public.oculto_community_audit_logs(created_at DESC);
