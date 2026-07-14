
-- Fix handle_new_user: use extensions.gen_random_uuid() since search_path is empty
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username TEXT;
  v_base_username TEXT;
  v_counter INTEGER := 0;
BEGIN
  v_base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'))
  );
  
  IF length(v_base_username) < 3 THEN
    v_base_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;
  
  v_username := v_base_username;
  
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := v_base_username || '_' || v_counter;
    IF v_counter > 100 THEN
      v_username := v_base_username || '_' || substr(extensions.gen_random_uuid()::text, 1, 6);
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

-- Also fix the double-quoted max_users_limit if it exists
UPDATE public.system_settings 
SET value = to_jsonb(10000)
WHERE key = 'max_users_limit';
