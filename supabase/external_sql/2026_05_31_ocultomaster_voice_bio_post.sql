-- =====================================================================
-- 2026-05-31 — Cria/garante post de "voice_bio" no feed principal
-- para o usuário @ocultomaster (master admin).
--
-- - Idempotente: se já existir post voice_bio com a mesma media_url,
--   apenas garante visibilidade pública e atualiza o created_at p/ topo.
-- - Se @ocultomaster ainda não tiver voice_bio_url no profile, o script
--   apenas avisa e não falha.
--
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =====================================================================

DO $$
DECLARE
  v_profile_id  uuid;
  v_user_id     uuid;
  v_url         text;
  v_duration    integer;
  v_existing_id uuid;
BEGIN
  -- 1) Localiza o perfil do @ocultomaster (por username ou e-mail master).
  SELECT p.id, p.user_id, p.voice_bio_url, p.voice_bio_duration
    INTO v_profile_id, v_user_id, v_url, v_duration
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.user_id
   WHERE lower(p.username) = 'ocultomaster'
      OR lower(u.email)    = 'ocultomaster@ocultoswing.com.br'
   ORDER BY (p.voice_bio_url IS NOT NULL) DESC, p.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE NOTICE 'Perfil @ocultomaster não encontrado — nada a fazer.';
    RETURN;
  END IF;

  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'Perfil @ocultomaster (%) ainda não tem voice_bio_url salva. Grave a bio primeiro.', v_profile_id;
    RETURN;
  END IF;

  -- 2) Existe post voice_bio com essa media_url?
  SELECT id
    INTO v_existing_id
    FROM public.posts
   WHERE post_type = 'voice_bio'
     AND media_url = v_url
     AND (author_id = v_profile_id OR creator_id = v_user_id)
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.posts
       SET privacy_level = 'public',
           content_text  = '🎙️ Acabei de gravar minha nova bio em áudio! Toque play para ouvir.',
           media_type    = 'audio',
           media_duration_seconds = COALESCE(v_duration, media_duration_seconds),
           created_at    = now()
     WHERE id = v_existing_id;
    RAISE NOTICE 'Post voice_bio do @ocultomaster atualizado e reordenado no topo (id=%).', v_existing_id;
  ELSE
    INSERT INTO public.posts (
      author_id, creator_id, content_text, media_url, media_type,
      post_type, media_duration_seconds, privacy_level, created_at
    ) VALUES (
      v_profile_id,
      v_user_id,
      '🎙️ Acabei de gravar minha nova bio em áudio! Toque play para ouvir.',
      v_url,
      'audio',
      'voice_bio',
      v_duration,
      'public',
      now()
    )
    RETURNING id INTO v_existing_id;
    RAISE NOTICE 'Post voice_bio do @ocultomaster criado (id=%).', v_existing_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
