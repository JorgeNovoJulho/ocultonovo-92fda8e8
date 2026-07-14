-- =============================================================
-- HOTFIX — discovery_approach_user (schema + RPC defensivos)
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- Idempotente — pode rodar várias vezes
-- =============================================================

-- 1) Garante a tabela base de matches ----------------------------
CREATE TABLE IF NOT EXISTS public.looking_now_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  distance_km numeric(10,2) NOT NULL DEFAULT 0,
  matched_at timestamptz DEFAULT now(),
  user1_chat_started boolean DEFAULT false,
  user2_chat_started boolean DEFAULT false,
  is_expired boolean DEFAULT false,
  is_super_match boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.looking_now_matches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.looking_now_matches
  ADD COLUMN IF NOT EXISTS is_super_match boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_expired boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user1_chat_started boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS user2_chat_started boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2) Constraint única (user1_id, user2_id) para ON CONFLICT -----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'looking_now_matches'
      AND c.contype = 'u'
      AND (
        c.conname = 'looking_now_matches_user1_user2_key'
        OR pg_get_constraintdef(c.oid) = 'UNIQUE (user1_id, user2_id)'
      )
  ) THEN
    BEGIN
      ALTER TABLE public.looking_now_matches
        ADD CONSTRAINT looking_now_matches_user1_user2_key
        UNIQUE (user1_id, user2_id);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      NULL;
    END;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'looking_now_matches'
      AND policyname = 'Users can view their matches'
  ) THEN
    CREATE POLICY "Users can view their matches"
      ON public.looking_now_matches
      FOR SELECT
      USING (
        user1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        OR user2_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'looking_now_matches'
      AND policyname = 'Users can update their matches'
  ) THEN
    CREATE POLICY "Users can update their matches"
      ON public.looking_now_matches
      FOR UPDATE
      USING (
        user1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
        OR user2_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'looking_now_matches'
      AND policyname = 'Service role inserts matches'
  ) THEN
    CREATE POLICY "Service role inserts matches"
      ON public.looking_now_matches
      FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.touch_looking_now_matches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_looking_now_matches_updated_at'
  ) THEN
    CREATE TRIGGER update_looking_now_matches_updated_at
      BEFORE UPDATE ON public.looking_now_matches
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_looking_now_matches_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.looking_now_matches;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN invalid_parameter_value THEN NULL;
  END;
END$$;

-- 3) Colunas defensivas em oculto_discovery_likes ---------------
ALTER TABLE public.oculto_discovery_likes
  ADD COLUMN IF NOT EXISTS match_id   uuid,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

-- 4) RPC discovery_approach_user — recriada de forma defensiva --
DROP FUNCTION IF EXISTS public.discovery_approach_user(uuid);

CREATE OR REPLACE FUNCTION public.discovery_approach_user(
  p_target_profile_id uuid
) RETURNS TABLE (ok boolean, reason text, matched boolean, match_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := public._discovery_my_profile_id();
  v_reciprocal_id uuid;
  v_match_id uuid;
  v_user1 uuid;
  v_user2 uuid;
  v_blocked boolean := false;
BEGIN
  IF v_me IS NULL THEN
    RETURN QUERY SELECT false, 'auth_required'::text, false, NULL::uuid; RETURN;
  END IF;
  IF p_target_profile_id IS NULL OR p_target_profile_id = v_me THEN
    RETURN QUERY SELECT false, 'invalid_target'::text, false, NULL::uuid; RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'blocked_contacts'
  ) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.blocked_contacts bc
      WHERE (bc.user_id = v_me AND bc.blocked_user_id = p_target_profile_id)
         OR (bc.user_id = p_target_profile_id AND bc.blocked_user_id = v_me)
    ) INTO v_blocked;
  END IF;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::text, false, NULL::uuid; RETURN;
  END IF;

  -- 1) Registra/atualiza interesse outgoing
  INSERT INTO public.oculto_discovery_likes
    (user_profile_id, target_profile_id, source, status)
  VALUES (v_me, p_target_profile_id, 'explorar_misteriosos', 'pending')
  ON CONFLICT (user_profile_id, target_profile_id, source)
  DO UPDATE SET status = CASE
    WHEN public.oculto_discovery_likes.status = 'matched' THEN 'matched'
    ELSE 'pending'
  END;

  -- 2) Há reciprocidade?
  SELECT id INTO v_reciprocal_id
    FROM public.oculto_discovery_likes
   WHERE user_profile_id = p_target_profile_id
     AND target_profile_id = v_me
     AND source = 'explorar_misteriosos'
     AND status IN ('pending', 'matched')
   LIMIT 1;

  IF v_reciprocal_id IS NULL THEN
    RETURN QUERY SELECT true, 'pending'::text, false, NULL::uuid; RETURN;
  END IF;

  -- 3) Cria/atualiza match
  v_user1 := LEAST(v_me, p_target_profile_id);
  v_user2 := GREATEST(v_me, p_target_profile_id);

  SELECT id INTO v_match_id
    FROM public.looking_now_matches
   WHERE user1_id = v_user1 AND user2_id = v_user2
   LIMIT 1;

  IF v_match_id IS NULL THEN
    INSERT INTO public.looking_now_matches
      (user1_id, user2_id, distance_km, matched_at, is_super_match, is_expired)
    VALUES (v_user1, v_user2, 0, now(), false, false)
    ON CONFLICT (user1_id, user2_id) DO UPDATE
      SET matched_at = EXCLUDED.matched_at,
          is_expired = false
    RETURNING id INTO v_match_id;
  ELSE
    UPDATE public.looking_now_matches
       SET is_expired = false,
           matched_at = now()
     WHERE id = v_match_id;
  END IF;

  -- 4) Atualiza ambos os lados em oculto_discovery_likes
  UPDATE public.oculto_discovery_likes
     SET status     = 'matched',
         matched_at = now(),
         match_id   = v_match_id
   WHERE source = 'explorar_misteriosos'
     AND ((user_profile_id = v_me AND target_profile_id = p_target_profile_id)
       OR (user_profile_id = p_target_profile_id AND target_profile_id = v_me));

  RETURN QUERY SELECT true, 'matched'::text, true, v_match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.discovery_approach_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_approach_user(uuid) TO authenticated;
