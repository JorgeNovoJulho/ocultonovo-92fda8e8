-- ============================================================
-- Comunidades Ocultas — PARTE 20
-- Painel admin global: CRUD categorias + leitura audit logs
-- Idempotente. Executar no Supabase EXTERNO.
-- ============================================================

-- Garante coluna is_active em categorias
ALTER TABLE public.oculto_community_categories
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────
-- 1) CRUD de categorias (apenas master)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_admin_category_upsert(
  _id          uuid,
  _name        text,
  _slug        text,
  _description text,
  _icon        text,
  _sort_order  integer,
  _is_active   boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.oculto_is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.oculto_community_categories(name, slug, description, icon, sort_order, is_active)
    VALUES (
      NULLIF(trim(_name),''),
      NULLIF(trim(_slug),''),
      _description,
      _icon,
      COALESCE(_sort_order, 0),
      COALESCE(_is_active, true)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.oculto_community_categories
       SET name        = COALESCE(NULLIF(trim(_name),''), name),
           slug        = COALESCE(NULLIF(trim(_slug),''), slug),
           description = _description,
           icon        = _icon,
           sort_order  = COALESCE(_sort_order, sort_order),
           is_active   = COALESCE(_is_active, is_active)
     WHERE id = _id
     RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.community_admin_category_upsert(uuid,text,text,text,text,integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.community_admin_category_delete(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.oculto_is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Não deleta se em uso; apenas desativa
  IF EXISTS (SELECT 1 FROM public.oculto_communities WHERE category_id = _id) THEN
    UPDATE public.oculto_community_categories SET is_active = false WHERE id = _id;
  ELSE
    DELETE FROM public.oculto_community_categories WHERE id = _id;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.community_admin_category_delete(uuid) TO authenticated;

-- Lista TUDO (inclui inativas) para o admin
CREATE OR REPLACE FUNCTION public.community_admin_categories_list()
RETURNS SETOF public.oculto_community_categories
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.oculto_is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT * FROM public.oculto_community_categories
    ORDER BY sort_order ASC, name ASC;
END $$;
GRANT EXECUTE ON FUNCTION public.community_admin_categories_list() TO authenticated;

-- ─────────────────────────────────────────────
-- 2) Leitura global de audit logs (apenas master)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.community_admin_audit_logs(_limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  community_title text,
  community_slug text,
  actor_id uuid,
  actor_name text,
  target_user_id uuid,
  target_user_name text,
  action text,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.oculto_is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT
      l.id,
      l.community_id,
      c.title  AS community_title,
      c.slug   AS community_slug,
      l.actor_id,
      COALESCE(pa.display_name, pa.name, pa.username) AS actor_name,
      l.target_user_id,
      COALESCE(pt.display_name, pt.name, pt.username) AS target_user_name,
      l.action,
      l.payload,
      l.created_at
      FROM public.oculto_community_audit_logs l
      LEFT JOIN public.oculto_communities c ON c.id = l.community_id
      LEFT JOIN public.profiles pa ON pa.id = l.actor_id
      LEFT JOIN public.profiles pt ON pt.id = l.target_user_id
     ORDER BY l.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
END $$;
GRANT EXECUTE ON FUNCTION public.community_admin_audit_logs(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- FIM PARTE 20
