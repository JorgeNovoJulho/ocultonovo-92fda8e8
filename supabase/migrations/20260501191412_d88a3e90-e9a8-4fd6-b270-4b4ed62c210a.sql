-- ============================================================
-- 1) RPC ensure_my_profile() - corrige bug "Erro ao salvar"
--    Quando o profile não existe no DB (mas existe em auth),
--    cria-o de forma resiliente com SECURITY DEFINER, evitando
--    falhas em todos os botões de ação (like/dislike/save/comment/share).
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_my_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- Backfill user_id if missing
    UPDATE public.profiles SET user_id = v_uid WHERE id = v_profile_id AND (user_id IS NULL OR user_id <> v_uid);
    RETURN v_profile_id;
  END IF;

  -- Create one
  SELECT email, raw_user_meta_data INTO v_email, v_meta FROM auth.users WHERE id = v_uid;
  v_name := COALESCE(NULLIF(v_meta->>'name',''), NULLIF(v_meta->>'full_name',''), split_part(COALESCE(v_email,''), '@', 1), 'Usuário');
  v_username := lower(regexp_replace(COALESCE(NULLIF(v_meta->>'username',''), split_part(COALESCE(v_email,'user'), '@', 1)), '[^a-z0-9_]', '', 'g'));
  IF v_username = '' THEN v_username := 'user_' || substr(v_uid::text, 1, 8); END IF;
  -- Ensure unique username
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_username := v_username || '_' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.profiles (id, user_id, username, full_name, name, avatar_url)
  VALUES (v_uid, v_uid, v_username, v_name, v_name, NULLIF(v_meta->>'avatar_url',''))
  ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_profile() TO authenticated;

