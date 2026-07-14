-- ================================================
-- FASE 5.20: CORREÇÕES SIMPLIFICADAS
-- ================================================

-- 1. Remover política duplicada de anonymous_reports
DROP POLICY IF EXISTS "Anyone can create anonymous reports" ON public.anonymous_reports;

-- 2. Corrigir media_share_links
DROP POLICY IF EXISTS "Anyone can update view count" ON public.media_share_links;
CREATE POLICY "System can update view count" ON public.media_share_links
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS idx_follows_following 
  ON public.follows(following_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower 
  ON public.follows(follower_id);

-- 4. Função para incrementar views
CREATE OR REPLACE FUNCTION public.increment_share_view_count(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE media_share_links 
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_link_id;
END;
$$;

-- 5. Função para log de atividade seguro
CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_user_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO engagement_events (user_id, event_type, metadata, created_at)
  VALUES (p_user_id, p_action, p_metadata, now());
EXCEPTION WHEN OTHERS THEN
  -- Silently fail for non-critical logging
  NULL;
END;
$$;