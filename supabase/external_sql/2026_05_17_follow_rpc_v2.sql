-- ============================================================================
-- FOLLOW SYSTEM — RPCs robustas v2 (idempotente)
-- Cole no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Objetivo: tornar "seguir / deixar de seguir" 100% funcional para QUALQUER
-- usuário, independente de RLS/policies/trigger quebrado.
-- ============================================================================

-- 1) Garantir tabela followers com schema canônico (não destrutivo)
CREATE TABLE IF NOT EXISTS public.followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_followers_follower  ON public.followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following ON public.followers(following_id);

ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

-- Policies permissivas para leitura pública (contadores/listas)
DROP POLICY IF EXISTS "followers_select_public" ON public.followers;
CREATE POLICY "followers_select_public" ON public.followers FOR SELECT USING (true);

-- 2) Resolver profile.id canônico a partir de qualquer id (profile.id OU user_id)
CREATE OR REPLACE FUNCTION public._follow_resolve_profile_id(p_any uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id FROM public.profiles p
   WHERE p.id = p_any OR p.user_id = p_any
   ORDER BY (p.id = p_any) DESC
   LIMIT 1;
$$;

-- 3) RPC principal — toggle follow do usuário autenticado para p_target
CREATE OR REPLACE FUNCTION public.toggle_follow_v2(p_target uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me_uid   uuid := auth.uid();
  v_me_pid   uuid;
  v_target_pid uuid;
  v_existing uuid;
  v_following boolean;
BEGIN
  IF v_me_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_target IS NULL THEN
    RAISE EXCEPTION 'missing_target';
  END IF;

  v_me_pid     := public._follow_resolve_profile_id(v_me_uid);
  v_target_pid := public._follow_resolve_profile_id(p_target);

  IF v_me_pid IS NULL THEN
    RAISE EXCEPTION 'profile_not_found_for_caller';
  END IF;
  IF v_target_pid IS NULL THEN
    RAISE EXCEPTION 'target_profile_not_found';
  END IF;
  IF v_me_pid = v_target_pid THEN
    RAISE EXCEPTION 'cannot_follow_self';
  END IF;

  -- Já segue?
  SELECT id INTO v_existing
    FROM public.followers
   WHERE follower_id = v_me_pid AND following_id = v_target_pid
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    DELETE FROM public.followers WHERE id = v_existing;
    v_following := false;
  ELSE
    BEGIN
      INSERT INTO public.followers (follower_id, following_id)
      VALUES (v_me_pid, v_target_pid);
    EXCEPTION WHEN unique_violation THEN
      -- corrida: alguém já inseriu
      NULL;
    END;
    v_following := true;
  END IF;

  RETURN jsonb_build_object(
    'following', v_following,
    'follower_id', v_me_pid,
    'following_id', v_target_pid
  );
END;
$$;

-- 4) RPC consulta — está seguindo?
CREATE OR REPLACE FUNCTION public.is_following_v2(p_target uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me_uid uuid := auth.uid();
  v_me_pid uuid;
  v_target_pid uuid;
BEGIN
  IF v_me_uid IS NULL OR p_target IS NULL THEN RETURN false; END IF;
  v_me_pid     := public._follow_resolve_profile_id(v_me_uid);
  v_target_pid := public._follow_resolve_profile_id(p_target);
  IF v_me_pid IS NULL OR v_target_pid IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.followers
     WHERE follower_id = v_me_pid AND following_id = v_target_pid
  );
END;
$$;

-- 5) Grants (executável por qualquer usuário autenticado)
REVOKE ALL ON FUNCTION public.toggle_follow_v2(uuid)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_following_v2(uuid)   FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_follow_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_v2(uuid)  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._follow_resolve_profile_id(uuid) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
