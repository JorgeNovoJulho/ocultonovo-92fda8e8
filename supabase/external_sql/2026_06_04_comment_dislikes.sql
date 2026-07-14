-- ============================================================
-- COMMENT DISLIKES — 2026-06-04
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- 100% idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.comment_dislikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_dislikes_comment ON public.comment_dislikes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_dislikes_user    ON public.comment_dislikes(user_id);

GRANT SELECT, INSERT, DELETE ON public.comment_dislikes TO authenticated;
GRANT ALL ON public.comment_dislikes TO service_role;

ALTER TABLE public.comment_dislikes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_dislikes' AND policyname='read own/all comment_dislikes') THEN
    -- Qualquer autenticado pode ver os deslikes (contagens públicas)
    CREATE POLICY "read own/all comment_dislikes" ON public.comment_dislikes
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_dislikes' AND policyname='insert own comment_dislikes') THEN
    CREATE POLICY "insert own comment_dislikes" ON public.comment_dislikes
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = comment_dislikes.user_id AND p.user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comment_dislikes' AND policyname='delete own comment_dislikes') THEN
    CREATE POLICY "delete own comment_dislikes" ON public.comment_dislikes
      FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = comment_dislikes.user_id AND p.user_id = auth.uid()
      ));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
