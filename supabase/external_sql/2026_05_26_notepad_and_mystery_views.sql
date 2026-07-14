-- =====================================================================
-- 2026_05_26 — Bloco de Notas (oculto_user_notes) + Visualizações
-- únicas de Mistérios em Destaque (oculto_post_views).
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- Idempotente — pode rodar várias vezes sem erro.
-- =====================================================================

-- ---------- 1. BLOCO DE NOTAS ----------------------------------------
CREATE TABLE IF NOT EXISTS public.oculto_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text DEFAULT '',
  content text DEFAULT '',
  color_tag text NOT NULL DEFAULT 'default',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oculto_user_notes_user
  ON public.oculto_user_notes (user_id, pinned DESC, updated_at DESC);

-- updated_at trigger reaproveita função padrão se já existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'oculto_user_notes_set_updated_at'
  ) THEN
    CREATE FUNCTION public.oculto_user_notes_set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_user_notes_updated_at ON public.oculto_user_notes;
CREATE TRIGGER trg_oculto_user_notes_updated_at
  BEFORE UPDATE ON public.oculto_user_notes
  FOR EACH ROW EXECUTE FUNCTION public.oculto_user_notes_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_user_notes TO authenticated;
GRANT ALL ON public.oculto_user_notes TO service_role;

ALTER TABLE public.oculto_user_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_own" ON public.oculto_user_notes;
CREATE POLICY "notes_select_own" ON public.oculto_user_notes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notes_insert_own" ON public.oculto_user_notes;
CREATE POLICY "notes_insert_own" ON public.oculto_user_notes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notes_update_own" ON public.oculto_user_notes;
CREATE POLICY "notes_update_own" ON public.oculto_user_notes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notes_delete_own" ON public.oculto_user_notes;
CREATE POLICY "notes_delete_own" ON public.oculto_user_notes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ---------- 2. VIEWS ÚNICOS POR USERNAME -----------------------------
CREATE TABLE IF NOT EXISTS public.oculto_post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oculto_post_views_unique UNIQUE (post_id, username)
);

CREATE INDEX IF NOT EXISTS idx_oculto_post_views_post
  ON public.oculto_post_views (post_id);

GRANT SELECT, INSERT ON public.oculto_post_views TO authenticated;
GRANT SELECT ON public.oculto_post_views TO anon;
GRANT ALL ON public.oculto_post_views TO service_role;

ALTER TABLE public.oculto_post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_views_select_all" ON public.oculto_post_views;
CREATE POLICY "post_views_select_all" ON public.oculto_post_views
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "post_views_insert_auth" ON public.oculto_post_views;
CREATE POLICY "post_views_insert_auth" ON public.oculto_post_views
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- View agregada (count distinto por username já garantido pelo UNIQUE)
CREATE OR REPLACE VIEW public.v_post_view_counts AS
  SELECT post_id, COUNT(*)::bigint AS views_count
  FROM public.oculto_post_views
  GROUP BY post_id;

GRANT SELECT ON public.v_post_view_counts TO anon, authenticated, service_role;
