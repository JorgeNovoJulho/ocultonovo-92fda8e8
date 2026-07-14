-- Função idempotente: preenche avatar/banner do perfil a partir do storage, mapeando por user_id
CREATE OR REPLACE FUNCTION public.repair_profile_assets(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avatar_path text;
  v_banner_path text;
  v_avatar_url text;
  v_banner_url text;
  v_base text := 'https://bpmeahyvubewqmmdxsll.supabase.co/storage/v1/object/public/avatars/';
  v_updated boolean := false;
  v_profile record;
BEGIN
  SELECT id, avatar_url, cover_image_url
    INTO v_profile
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  -- Avatar: <user_id>/avatar.<ext>
  IF v_profile.avatar_url IS NULL OR v_profile.avatar_url = '' THEN
    SELECT name INTO v_avatar_path
    FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND name LIKE p_user_id::text || '/avatar.%'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_avatar_path IS NOT NULL THEN
      v_avatar_url := v_base || v_avatar_path;
    END IF;
  END IF;

  -- Banner: <user_id>/banner.<ext>
  IF v_profile.cover_image_url IS NULL OR v_profile.cover_image_url = '' THEN
    SELECT name INTO v_banner_path
    FROM storage.objects
    WHERE bucket_id = 'avatars'
      AND name LIKE p_user_id::text || '/banner.%'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_banner_path IS NOT NULL THEN
      v_banner_url := v_base || v_banner_path;
    END IF;
  END IF;

  IF v_avatar_url IS NOT NULL OR v_banner_url IS NOT NULL THEN
    UPDATE public.profiles
       SET avatar_url       = COALESCE(v_avatar_url, avatar_url),
           cover_image_url  = COALESCE(v_banner_url, cover_image_url),
           updated_at       = now()
     WHERE id = v_profile.id;
    v_updated := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated,
    'avatar_url', v_avatar_url,
    'banner_url', v_banner_url,
    'profile_id', v_profile.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_profile_assets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_profile_assets(uuid) TO authenticated, service_role;

-- Reparo em massa (admin)
CREATE OR REPLACE FUNCTION public.repair_all_profile_assets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_total int := 0;
  r record;
  v_res jsonb;
BEGIN
  FOR r IN
    SELECT user_id
    FROM public.profiles
    WHERE user_id IS NOT NULL
      AND ((avatar_url IS NULL OR avatar_url = '') OR (cover_image_url IS NULL OR cover_image_url = ''))
  LOOP
    v_total := v_total + 1;
    v_res := public.repair_profile_assets(r.user_id);
    IF (v_res->>'updated')::boolean THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_total, 'updated', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.repair_all_profile_assets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_all_profile_assets() TO service_role;

-- Reparo único agora dos 58 perfis legados
SELECT public.repair_all_profile_assets();