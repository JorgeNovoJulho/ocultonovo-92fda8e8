-- ============================================================
-- TUTORIAIS — Sistema de tutoriais por categoria
-- Externo: rvybbrkzmboqbhcemqar — rodar no SQL Editor
-- Idempotente
-- ============================================================

-- 1) Tabela principal
CREATE TABLE IF NOT EXISTS public.oculto_tutorials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  description text,
  media_type text NOT NULL DEFAULT 'text' CHECK (media_type IN ('text','image','video','audio','link')),
  media_url text,
  link_url text,
  author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) GRANTs (Data API)
GRANT SELECT ON public.oculto_tutorials TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.oculto_tutorials TO authenticated;
GRANT ALL ON public.oculto_tutorials TO service_role;

-- 3) RLS
ALTER TABLE public.oculto_tutorials ENABLE ROW LEVEL SECURITY;

-- Função para detectar master admin via username (profiles) ou email (auth.users)
CREATE OR REPLACE FUNCTION public.is_master_admin_tutorials(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _uid
        AND lower(regexp_replace(coalesce(p.username, ''), '[^a-zA-Z0-9]', '', 'g')) = 'ocultomaster'
    )
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = _uid
        AND lower(coalesce(u.email, '')) = 'ocultomaster@ocultoswing.com.br'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin_tutorials(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "tutorials_select_all" ON public.oculto_tutorials;
CREATE POLICY "tutorials_select_all" ON public.oculto_tutorials
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "tutorials_master_insert" ON public.oculto_tutorials;
CREATE POLICY "tutorials_master_insert" ON public.oculto_tutorials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin_tutorials(auth.uid()));

DROP POLICY IF EXISTS "tutorials_master_update" ON public.oculto_tutorials;
CREATE POLICY "tutorials_master_update" ON public.oculto_tutorials
  FOR UPDATE TO authenticated
  USING (public.is_master_admin_tutorials(auth.uid()))
  WITH CHECK (public.is_master_admin_tutorials(auth.uid()));

DROP POLICY IF EXISTS "tutorials_master_delete" ON public.oculto_tutorials;
CREATE POLICY "tutorials_master_delete" ON public.oculto_tutorials
  FOR DELETE TO authenticated
  USING (public.is_master_admin_tutorials(auth.uid()));

-- 4) Trigger updated_at
CREATE OR REPLACE FUNCTION public.oculto_tutorials_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oculto_tutorials_touch ON public.oculto_tutorials;
CREATE TRIGGER trg_oculto_tutorials_touch
  BEFORE UPDATE ON public.oculto_tutorials
  FOR EACH ROW EXECUTE FUNCTION public.oculto_tutorials_touch_updated_at();

-- 5) Índices
CREATE INDEX IF NOT EXISTS idx_oculto_tutorials_category ON public.oculto_tutorials(category);
CREATE INDEX IF NOT EXISTS idx_oculto_tutorials_created  ON public.oculto_tutorials(created_at DESC);

-- 6) Realtime
ALTER TABLE public.oculto_tutorials REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'oculto_tutorials';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_tutorials';
  END IF;
END $$;

-- 7) Bucket de mídias (público) — criar via UI ou SQL abaixo
INSERT INTO storage.buckets (id, name, public)
VALUES ('tutoriais', 'tutoriais', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies do bucket
DROP POLICY IF EXISTS "tutoriais_public_read" ON storage.objects;
CREATE POLICY "tutoriais_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'tutoriais');

DROP POLICY IF EXISTS "tutoriais_master_write" ON storage.objects;
CREATE POLICY "tutoriais_master_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tutoriais' AND public.is_master_admin_tutorials(auth.uid()));

DROP POLICY IF EXISTS "tutoriais_master_update" ON storage.objects;
CREATE POLICY "tutoriais_master_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tutoriais' AND public.is_master_admin_tutorials(auth.uid()));

DROP POLICY IF EXISTS "tutoriais_master_delete" ON storage.objects;
CREATE POLICY "tutoriais_master_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tutoriais' AND public.is_master_admin_tutorials(auth.uid()));

NOTIFY pgrst, 'reload schema';
