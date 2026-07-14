-- Função para gerar perfis seed (SECURITY DEFINER ignora RLS)
CREATE OR REPLACE FUNCTION generate_seed_profiles(profiles_data jsonb)
RETURNS TABLE(id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verifica se o usuário é admin_master
  IF NOT has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'Apenas admin_master pode gerar perfis seed';
  END IF;

  -- Insere os perfis e retorna os IDs
  RETURN QUERY
  INSERT INTO profiles (
    user_id, name, username, bio, avatar_url, 
    location_lat, location_lng, is_creator, is_verified, 
    is_online, profile_type, plan_type, is_seed
  )
  SELECT 
    (p->>'user_id')::uuid,
    p->>'name',
    p->>'username',
    p->>'bio',
    p->>'avatar_url',
    (p->>'location_lat')::double precision,
    (p->>'location_lng')::double precision,
    (p->>'is_creator')::boolean,
    (p->>'is_verified')::boolean,
    (p->>'is_online')::boolean,
    p->>'profile_type',
    p->>'plan_type',
    (p->>'is_seed')::boolean
  FROM jsonb_array_elements(profiles_data) AS p
  RETURNING profiles.id, profiles.user_id;
END;
$$;

-- Função para gerar posts seed
CREATE OR REPLACE FUNCTION generate_seed_posts(posts_data jsonb)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'Apenas admin_master pode gerar posts seed';
  END IF;

  RETURN QUERY
  INSERT INTO posts (
    user_id, content_text, media_url, privacy_level, 
    likes_count, comments_count, is_seed
  )
  SELECT 
    (p->>'user_id')::uuid,
    p->>'content_text',
    p->>'media_url',
    p->>'privacy_level',
    (p->>'likes_count')::integer,
    (p->>'comments_count')::integer,
    (p->>'is_seed')::boolean
  FROM jsonb_array_elements(posts_data) AS p
  RETURNING posts.id;
END;
$$;

-- Função para gerar likes seed
CREATE OR REPLACE FUNCTION generate_seed_likes(likes_data jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin_master') THEN
    RAISE EXCEPTION 'Apenas admin_master pode gerar likes seed';
  END IF;

  INSERT INTO post_likes (user_id, post_id, is_seed)
  SELECT 
    (l->>'user_id')::uuid,
    (l->>'post_id')::uuid,
    (l->>'is_seed')::boolean
  FROM jsonb_array_elements(likes_data) AS l;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;