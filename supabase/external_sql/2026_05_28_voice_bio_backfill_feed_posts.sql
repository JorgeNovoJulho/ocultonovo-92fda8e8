-- =====================================================================
-- 2026-05-28 — Backfill: cria post de "voice_bio" no feed para TODOS os
-- usuários (não-seed) que já tinham bio em áudio salva mas ainda não
-- têm o post correspondente.
--
-- Também cria um TRIGGER em profiles que garante que, sempre que uma
-- nova voice_bio_url for definida (insert/update), um post automático
-- seja criado — funciona inclusive se a aplicação não chamar o insert
-- (resiliência server-side).
--
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) BACKFILL: cria 1 post por usuário com voice_bio existente,
--    desde que NÃO exista ainda um post (post_type='voice_bio')
--    referenciando aquela mesma media_url.
INSERT INTO public.posts (
  author_id, creator_id, content_text, media_url, media_type,
  post_type, media_duration_seconds, privacy_level, created_at
)
SELECT
  p.id                                                    AS author_id,
  p.user_id                                               AS creator_id,
  '🎙️ Acabei de gravar minha nova bio em áudio! Toque play para ouvir.' AS content_text,
  p.voice_bio_url                                         AS media_url,
  'audio'                                                 AS media_type,
  'voice_bio'                                             AS post_type,
  p.voice_bio_duration                                    AS media_duration_seconds,
  'public'                                                AS privacy_level,
  now()                                                   AS created_at
FROM public.profiles p
WHERE p.voice_bio_url IS NOT NULL
  AND p.voice_bio_url <> ''
  AND COALESCE(p.is_seed, false) = false
  AND COALESCE(p.is_shadowbanned, false) = false
  AND p.banned_at IS NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.posts ep
     WHERE ep.post_type = 'voice_bio'
       AND ep.media_url = p.voice_bio_url
       AND (ep.author_id = p.id OR ep.creator_id = p.user_id)
  );

-- 2) TRIGGER: cria automaticamente o post sempre que voice_bio_url
--    for definida ou alterada (resiliência caso o client falhe).
CREATE OR REPLACE FUNCTION public.tg_voice_bio_autopost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só dispara para perfis reais (não-seed, ativos) e quando há URL nova.
  IF NEW.voice_bio_url IS NULL OR NEW.voice_bio_url = '' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_seed, false) = true THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_shadowbanned, false) = true THEN RETURN NEW; END IF;
  IF NEW.banned_at IS NOT NULL THEN RETURN NEW; END IF;

  -- Se a URL não mudou em UPDATE, não republica.
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.voice_bio_url,'') = COALESCE(NEW.voice_bio_url,'') THEN
    RETURN NEW;
  END IF;

  -- Evita duplicar caso o client já tenha criado o post.
  IF EXISTS (
    SELECT 1 FROM public.posts ep
     WHERE ep.post_type = 'voice_bio'
       AND ep.media_url = NEW.voice_bio_url
       AND (ep.author_id = NEW.id OR ep.creator_id = NEW.user_id)
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.posts (
    author_id, creator_id, content_text, media_url, media_type,
    post_type, media_duration_seconds, privacy_level, created_at
  ) VALUES (
    NEW.id,
    NEW.user_id,
    '🎙️ Acabei de gravar minha nova bio em áudio! Toque play para ouvir.',
    NEW.voice_bio_url,
    'audio',
    'voice_bio',
    NEW.voice_bio_duration,
    'public',
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_bio_autopost ON public.profiles;
CREATE TRIGGER trg_voice_bio_autopost
AFTER INSERT OR UPDATE OF voice_bio_url ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_voice_bio_autopost();

NOTIFY pgrst, 'reload schema';
