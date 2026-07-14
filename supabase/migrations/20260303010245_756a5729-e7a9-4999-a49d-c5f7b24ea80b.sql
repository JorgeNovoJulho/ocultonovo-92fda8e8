-- Harden auth signup triggers so they never block user creation
CREATE OR REPLACE FUNCTION public.auto_assign_admin_master()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'ocultomaster@ocultoswing.com.br' THEN
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (NEW.id, 'admin_master', NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'auto_assign_admin_master failed for %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_base_username TEXT;
  v_counter INTEGER := 0;
BEGIN
  v_base_username := lower(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    '[^a-zA-Z0-9_]',
    '',
    'g'
  ));

  IF v_base_username IS NULL OR length(v_base_username) < 3 THEN
    v_base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  v_username := v_base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base_username || '_' || v_counter;
    IF v_counter > 100 THEN
      v_username := v_base_username || '_' || substr(gen_random_uuid()::text, 1, 6);
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (user_id, name, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    v_username,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user failed for %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;