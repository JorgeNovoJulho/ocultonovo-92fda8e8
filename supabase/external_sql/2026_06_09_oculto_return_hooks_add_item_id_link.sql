-- ============================================================
-- Fix: trigger trg_oculto_hook_like quebrava com
--   ERROR: column "item_id" does not exist
-- Causa: _oculto_hook_upsert insere em (link, item_id), mas a
-- tabela oculto_return_hooks foi criada com (action_url, target_id).
-- Solução: adiciona as colunas faltantes de forma idempotente e
-- copia valores existentes para manter compatibilidade.
-- Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

ALTER TABLE public.oculto_return_hooks
  ADD COLUMN IF NOT EXISTS item_id uuid,
  ADD COLUMN IF NOT EXISTS link    text;

-- Sincroniza valores antigos (se existirem) com os novos campos
UPDATE public.oculto_return_hooks
   SET item_id = COALESCE(item_id, target_id),
       link    = COALESCE(link,    action_url)
 WHERE (item_id IS NULL AND target_id   IS NOT NULL)
    OR (link    IS NULL AND action_url IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_oculto_return_hooks_item
  ON public.oculto_return_hooks(item_id)
  WHERE item_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
