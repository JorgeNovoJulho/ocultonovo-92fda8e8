-- ============================================================
-- BETA: liberar comentários para todos os usuários autenticados
-- Idempotente — pode rodar várias vezes
-- ============================================================

-- 1) RLS: garantir policies de SELECT/INSERT para authenticated
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read comments" ON public.post_comments;
CREATE POLICY "Anyone can read comments"
  ON public.post_comments FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Users can insert own comments" ON public.post_comments;
CREATE POLICY "Users can insert own comments"
  ON public.post_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = post_comments.user_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own comments" ON public.post_comments;
CREATE POLICY "Users can update own comments"
  ON public.post_comments FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = post_comments.user_id AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own comments" ON public.post_comments;
CREATE POLICY "Users can delete own comments"
  ON public.post_comments FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = post_comments.user_id AND p.user_id = auth.uid()
    )
  );

-- 2) Subir limites de comentário em todos os planos para o beta
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plan_feature_limits'
  ) THEN
    UPDATE public.plan_feature_limits
       SET limit_value = 1000000
     WHERE feature IN ('comment', 'comments');

    INSERT INTO public.plan_feature_limits (plan_type, feature, limit_value)
    SELECT plan, 'comment', 1000000
      FROM (VALUES ('free'),('premium'),('monthly'),('vip')) AS t(plan)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3) Realtime
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.post_comments REPLICA IDENTITY FULL';
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments';
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END;
END $$;
