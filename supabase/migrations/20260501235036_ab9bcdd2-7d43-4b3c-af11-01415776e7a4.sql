-- Fix ensure_my_profile: profiles table does not have full_name column.
-- The previous version raised "column full_name does not exist" when creating
-- a missing profile, which surfaced as an opaque error when saving posts.
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_email text;
  v_meta jsonb;
  v_username text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Try by user_id first
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NOT NULL THEN RETURN v_profile_id; END IF;

  -- Try by id == auth uid
  SELECT id INTO v_profile_id FROM public.profiles WHERE id = v_uid LIMIT 1;
  IF v_profile_id IS NOT NULL THEN
    UPDATE public.profiles
       SET user_id = v_uid
     WHERE id = v_profile_id
       AND (user_id IS NULL OR user_id <> v_uid);
    RETURN v_profile_id;
  END IF;

  -- Create one — use only existing columns (no full_name)
  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = v_uid;
  v_name := COALESCE(
    NULLIF(v_meta->>'name',''),
    NULLIF(v_meta->>'full_name',''),
    split_part(COALESCE(v_email,''), '@', 1),
    'Usuário'
  );
  v_username := lower(regexp_replace(
    COALESCE(NULLIF(v_meta->>'username',''), split_part(COALESCE(v_email,'user'), '@', 1)),
    '[^a-z0-9_]', '', 'g'
  ));
  IF v_username = '' THEN v_username := 'user_' || substr(v_uid::text, 1, 8); END IF;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_username := v_username || '_' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.profiles (id, user_id, username, name, avatar_url)
  VALUES (v_uid, v_uid, v_username, v_name, NULLIF(v_meta->>'avatar_url',''))
  ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$function$;