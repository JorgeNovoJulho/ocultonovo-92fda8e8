-- =============================================================================
-- DEFINITIVO: public.lookup_referral_code(text)
-- Resolve /creator-invite/:code para QUALQUER usuário (BOMBOMSEX inclusive).
--
-- Estratégia de lookup, em ordem:
--   1) creator_referral_code = UPPER(code)  (se a coluna existir)
--   2) lower(username)        = lower(code)
--   3) id                     = code::uuid  (se for UUID)
--   4) user_id                = code::uuid  (se for UUID)
--
-- - Idempotente (CREATE OR REPLACE).
-- - SECURITY DEFINER + search_path = public (regra do projeto).
-- - Detecta dinamicamente se profiles.creator_referral_code existe; se não,
--   simplesmente ignora esse critério sem quebrar.
-- - Retorna JSON com os campos consumidos por CreatorInvitePage.tsx.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  text := btrim(coalesce(p_code, ''));
  v_lower text := lower(v_code);
  v_upper text := upper(v_code);
  v_uuid  uuid;
  v_has_referral_col boolean;
  v_row   record;
  v_sql   text;
BEGIN
  IF v_code = '' THEN
    RETURN NULL;
  END IF;

  -- Tenta interpretar como UUID (não falha se não for)
  BEGIN
    v_uuid := v_code::uuid;
  EXCEPTION WHEN others THEN
    v_uuid := NULL;
  END;

  -- A coluna creator_referral_code pode não existir na instância externa.
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name  = 'creator_referral_code'
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
    || CASE WHEN v_has_referral_col
            THEN 'upper(coalesce(p.creator_referral_code, '''')) = $2 OR '
            ELSE '' END
    || 'lower(coalesce(p.username, '''')) = $1'
    || CASE WHEN v_uuid IS NOT NULL
            THEN ' OR p.id = $3 OR p.user_id = $3'
            ELSE '' END
    || '
     ORDER BY '
    || CASE WHEN v_has_referral_col
            THEN 'CASE WHEN upper(coalesce(p.creator_referral_code, '''')) = $2 THEN 0
                       WHEN lower(coalesce(p.username, '''')) = $1            THEN 1
                       ELSE 2 END,'
            ELSE 'CASE WHEN lower(coalesce(p.username, '''')) = $1 THEN 0
                       ELSE 1 END,' END
    || ' p.updated_at DESC NULLS LAST
     LIMIT 1';

  IF v_uuid IS NOT NULL THEN
    EXECUTE v_sql INTO v_row USING v_lower, v_upper, v_uuid;
  ELSE
    EXECUTE v_sql INTO v_row USING v_lower, v_upper;
  END IF;

  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id',                    v_row.id,
    'user_id',               v_row.user_id,
    'username',              v_row.username,
    'name',                  v_row.name,
    'avatar_url',            v_row.avatar_url,
    'is_verified',           coalesce(v_row.is_verified, false),
    'bio',                   v_row.bio,
    'is_creator',            coalesce(v_row.is_creator, true),
    'creator_referral_code', v_row.creator_referral_code
  );
END;
$$;

REVOKE ALL    ON FUNCTION public.lookup_referral_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_referral_code(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Sanity check (opcional — comente se não quiser ver a saída):
-- SELECT public.lookup_referral_code('BOMBOMSEX');
-- SELECT public.lookup_referral_code('bombomsex');
-- SELECT public.lookup_referral_code('BomBomSex');
