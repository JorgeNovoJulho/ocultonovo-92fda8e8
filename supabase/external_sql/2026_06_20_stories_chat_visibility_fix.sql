-- =====================================================================
-- 2026-06-20 — Correção: stories + conversas do chat visíveis
-- Banco EXTERNO (rvybbrkzmboqbhcemqar). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) View pública resiliente de perfis: não quebra se colunas opcionais
--    ainda não existirem em alguma instância do banco externo.
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_public_profiles CASCADE;

DO $$
DECLARE
  select_list text;
  where_list text := 'TRUE';
BEGIN
  SELECT string_agg(
    CASE
      WHEN c.column_name IS NOT NULL THEN format('%s AS %I', v.expr, v.name)
      ELSE v.fallback
    END,
    ', '
    ORDER BY v.ord
  )
  INTO select_list
  FROM (VALUES
    (1,  'id',                                      'id',                                      'NULL::uuid AS id'),
    (2,  'user_id',                                 'user_id',                                 'NULL::uuid AS user_id'),
    (3,  'username',                                'username',                                'NULL::text AS username'),
    (4,  'name',                                    'name',                                    'NULL::text AS name'),
    (5,  'avatar_url',                              'avatar_url',                              'NULL::text AS avatar_url'),
    (6,  'cover_image_url',                         'cover_image_url',                         'NULL::text AS cover_image_url'),
    (7,  'bio',                                     'bio',                                     'NULL::text AS bio'),
    (8,  'voice_bio_url',                           'voice_bio_url',                           'NULL::text AS voice_bio_url'),
    (9,  'voice_bio_duration',                      'voice_bio_duration',                      'NULL::integer AS voice_bio_duration'),
    (10, 'is_online',                               'is_online',                               'false::boolean AS is_online'),
    (11, 'last_seen',                               'last_seen',                               'NULL::timestamptz AS last_seen'),
    (12, 'is_verified',                             'is_verified',                             'false::boolean AS is_verified'),
    (13, 'is_verified_couple',                      'is_verified_couple',                      'false::boolean AS is_verified_couple'),
    (14, 'is_oculto_verified',                      'is_oculto_verified',                      'false::boolean AS is_oculto_verified'),
    (15, 'profile_type',                            'profile_type',                            '''single''::text AS profile_type'),
    (16, 'plan_type',                               'plan_type',                               '''free''::text AS plan_type'),
    (17, 'is_creator',                              'is_creator',                              'false::boolean AS is_creator'),
    (18, 'is_vip',                                  'is_vip',                                  'false::boolean AS is_vip'),
    (19, 'vip_tier',                                'vip_tier',                                'NULL::text AS vip_tier'),
    (20, 'is_lifetime',                             'is_lifetime',                             'false::boolean AS is_lifetime'),
    (21, 'is_pioneiro',                             'is_pioneiro',                             'false::boolean AS is_pioneiro'),
    (22, 'is_seed',                                 'is_seed',                                 'false::boolean AS is_seed'),
    (23, 'is_private',                              'is_private',                              'false::boolean AS is_private'),
    (24, 'is_invisible',                            'is_invisible',                            'false::boolean AS is_invisible'),
    (25, 'gender',                                  'gender',                                  'NULL::text AS gender'),
    (26, 'hide_age',                                'hide_age',                                'false::boolean AS hide_age'),
    (27, 'hide_location',                           'hide_location',                           'false::boolean AS hide_location'),
    (28, 'is_looking_now',                          'is_looking_now',                          'false::boolean AS is_looking_now'),
    (29, 'looking_now_since',                       'looking_now_since',                       'NULL::timestamptz AS looking_now_since'),
    (30, 'has_ghost_mode',                          'has_ghost_mode',                          'false::boolean AS has_ghost_mode'),
    (31, 'is_ghost_active',                         'is_ghost_active',                         'false::boolean AS is_ghost_active'),
    (32, 'show_on_radar',                           'show_on_radar',                           'true::boolean AS show_on_radar'),
    (33, 'show_online_status',                      'show_online_status',                      'true::boolean AS show_online_status'),
    (34, 'account_status',                          'account_status',                          '''active''::text AS account_status'),
    (35, 'is_anonymized',                           'is_anonymized',                           'false::boolean AS is_anonymized'),
    (36, 'is_shadowbanned',                         'is_shadowbanned',                         'false::boolean AS is_shadowbanned'),
    (37, 'accept_super_dm',                         'accept_super_dm',                         'false::boolean AS accept_super_dm'),
    (38, 'min_super_dm_price',                      'min_super_dm_price',                      'NULL::numeric AS min_super_dm_price'),
    (39, 'super_dm_auto_reply_enabled',             'super_dm_auto_reply_enabled',             'false::boolean AS super_dm_auto_reply_enabled'),
    (40, 'super_dm_estimated_response_hours',       'super_dm_estimated_response_hours',       'NULL::integer AS super_dm_estimated_response_hours'),
    (41, 'ranking_anonymity',                       'ranking_anonymity',                       'false::boolean AS ranking_anonymity'),
    (42, 'show_fan_ranking',                        'show_fan_ranking',                        'true::boolean AS show_fan_ranking'),
    (43, 'tags_social',                             'tags_social',                             'NULL::text[] AS tags_social'),
    (44, 'tags_adult',                              'tags_adult',                              'NULL::text[] AS tags_adult'),
    (45, 'connection_mode',                         'connection_mode',                         'NULL::text AS connection_mode'),
    (46, 'pair_photos',                             'pair_photos',                             'NULL::text[] AS pair_photos'),
    (47, 'pair_bio',                                'pair_bio',                                'NULL::text AS pair_bio'),
    (48, 'partner1_name',                           'partner1_name',                           'NULL::text AS partner1_name'),
    (49, 'partner2_name',                           'partner2_name',                           'NULL::text AS partner2_name'),
    (50, 'location_lat',                            'location_lat',                            'NULL::numeric AS location_lat'),
    (51, 'location_lng',                            'location_lng',                            'NULL::numeric AS location_lng'),
    (52, 'created_at',                              'created_at',                              'NULL::timestamptz AS created_at'),
    (53, 'updated_at',                              'updated_at',                              'NULL::timestamptz AS updated_at')
  ) AS v(ord, name, expr, fallback)
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'profiles'
   AND c.column_name = v.name;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='account_status') THEN
    where_list := where_list || ' AND (account_status IS NULL OR account_status = ''active'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_anonymized') THEN
    where_list := where_list || ' AND COALESCE(is_anonymized, false) = false';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_shadowbanned') THEN
    where_list := where_list || ' AND COALESCE(is_shadowbanned, false) = false';
  END IF;

  EXECUTE 'CREATE VIEW public.v_public_profiles WITH (security_invoker=on) AS SELECT ' || select_list || ' FROM public.profiles WHERE ' || where_list;
END $$;

GRANT SELECT ON public.v_public_profiles TO authenticated;
REVOKE ALL ON public.v_public_profiles FROM anon;

DROP VIEW IF EXISTS public.v_my_profile CASCADE;

DO $$
DECLARE
  where_expr text := 'id = auth.uid()';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) THEN
    where_expr := '(user_id = auth.uid() OR id = auth.uid())';
  END IF;

  EXECUTE 'CREATE VIEW public.v_my_profile WITH (security_invoker=on) AS SELECT * FROM public.profiles WHERE ' || where_expr;
END $$;

GRANT SELECT ON public.v_my_profile TO authenticated;
REVOKE ALL ON public.v_my_profile FROM anon;

-- ---------------------------------------------------------------------
-- 2) GRANTs do Data API para chat/stories.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_likes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_dislikes TO authenticated;

GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.conversation_participants TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.posts TO service_role;
GRANT ALL ON public.story_views TO service_role;
GRANT ALL ON public.story_likes TO service_role;
GRANT ALL ON public.story_dislikes TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_dislikes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3) Helpers seguros para mapear auth.users.id <-> profiles.id/user_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_uid_matches(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_user_id boolean := false;
  matched boolean := false;
BEGIN
  IF _id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF _id = auth.uid() THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) INTO has_user_id;

  IF has_user_id THEN
    EXECUTE '
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.user_id = auth.uid()
          AND ($1 = p.id OR $1 = p.user_id)
      )'
    INTO matched
    USING _id;
  ELSE
    EXECUTE '
      SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND $1 = p.id
      )'
    INTO matched
    USING _id;
  END IF;

  RETURN COALESCE(matched, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.owns_profile_id(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.chat_uid_matches(_profile_id);
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND (
        cp.user_id = auth.uid()
        OR public.chat_uid_matches(cp.user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_message_blocked_between(_sender_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_user_id boolean := false;
  me_ids uuid[] := ARRAY[auth.uid()];
  sender_ids uuid[] := ARRAY[_sender_id];
  extra uuid[] := ARRAY[]::uuid[];
  blocked boolean := false;
BEGIN
  IF auth.uid() IS NULL OR _sender_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) INTO has_user_id;

  IF has_user_id THEN
    EXECUTE '
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM (
        SELECT p.id AS x FROM public.profiles p WHERE p.user_id = auth.uid() OR p.id = auth.uid()
        UNION
        SELECT p.user_id AS x FROM public.profiles p WHERE p.user_id = auth.uid() OR p.id = auth.uid()
      ) s
      WHERE x IS NOT NULL'
    INTO extra;
  ELSE
    EXECUTE '
      SELECT COALESCE(array_agg(DISTINCT p.id), ARRAY[]::uuid[])
      FROM public.profiles p
      WHERE p.id = auth.uid()'
    INTO extra;
  END IF;
  SELECT ARRAY(SELECT DISTINCT v FROM unnest(me_ids || COALESCE(extra, ARRAY[]::uuid[])) AS t(v) WHERE v IS NOT NULL) INTO me_ids;

  IF has_user_id THEN
    EXECUTE '
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM (
        SELECT p.id AS x FROM public.profiles p WHERE p.user_id = $1 OR p.id = $1
        UNION
        SELECT p.user_id AS x FROM public.profiles p WHERE p.user_id = $1 OR p.id = $1
      ) s
      WHERE x IS NOT NULL'
    INTO extra
    USING _sender_id;
  ELSE
    EXECUTE '
      SELECT COALESCE(array_agg(DISTINCT p.id), ARRAY[]::uuid[])
      FROM public.profiles p
      WHERE p.id = $1'
    INTO extra
    USING _sender_id;
  END IF;
  SELECT ARRAY(SELECT DISTINCT v FROM unnest(sender_ids || COALESCE(extra, ARRAY[]::uuid[])) AS t(v) WHERE v IS NOT NULL) INTO sender_ids;

  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_contacts bc
    WHERE bc.block_type = 'blocked'
      AND (
        (bc.user_id = ANY(me_ids) AND bc.blocked_user_id = ANY(sender_ids))
        OR
        (bc.user_id = ANY(sender_ids) AND bc.blocked_user_id = ANY(me_ids))
      )
  ) INTO blocked;

  RETURN COALESCE(blocked, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.chat_uid_matches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_profile_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_message_blocked_between(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) RPC canônica para abrir/criar conversa entre dois usuários.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_or_create_conversation(uuid, uuid);

CREATE FUNCTION public.get_or_create_conversation(p1 uuid, p2 uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u1 uuid;
  u2 uuid;
  cid uuid;
  has_profile_user_id boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'user_id'
  ) INTO has_profile_user_id;

  IF has_profile_user_id THEN
    EXECUTE 'SELECT COALESCE((SELECT user_id FROM public.profiles WHERE id = $1 OR user_id = $1 LIMIT 1), $1)'
      INTO u1
      USING p1;
    EXECUTE 'SELECT COALESCE((SELECT user_id FROM public.profiles WHERE id = $1 OR user_id = $1 LIMIT 1), $1)'
      INTO u2
      USING p2;
  ELSE
    u1 := p1;
    u2 := p2;
  END IF;

  IF u1 IS NULL OR u2 IS NULL THEN
    RAISE EXCEPTION 'invalid participants';
  END IF;

  SELECT cp1.conversation_id
  INTO cid
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
  WHERE cp1.user_id IN (u1, p1)
    AND cp2.user_id IN (u2, p2)
  LIMIT 1;

  IF cid IS NOT NULL THEN
    RETURN cid;
  END IF;

  INSERT INTO public.conversations DEFAULT VALUES RETURNING id INTO cid;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (cid, u1), (cid, u2);

  RETURN cid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Policies do chat.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_select_participants" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert_authenticated" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_participants" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete_participants" ON public.conversations;

CREATE POLICY "conversations_select_participants"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_participant(id));

CREATE POLICY "conversations_insert_authenticated"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "conversations_update_participants"
  ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(id))
  WITH CHECK (public.is_conversation_participant(id));

CREATE POLICY "conversations_delete_participants"
  ON public.conversations FOR DELETE TO authenticated
  USING (public.is_conversation_participant(id));

DROP POLICY IF EXISTS "conversation_participants_select_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_insert_participant" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_update_participant" ON public.conversation_participants;
DROP POLICY IF EXISTS "conversation_participants_delete_participant" ON public.conversation_participants;

CREATE POLICY "conversation_participants_select_own"
  ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id) OR public.chat_uid_matches(user_id));

CREATE POLICY "conversation_participants_insert_participant"
  ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (public.chat_uid_matches(user_id) OR public.is_conversation_participant(conversation_id));

CREATE POLICY "conversation_participants_update_participant"
  ON public.conversation_participants FOR UPDATE TO authenticated
  USING (public.chat_uid_matches(user_id))
  WITH CHECK (public.chat_uid_matches(user_id));

CREATE POLICY "conversation_participants_delete_participant"
  ON public.conversation_participants FOR DELETE TO authenticated
  USING (public.chat_uid_matches(user_id));

DROP POLICY IF EXISTS "messages_select_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_update_participants" ON public.messages;
DROP POLICY IF EXISTS "messages_delete_sender" ON public.messages;

CREATE POLICY "messages_select_participants"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    AND (public.owns_profile_id(sender_id) OR NOT public.is_message_blocked_between(sender_id))
  );

CREATE POLICY "messages_insert_sender"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.owns_profile_id(sender_id) AND public.is_conversation_participant(conversation_id));

CREATE POLICY "messages_update_participants"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.is_conversation_participant(conversation_id))
  WITH CHECK (public.is_conversation_participant(conversation_id));

CREATE POLICY "messages_delete_sender"
  ON public.messages FOR DELETE TO authenticated
  USING (public.owns_profile_id(sender_id));

-- ---------------------------------------------------------------------
-- 6) Stories: leitura dos stories e interações do próprio usuário.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "stories_select_public_recent" ON public.posts;
CREATE POLICY "stories_select_public_recent"
  ON public.posts FOR SELECT TO authenticated
  USING (
    COALESCE(is_hidden, false) = false
    AND COALESCE(privacy_level, 'public') = 'public'
    AND (COALESCE(is_flash, false) = true OR post_type = 'story')
  );

CREATE OR REPLACE FUNCTION public.story_view_register(p_story_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted boolean := false;
  affected integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'inserted', false);
  END IF;

  INSERT INTO public.story_views (story_id, viewer_id)
  VALUES (p_story_id, auth.uid())
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS affected = ROW_COUNT;
  inserted := affected > 0;
  RETURN jsonb_build_object('ok', true, 'inserted', inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.story_view_register(uuid) TO authenticated;

DROP POLICY IF EXISTS "story_views_select_own_or_author" ON public.story_views;
DROP POLICY IF EXISTS "story_views_insert_own" ON public.story_views;
DROP POLICY IF EXISTS "story_likes_select_authenticated" ON public.story_likes;
DROP POLICY IF EXISTS "story_likes_insert_own" ON public.story_likes;
DROP POLICY IF EXISTS "story_likes_delete_own" ON public.story_likes;
DROP POLICY IF EXISTS "story_dislikes_select_authenticated" ON public.story_dislikes;
DROP POLICY IF EXISTS "story_dislikes_insert_own" ON public.story_dislikes;
DROP POLICY IF EXISTS "story_dislikes_delete_own" ON public.story_dislikes;

CREATE POLICY "story_views_select_own_or_author"
  ON public.story_views FOR SELECT TO authenticated
  USING (
    public.chat_uid_matches(viewer_id)
    OR EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = story_views.story_id
        AND (
          public.chat_uid_matches(p.creator_id)
          OR public.chat_uid_matches(p.author_id)
        )
    )
  );

CREATE POLICY "story_views_insert_own"
  ON public.story_views FOR INSERT TO authenticated
  WITH CHECK (public.chat_uid_matches(viewer_id));

CREATE POLICY "story_likes_select_authenticated"
  ON public.story_likes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "story_likes_insert_own"
  ON public.story_likes FOR INSERT TO authenticated
  WITH CHECK (public.chat_uid_matches(user_id));

CREATE POLICY "story_likes_delete_own"
  ON public.story_likes FOR DELETE TO authenticated
  USING (public.chat_uid_matches(user_id));

CREATE POLICY "story_dislikes_select_authenticated"
  ON public.story_dislikes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "story_dislikes_insert_own"
  ON public.story_dislikes FOR INSERT TO authenticated
  WITH CHECK (public.chat_uid_matches(user_id));

CREATE POLICY "story_dislikes_delete_own"
  ON public.story_dislikes FOR DELETE TO authenticated
  USING (public.chat_uid_matches(user_id));

-- ---------------------------------------------------------------------
-- 7) Realtime para chat/stories.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'messages', 'conversations', 'conversation_participants',
    'posts', 'story_views', 'story_likes', 'story_dislikes'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';