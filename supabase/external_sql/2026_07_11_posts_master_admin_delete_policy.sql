-- ============================================================================
-- 2026_07_11_posts_master_admin_delete_policy.sql
-- Permite que admin_master (ocultomaster) apague/atualize qualquer post.
-- Sem isso, o DELETE do master retorna 0 linhas por RLS.
-- Idempotente.
-- ============================================================================

DROP POLICY IF EXISTS "posts_delete_master_admin" ON public.posts;
CREATE POLICY "posts_delete_master_admin"
  ON public.posts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_master','master_admin')
    )
    OR lower(coalesce((auth.jwt() ->> 'email'), '')) = 'ocultomaster@ocultoswing.com.br'
  );

DROP POLICY IF EXISTS "posts_update_master_admin" ON public.posts;
CREATE POLICY "posts_update_master_admin"
  ON public.posts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_master','master_admin')
    )
    OR lower(coalesce((auth.jwt() ->> 'email'), '')) = 'ocultomaster@ocultoswing.com.br'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin_master','master_admin')
    )
    OR lower(coalesce((auth.jwt() ->> 'email'), '')) = 'ocultomaster@ocultoswing.com.br'
  );

NOTIFY pgrst, 'reload schema';
