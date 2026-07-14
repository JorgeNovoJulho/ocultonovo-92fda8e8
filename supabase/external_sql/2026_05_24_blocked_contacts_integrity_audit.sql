-- ============================================================================
-- AUDITORIA DE INTEGRIDADE — blocked_contacts
-- Defensivo: normaliza valores antigos de block_type e reforça CHECK.
-- 100% idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- 1) Normalizar qualquer registro com block_type fora do padrão (legado)
UPDATE public.blocked_contacts
   SET block_type = 'blocked'
 WHERE block_type IS NULL
    OR block_type NOT IN ('blocked','muted');

-- 2) Garantir CHECK constraint (drop+recreate é seguro porque os dados já foram normalizados)
ALTER TABLE public.blocked_contacts
  DROP CONSTRAINT IF EXISTS blocked_contacts_block_type_check;

ALTER TABLE public.blocked_contacts
  ADD CONSTRAINT blocked_contacts_block_type_check
  CHECK (block_type IN ('blocked','muted'));

-- 3) Auditoria: relatar pares onde user_id ou blocked_user_id NÃO existe em profiles.id
--    (apenas SELECT — não deleta nada automaticamente)
SELECT
  bc.id,
  bc.user_id,
  bc.blocked_user_id,
  bc.block_type,
  bc.created_at,
  CASE WHEN p1.id IS NULL THEN 'user_id orfão (não é profiles.id)' END AS user_id_problema,
  CASE WHEN p2.id IS NULL THEN 'blocked_user_id orfão (não é profiles.id)' END AS blocked_user_id_problema
FROM public.blocked_contacts bc
LEFT JOIN public.profiles p1 ON p1.id = bc.user_id
LEFT JOIN public.profiles p2 ON p2.id = bc.blocked_user_id
WHERE p1.id IS NULL OR p2.id IS NULL;

-- 4) Forçar refresh do schema cache PostgREST
NOTIFY pgrst, 'reload schema';
