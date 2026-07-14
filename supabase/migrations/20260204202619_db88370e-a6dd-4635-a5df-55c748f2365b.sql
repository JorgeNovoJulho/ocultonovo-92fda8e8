-- =====================================================
-- CORREÇÃO DE SEGURANÇA: search_path em funções críticas
-- Apenas funções que podem ser atualizadas com CREATE OR REPLACE
-- =====================================================

-- 1. is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_staff
    WHERE user_id = auth.uid()
    AND is_active = true
  )
$$;

-- 2. is_admin_master
CREATE OR REPLACE FUNCTION public.is_admin_master()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_staff
    WHERE user_id = auth.uid()
    AND role = 'ADMIN_MASTER'
    AND is_active = true
  )
$$;

-- 3. validate_profile_user_id
CREATE OR REPLACE FUNCTION public.validate_profile_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- 4. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 6. add_user_xp
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer, p_source text DEFAULT 'activity')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET xp = COALESCE(xp, 0) + p_xp
  WHERE id = p_user_id;
END;
$$;

-- 7. calculate_priority_score
CREATE OR REPLACE FUNCTION public.calculate_priority_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.priority_score := CASE
    WHEN NEW.severity = 'critical' THEN 100
    WHEN NEW.severity = 'high' THEN 75
    WHEN NEW.severity = 'medium' THEN 50
    ELSE 25
  END;
  RETURN NEW;
END;
$$;

-- 8. update_profile_timestamp
CREATE OR REPLACE FUNCTION public.update_profile_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;