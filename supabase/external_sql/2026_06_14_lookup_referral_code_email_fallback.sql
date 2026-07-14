-- =============================================================================
-- 2026-06-14 — lookup_referral_code: fallback por e-mail "USER_DOMINIO_TLD"
--
-- Contexto:
--   Versões antigas do app, quando o perfil ainda não estava carregado,
--   geravam o código de convite a partir do prefixo do e-mail
--   (ex.: gelielelisiario@gmail.com -> GELIELELISIARIO_GMAIL_COM).
--   Esses links já foram enviados para fora e PRECISAM continuar resolvendo.
--
-- Estratégia (em ordem):
--   1) creator_referral_code = UPPER(code)
--   2) lower(username)       = lower(code)
--   3) id / user_id          = code::uuid (se UUID)
--   4) Se o code tem ao menos 3 segmentos separados por "_", interpreta como
--      "<local>_<dominio>_<tld>" -> reconstrói o e-mail e busca em auth.users
--      o user_id correspondente.
--
-- Idempotente. SECURITY DEFINER + search_path. Mantém GRANTs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lookup_referral_code(p_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code   text := btrim(coalesce(p_code, ''));
  v_lower  text := lower(v_code);
  v_upper  text := upper(v_code);
  v_uuid   uuid;
  v_has_referral_col boolean;
  v_row    record;
  v_sql    text;
  v_parts  text[];
  v_email  text;
  v_user_id uuid;
BEGIN
  IF v_code = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_uuid := v_code::uuid;
  EXCEPTION WHEN others THEN
    v_uuid := NULL;
  END;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='profiles'
       AND column_name='creator_referral_code'
  ) INTO v_has_referral_col;

  -- ---------- 1/2/3: lookup canônico ----------
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

  -- ---------- 4: fallback legado por e-mail ----------
  IF v_row IS NULL THEN
    v_parts := string_to_array(v_lower, '_');
    IF array_length(v_parts, 1) >= 3 THEN
      -- "geliel_elisiario_gmail_com" -> tenta dois formatos:
      --   a) local = todos menos os 2 últimos; dominio = penúltimo.tld = último
      v_email := array_to_string(v_parts[1:array_length(v_parts,1)-2], '_')
                 || '@' || v_parts[array_length(v_parts,1)-1]
                 || '.' || v_parts[array_length(v_parts,1)];

      SELECT u.id INTO v_user_id
        FROM auth.users u
       WHERE lower(u.email) = v_email
       LIMIT 1;

      IF v_user_id IS NOT NULL THEN
        EXECUTE
          'SELECT p.id, p.user_id, p.username, p.name,
                  p.avatar_url, p.is_verified, p.bio, p.is_creator'
          || CASE WHEN v_has_referral_col
                  THEN ', p.creator_referral_code'
                  ELSE ', NULL::text AS creator_referral_code' END ||
          ' FROM public.profiles p
             WHERE p.user_id = $1 OR p.id = $1
             LIMIT 1'
        INTO v_row USING v_user_id;
      END IF;
    END IF;
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

-- Backfill: fixa o code legado no perfil do @gelielelisiario para que o link
-- antigo resolva mesmo sem precisar do fallback por e-mail.
UPDATE public.profiles
   SET creator_referral_code = 'GELIELELISIARIO_GMAIL_COM'
 WHERE username = 'gelielelisiario'
   AND coalesce(creator_referral_code, '') = '';

NOTIFY pgrst, 'reload schema';

-- Sanity:
-- SELECT public.lookup_referral_code('GELIELELISIARIO_GMAIL_COM');
-- SELECT public.lookup_referral_code('gelielelisiario');
