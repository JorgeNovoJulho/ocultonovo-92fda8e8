-- ============================================================================
-- 2026-06-05 — Hotfix
--   (a) profile_likes: schema usa liker_id/liked_id, mas todo o frontend
--       envia sender_id/receiver_id. PostgREST descarta colunas desconhecidas
--       no payload → INSERT roda com liker_id/liked_id NULL → policy
--       liker_id IN (...) falha → "new row violates row-level security policy".
--       Renomeia colunas para sender_id/receiver_id e recria policies.
--   (b) notifications: tabela sem GRANTs explícitos para authenticated →
--       erro "new row violates row-level security policy".
--   (c) Garante GRANTs em ambas para Data API.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

-- (a) profile_likes — renomeia colunas (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profile_likes' AND column_name='liker_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profile_likes' AND column_name='sender_id') THEN
    ALTER TABLE public.profile_likes RENAME COLUMN liker_id TO sender_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profile_likes' AND column_name='liked_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='profile_likes' AND column_name='receiver_id') THEN
    ALTER TABLE public.profile_likes RENAME COLUMN liked_id TO receiver_id;
  END IF;
END $$;

ALTER TABLE public.profile_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can like profiles"               ON public.profile_likes;
DROP POLICY IF EXISTS "Users can unlike profiles"             ON public.profile_likes;
DROP POLICY IF EXISTS "Users can see likes they gave"         ON public.profile_likes;
DROP POLICY IF EXISTS "Users can see likes they received"     ON public.profile_likes;
DROP POLICY IF EXISTS "Users can mark received likes as seen" ON public.profile_likes;
DROP POLICY IF EXISTS "Service role full access"              ON public.profile_likes;

CREATE POLICY "profile_likes_insert_own_sender" ON public.profile_likes
  FOR INSERT TO authenticated
  WITH CHECK (sender_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "profile_likes_delete_own_sender" ON public.profile_likes
  FOR DELETE TO authenticated
  USING (sender_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "profile_likes_select_sender_or_receiver" ON public.profile_likes
  FOR SELECT TO authenticated
  USING (
    sender_id   IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
    OR receiver_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  );

CREATE POLICY "profile_likes_update_received_seen" ON public.profile_likes
  FOR UPDATE TO authenticated
  USING      (receiver_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()))
  WITH CHECK (receiver_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()));

CREATE POLICY "profile_likes_service_role" ON public.profile_likes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_likes TO authenticated;
GRANT ALL ON public.profile_likes TO service_role;

-- (b) notifications — GRANTs ausentes
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Mantém policies existentes; só garante INSERT explícito p/ authenticated
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

NOTIFY pgrst, 'reload schema';
