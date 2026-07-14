-- ============================================================================
-- BETA CONTROL — Onda 5: Snapshots de pré-lançamento
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.platform_prelaunch_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,
  note        text,
  created_by  uuid,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_prelaunch_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snap_select_admin" ON public.platform_prelaunch_snapshots;
CREATE POLICY "snap_select_admin" ON public.platform_prelaunch_snapshots
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  );

DROP POLICY IF EXISTS "snap_write_master" ON public.platform_prelaunch_snapshots;
CREATE POLICY "snap_write_master" ON public.platform_prelaunch_snapshots
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  );

-- Cria um snapshot consolidado das configs críticas pré-lançamento
CREATE OR REPLACE FUNCTION public.create_prelaunch_snapshot(p_label text, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_payload jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin_master')
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND coalesce(p.is_admin,false) = true)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'taken_at', now(),
    'runtime', (SELECT to_jsonb(r) FROM public.platform_runtime_settings r LIMIT 1),
    'checklist', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order), '[]'::jsonb)
                    FROM public.platform_launch_checklist c),
    'recent_audit', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
                      FROM (SELECT * FROM public.platform_runtime_audit
                            ORDER BY created_at DESC LIMIT 20) a)
  ) INTO v_payload;

  INSERT INTO public.platform_prelaunch_snapshots (label, note, created_by, payload)
  VALUES (coalesce(nullif(trim(p_label),''),'snapshot'), p_note, auth.uid(), v_payload)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.create_prelaunch_snapshot(text, text) TO authenticated;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_prelaunch_snapshots;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