-- ============================================================
-- 2) Profile Highlights (destaque dourado pago, 24h)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.oculto_profile_highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  active boolean NOT NULL DEFAULT true,
  payment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oph_profile_active ON public.oculto_profile_highlights(profile_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_oph_expires ON public.oculto_profile_highlights(expires_at) WHERE active = true;

ALTER TABLE public.oculto_profile_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active highlights"
  ON public.oculto_profile_highlights FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own highlight"
  ON public.oculto_profile_highlights FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Users can deactivate their own highlight"
  ON public.oculto_profile_highlights FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage highlights"
  ON public.oculto_profile_highlights FOR ALL
  USING (has_role(auth.uid(), 'admin_master') OR has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin_master') OR has_role(auth.uid(), 'admin'));

-- Function to check if a profile is currently highlighted
CREATE OR REPLACE FUNCTION public.is_profile_highlighted(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.oculto_profile_highlights
    WHERE profile_id = p_profile_id
      AND active = true
      AND expires_at > now()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_profile_highlighted(uuid) TO authenticated, anon;

-- Activate a highlight (called after payment)
CREATE OR REPLACE FUNCTION public.activate_profile_highlight(p_amount numeric, p_payment_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile not found'; END IF;

  -- Deactivate old ones
  UPDATE public.oculto_profile_highlights
  SET active = false
  WHERE profile_id = v_profile_id AND active = true;

  INSERT INTO public.oculto_profile_highlights (profile_id, user_id, amount_paid, payment_id, starts_at, expires_at, active)
  VALUES (v_profile_id, v_uid, COALESCE(p_amount, 0), p_payment_id, now(), now() + interval '24 hours', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.activate_profile_highlight(numeric, text) TO authenticated;

-- Deactivate (toggle off)
CREATE OR REPLACE FUNCTION public.deactivate_profile_highlight()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.oculto_profile_highlights
  SET active = false
  WHERE user_id = v_uid AND active = true;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.deactivate_profile_highlight() TO authenticated;

-- ============================================================
-- 3) Settings: enable_suggested_section + profile_highlight_price
-- ============================================================
INSERT INTO public.system_settings (key, value, description)
VALUES
  ('enable_suggested_section', 'true'::jsonb, 'Mostrar sessão "Pessoas que talvez você conheça" no feed'),
  ('profile_highlight_price', '9.90'::jsonb, 'Preço do destaque dourado de perfil (24h)'),
  ('suggested_section_min_adult_affinities', '5'::jsonb, 'Mínimo de afinidades +18 em comum para sugestão')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4) Substitui get_suggested_users:
--    - retorna mutual_following_count (seguidos em comum)
--    - retorna is_highlighted (destaque dourado ativo)
--    - prioriza usuários com >= N afinidades +18 (configurável)
--    - já filtra seguidos
-- ============================================================
DROP FUNCTION IF EXISTS public.get_suggested_users(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_suggested_users(p_user_id uuid, p_limit integer DEFAULT 15)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  name text,
  username text,
  avatar_url text,
  gender text,
  common_interests integer,
  common_adult_interests integer,
  mutual_following_count integer,
  is_highlighted boolean,
  is_seed boolean,
  is_test_account boolean,
  tags_social text[],
  tags_adult text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_my_social text[];
  v_my_adult text[];
  v_min_adult int;
BEGIN
  SELECT p.id, COALESCE(p.tags_social, '{}'), COALESCE(p.tags_adult, '{}')
  INTO v_profile_id, v_my_social, v_my_adult
  FROM profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE((value)::int, 5) INTO v_min_adult
  FROM system_settings WHERE key = 'suggested_section_min_adult_affinities';
  v_min_adult := COALESCE(v_min_adult, 5);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      p.user_id,
      p.name,
      p.username,
      p.avatar_url,
      p.gender,
      COALESCE(p.is_seed, false) AS is_seed,
      COALESCE(p.is_test_account, false) AS is_test_account,
      COALESCE(p.tags_social, '{}'::text[]) AS tags_social,
      COALESCE(p.tags_adult, '{}'::text[]) AS tags_adult,
      COALESCE(array_length(ARRAY(SELECT unnest(COALESCE(p.tags_social,'{}')) INTERSECT SELECT unnest(v_my_social)), 1), 0)::int AS common_social,
      COALESCE(array_length(ARRAY(SELECT unnest(COALESCE(p.tags_adult,'{}')) INTERSECT SELECT unnest(v_my_adult)), 1), 0)::int AS common_adult
    FROM profiles p
    WHERE p.id <> v_profile_id
      AND p.user_id <> p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM follows f WHERE f.follower_id = v_profile_id AND f.following_id = p.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocked_users b WHERE (b.blocker_id = v_profile_id AND b.blocked_id = p.id)
                                        OR (b.blocker_id = p.id AND b.blocked_id = v_profile_id)
      )
  )
  SELECT
    b.id, b.user_id, b.name, b.username, b.avatar_url, b.gender,
    (b.common_social + b.common_adult) AS common_interests,
    b.common_adult AS common_adult_interests,
    -- mutual followings: pessoas que eu sigo que TAMBÉM seguem o sugerido
    (
      SELECT COUNT(*)::int FROM follows f1
      JOIN follows f2 ON f2.follower_id = f1.following_id
      WHERE f1.follower_id = v_profile_id
        AND f2.following_id = b.id
    ) AS mutual_following_count,
    public.is_profile_highlighted(b.id) AS is_highlighted,
    b.is_seed,
    b.is_test_account,
    b.tags_social,
    b.tags_adult
  FROM base b
  WHERE b.common_adult >= v_min_adult
  ORDER BY
    public.is_profile_highlighted(b.id) DESC,  -- destacados primeiro
    (b.common_social + b.common_adult) DESC,
    random()  -- randomiza dentro do mesmo grupo
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_suggested_users(uuid, integer) TO authenticated;

-- ============================================================
-- 5) Auto-expirar highlights vencidos (chamado pelo SELECT por
--    comodidade — também roda no front via realtime)
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_old_profile_highlights()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oculto_profile_highlights
  SET active = false
  WHERE active = true AND expires_at <= now();
$$;
GRANT EXECUTE ON FUNCTION public.expire_old_profile_highlights() TO authenticated, anon;