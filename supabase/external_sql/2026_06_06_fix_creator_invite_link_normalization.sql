-- =============================================================================
-- Correção definitiva dos links /creator-invite/:code
-- - Aceita links legados com espaços, pontos, hífens e acentos.
-- - Resolve por creator_referral_code, username, name, id ou user_id.
-- - Garante que novos cadastros consigam vincular a indicação via link_creator_referral.
-- Execute no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.oculto_referral_slug(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        upper(translate(
          btrim(coalesce(p_value, '')),
          'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸáàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
          'AAAAAAEEEEIIIIOOOOOUUUUCNYYaaaaaaeeeeiiiiooooouuuucnyy'
        )),
        '[^A-Z0-9]+', '_', 'g'
      ),
      '^_+|_+$', '', 'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.oculto_referral_compact(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    regexp_replace(
      upper(translate(
        btrim(coalesce(p_value, '')),
        'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝŸáàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'AAAAAAEEEEIIIIOOOOOUUUUCNYYaaaaaaeeeeiiiiooooouuuucnyy'
      )),
      '[^A-Z0-9]+', '', 'g'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw text := btrim(coalesce(p_code, ''));
  v_lower text := lower(btrim(coalesce(p_code, '')));
  v_upper text := upper(btrim(coalesce(p_code, '')));
  v_slug text := public.oculto_referral_slug(p_code);
  v_compact text := public.oculto_referral_compact(p_code);
  v_uuid uuid;
  v_has_referral_col boolean;
  v_row record;
  v_sql text;
BEGIN
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_uuid := v_raw::uuid;
  EXCEPTION WHEN others THEN
    v_uuid := NULL;
  END;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'creator_referral_code'
  ) INTO v_has_referral_col;

  v_sql := '
    SELECT p.id, p.user_id, p.username, p.name,
           p.avatar_url, p.is_verified, p.bio, p.is_creator'
    || CASE WHEN v_has_referral_col
            THEN ', p.creator_referral_code'
            ELSE ', NULL::text AS creator_referral_code' END
    || '
    FROM public.profiles p
    WHERE '
    || CASE WHEN v_has_referral_col THEN '
         upper(coalesce(p.creator_referral_code, '''')) = $2
      OR public.oculto_referral_slug(p.creator_referral_code) = $3
      OR public.oculto_referral_compact(p.creator_referral_code) = $4
      OR ' ELSE '' END
    || '
         lower(coalesce(p.username, '''')) = $1
      OR upper(coalesce(p.username, '''')) = $2
      OR public.oculto_referral_slug(p.username) = $3
      OR public.oculto_referral_compact(p.username) = $4
      OR lower(coalesce(p.name, '''')) = $1
      OR upper(coalesce(p.name, '''')) = $2
      OR public.oculto_referral_slug(p.name) = $3
      OR public.oculto_referral_compact(p.name) = $4'
    || CASE WHEN v_uuid IS NOT NULL
            THEN ' OR p.id = $5 OR p.user_id = $5'
            ELSE '' END
    || '
    ORDER BY '
    || CASE WHEN v_has_referral_col THEN '
      CASE
        WHEN upper(coalesce(p.creator_referral_code, '''')) = $2 THEN 0
        WHEN public.oculto_referral_slug(p.creator_referral_code) = $3 THEN 1
        WHEN public.oculto_referral_compact(p.creator_referral_code) = $4 THEN 2
        WHEN lower(coalesce(p.username, '''')) = $1 THEN 3
        WHEN public.oculto_referral_slug(p.username) = $3 THEN 4
        WHEN public.oculto_referral_compact(p.username) = $4 THEN 5
        WHEN lower(coalesce(p.name, '''')) = $1 THEN 6
        WHEN public.oculto_referral_slug(p.name) = $3 THEN 7
        WHEN public.oculto_referral_compact(p.name) = $4 THEN 8
        ELSE 9
      END,' ELSE '
      CASE
        WHEN lower(coalesce(p.username, '''')) = $1 THEN 0
        WHEN public.oculto_referral_slug(p.username) = $3 THEN 1
        WHEN public.oculto_referral_compact(p.username) = $4 THEN 2
        WHEN lower(coalesce(p.name, '''')) = $1 THEN 3
        WHEN public.oculto_referral_slug(p.name) = $3 THEN 4
        WHEN public.oculto_referral_compact(p.name) = $4 THEN 5
        ELSE 6
      END,' END
    || ' p.updated_at DESC NULLS LAST
    LIMIT 1';

  IF v_uuid IS NOT NULL THEN
    EXECUTE v_sql INTO v_row USING v_lower, v_upper, v_slug, v_compact, v_uuid;
  ELSE
    EXECUTE v_sql INTO v_row USING v_lower, v_upper, v_slug, v_compact;
  END IF;

  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'username', v_row.username,
    'name', v_row.name,
    'avatar_url', v_row.avatar_url,
    'is_verified', coalesce(v_row.is_verified, false),
    'bio', v_row.bio,
    'is_creator', coalesce(v_row.is_creator, true),
    'creator_referral_code', coalesce(v_row.creator_referral_code, public.oculto_referral_slug(coalesce(v_row.username, v_row.name, v_row.id::text)))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_creator_referral(
  p_afilhada_profile_id uuid,
  p_referral_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref json;
  v_madrinha_id uuid;
  v_referral_code text;
  v_existing_id uuid;
  v_new_id uuid;
  v_has_referred_by_col boolean;
BEGIN
  IF p_afilhada_profile_id IS NULL OR btrim(coalesce(p_referral_code, '')) = '' THEN
    RETURN NULL;
  END IF;

  v_ref := public.lookup_referral_code(p_referral_code);
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Código de convite inválido: %', p_referral_code;
  END IF;

  v_madrinha_id := (v_ref->>'id')::uuid;
  v_referral_code := coalesce(v_ref->>'creator_referral_code', public.oculto_referral_slug(p_referral_code));

  IF v_madrinha_id = p_afilhada_profile_id THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.creator_referrals
  WHERE afilhada_id = p_afilhada_profile_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id::text;
  END IF;

  INSERT INTO public.creator_referrals (
    madrinha_id,
    afilhada_id,
    referral_code,
    started_at,
    expires_at,
    is_active,
    total_commission_earned
  ) VALUES (
    v_madrinha_id,
    p_afilhada_profile_id,
    v_referral_code,
    now(),
    now() + interval '12 months',
    true,
    0
  )
  RETURNING id INTO v_new_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'referred_by_creator_id'
  ) INTO v_has_referred_by_col;

  IF v_has_referred_by_col THEN
    UPDATE public.profiles
    SET referred_by_creator_id = coalesce(referred_by_creator_id, v_madrinha_id)
    WHERE id = p_afilhada_profile_id;
  END IF;

  RETURN v_new_id::text;
END;
$$;

REVOKE ALL ON FUNCTION public.oculto_referral_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.oculto_referral_compact(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_referral_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_creator_referral(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.oculto_referral_slug(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.oculto_referral_compact(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_creator_referral(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Testes rápidos após executar:
-- SELECT public.lookup_referral_code('RUMO A NOVA HUMANIDADE - SR.BLACK');
-- SELECT public.lookup_referral_code('RUMO_A_NOVA_HUMANIDADE_SR_BLACK');
-- SELECT public.lookup_referral_code('RUMOANOVAHUMANIDADESRBLACK');