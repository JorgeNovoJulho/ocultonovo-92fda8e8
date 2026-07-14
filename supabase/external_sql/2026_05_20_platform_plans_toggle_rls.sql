-- ============================================================
-- 2026_05_20_platform_plans_toggle_rls.sql  (CORRIGIDO)
-- Garante que o toggle ATIVO/INATIVO dos planos (Free/Premium/VIP)
-- persista corretamente para o admin master.
--
-- Correção: usa public.is_master_admin() (sem argumento) — assinatura
-- real existente no banco externo. A versão com (uuid) não existe.
-- Idempotente: pode rodar várias vezes no SQL Editor.
-- ============================================================

ALTER TABLE public.oculto_platform_plans ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas
DROP POLICY IF EXISTS "Admins can update platform plans" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "Master can update platform plans" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "Admins can view all platform plans" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "Anyone can view active platform plans" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "Admins can insert platform plans" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "Admins can delete platform plans" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "platform_plans_select_public" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "platform_plans_update_admin" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "platform_plans_insert_admin" ON public.oculto_platform_plans;
DROP POLICY IF EXISTS "platform_plans_delete_admin" ON public.oculto_platform_plans;

-- SELECT: público vê ativos; admin/master vê tudo
CREATE POLICY "platform_plans_select_public"
  ON public.oculto_platform_plans FOR SELECT
  USING (
    is_active = true
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_master_admin()
  );

-- UPDATE
CREATE POLICY "platform_plans_update_admin"
  ON public.oculto_platform_plans FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_master_admin()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.is_master_admin()
  );

-- INSERT
CREATE POLICY "platform_plans_insert_admin"
  ON public.oculto_platform_plans FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.is_master_admin()
  );

-- DELETE
CREATE POLICY "platform_plans_delete_admin"
  ON public.oculto_platform_plans FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_master_admin()
  );

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'oculto_platform_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_platform_plans;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
