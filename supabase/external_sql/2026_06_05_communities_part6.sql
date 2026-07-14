-- ============================================================
-- COMUNIDADES OCULTAS — PARTE 6
-- RPC community_update (owner/master) + grants
-- Cole no SQL Editor do Supabase EXTERNO. Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.community_update(
  _community     uuid,
  _title         text     DEFAULT NULL,
  _description   text     DEFAULT NULL,
  _rules         text     DEFAULT NULL,
  _visibility    text     DEFAULT NULL,
  _is_adult      boolean  DEFAULT NULL,
  _accent_color  text     DEFAULT NULL,
  _cover_url     text     DEFAULT NULL,
  _avatar_url    text     DEFAULT NULL,
  _category_id   uuid     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_is_master boolean := public.oculto_is_master(auth.uid());
BEGIN
  IF NOT v_is_master THEN
    SELECT role INTO v_role
      FROM public.oculto_community_members
     WHERE community_id = _community
       AND user_id = auth.uid()
       AND status = 'active';
    IF v_role IS NULL OR v_role <> 'owner' THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  UPDATE public.oculto_communities
     SET title         = COALESCE(NULLIF(_title, ''),       title),
         description   = COALESCE(_description,             description),
         rules         = COALESCE(_rules,                   rules),
         visibility    = COALESCE(NULLIF(_visibility, ''),  visibility),
         is_adult      = COALESCE(_is_adult,                is_adult),
         accent_color  = COALESCE(NULLIF(_accent_color,''), accent_color),
         cover_url     = COALESCE(_cover_url,               cover_url),
         avatar_url    = COALESCE(_avatar_url,              avatar_url),
         category_id   = COALESCE(_category_id,             category_id),
         updated_at    = NOW()
   WHERE id = _community;

  INSERT INTO public.oculto_community_audit_logs (community_id, actor_id, action, payload)
  VALUES (_community, auth.uid(), 'community_update',
          jsonb_build_object(
            'fields', jsonb_strip_nulls(jsonb_build_object(
              'title', _title, 'description', _description, 'rules', _rules,
              'visibility', _visibility, 'is_adult', _is_adult,
              'accent_color', _accent_color, 'cover_url', _cover_url,
              'avatar_url', _avatar_url, 'category_id', _category_id
            ))
          ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.community_update(
  uuid, text, text, text, text, boolean, text, text, text, uuid
) TO authenticated;

-- ============================================================
-- FIM PARTE 6
-- ============================================================
