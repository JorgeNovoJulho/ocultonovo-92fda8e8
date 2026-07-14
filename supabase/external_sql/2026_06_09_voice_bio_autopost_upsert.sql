-- =====================================================================
-- 2026-06-09 — Fix: "duplicate key value violates unique constraint
-- posts_voice_bio_unique_author_idx" ao trocar a bio em áudio.
--
-- Causa: o trigger tg_voice_bio_autopost sempre INSERIA um novo post
-- 'voice_bio', mas o índice único parcial posts_voice_bio_unique_author_idx
-- permite apenas 1 post por autor. Ao trocar a URL da bio em áudio,
-- o insert falhava.
--
-- Solução: se já existe um post voice_bio para o autor, ATUALIZA esse
-- post com a nova URL/duração; só insere quando não existe nenhum.
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.tg_voice_bio_autopost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  IF NEW.voice_bio_url IS NULL OR NEW.voice_bio_url = '' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_seed, false) = true THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_shadowbanned, false) = true THEN RETURN NEW; END IF;
  IF NEW.banned_at IS NOT NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.voice_bio_url,'') = COALESCE(NEW.voice_bio_url,'') THEN
    RETURN NEW;
  END IF;

  -- Procura post voice_bio existente do autor (qualquer URL).
  SELECT ep.id INTO v_existing_id
    FROM public.posts ep
   WHERE ep.post_type = 'voice_bio'
     AND (ep.author_id = NEW.id OR ep.creator_id = NEW.user_id)
   ORDER BY ep.created_at DESC
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Atualiza in-place para respeitar o índice único parcial.
    UPDATE public.posts
       SET media_url               = NEW.voice_bio_url,
           media_type              = 'audio',
           media_duration_seconds  = NEW.voice_bio_duration,
           content_text            = '🎙️ Atualizei minha bio em áudio! Toque play para ouvir.',
           created_at              = now()
     WHERE id = v_existing_id;
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

NOTIFY pgrst, 'reload schema';
