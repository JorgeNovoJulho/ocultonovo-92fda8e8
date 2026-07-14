-- =====================================================================
-- 2026-05-28 — Reações (like/dislike) na Bio de Áudio
-- Tabela + RPCs + GRANTs + RLS + realtime + score auxiliar para ranking
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar).
-- =====================================================================

-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.oculto_voice_bio_reactions (
  owner_id    uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  reaction    text        NOT NULL CHECK (reaction IN ('like','dislike')),
  reacted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_oculto_voice_bio_reactions_owner
  ON public.oculto_voice_bio_reactions(owner_id, reaction);

-- 2) GRANTs (Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oculto_voice_bio_reactions TO authenticated;
GRANT ALL ON public.oculto_voice_bio_reactions TO service_role;

-- 3) RLS — só o dono enxerga as próprias linhas; quem reagiu vê a própria.
ALTER TABLE public.oculto_voice_bio_reactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='oculto_voice_bio_reactions' AND policyname='vbr_select_self') THEN
    CREATE POLICY vbr_select_self ON public.oculto_voice_bio_reactions
      FOR SELECT TO authenticated USING (owner_id = auth.uid() OR user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='oculto_voice_bio_reactions' AND policyname='vbr_write_self') THEN
    CREATE POLICY vbr_write_self ON public.oculto_voice_bio_reactions
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid() AND user_id <> owner_id);
  END IF;
END $$;

-- 4) Colunas agregadas em profiles para o algoritmo de ranking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS voice_bio_likes    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_bio_dislikes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_bio_score    integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_voice_bio_score
  ON public.profiles(voice_bio_score DESC);

-- 5) Função/trigger para manter os agregados sincronizados
CREATE OR REPLACE FUNCTION public.tg_sync_voice_bio_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := COALESCE(NEW.owner_id, OLD.owner_id);
  v_likes int;
  v_dislikes int;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE reaction = 'like'),
    COUNT(*) FILTER (WHERE reaction = 'dislike')
  INTO v_likes, v_dislikes
  FROM public.oculto_voice_bio_reactions
  WHERE owner_id = v_owner;

  UPDATE public.profiles
     SET voice_bio_likes    = v_likes,
         voice_bio_dislikes = v_dislikes,
         voice_bio_score    = v_likes - v_dislikes
   WHERE id = v_owner OR user_id = v_owner;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_voice_bio_score ON public.oculto_voice_bio_reactions;
CREATE TRIGGER trg_voice_bio_score
AFTER INSERT OR UPDATE OR DELETE ON public.oculto_voice_bio_reactions
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_voice_bio_score();

-- 6) RPC: reagir (toggle / troca). 1 reação por (owner,user).
CREATE OR REPLACE FUNCTION public.voice_bio_react(p_owner uuid, p_reaction text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF v_uid = p_owner THEN
    RAISE EXCEPTION 'cannot react to own bio';
  END IF;
  IF p_reaction NOT IN ('like','dislike') THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;

  SELECT reaction INTO v_current
    FROM public.oculto_voice_bio_reactions
   WHERE owner_id = p_owner AND user_id = v_uid;

  IF v_current = p_reaction THEN
    DELETE FROM public.oculto_voice_bio_reactions
     WHERE owner_id = p_owner AND user_id = v_uid;
  ELSE
    INSERT INTO public.oculto_voice_bio_reactions(owner_id, user_id, reaction)
    VALUES (p_owner, v_uid, p_reaction)
    ON CONFLICT (owner_id, user_id) DO UPDATE
      SET reaction = EXCLUDED.reaction, reacted_at = now();
  END IF;

  RETURN public.voice_bio_reactions_summary(p_owner);
END;
$$;

-- 7) RPC: resumo (counts + minha reação)
CREATE OR REPLACE FUNCTION public.voice_bio_reactions_summary(p_owner uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_likes int := 0;
  v_dislikes int := 0;
  v_mine text;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE reaction = 'like'),
    COUNT(*) FILTER (WHERE reaction = 'dislike')
  INTO v_likes, v_dislikes
  FROM public.oculto_voice_bio_reactions
  WHERE owner_id = p_owner;

  IF v_uid IS NOT NULL THEN
    SELECT reaction INTO v_mine
      FROM public.oculto_voice_bio_reactions
     WHERE owner_id = p_owner AND user_id = v_uid;
  END IF;

  RETURN json_build_object(
    'likes', v_likes,
    'dislikes', v_dislikes,
    'my_reaction', v_mine
  );
END;
$$;

-- 8) RPC: lista (somente dono enxerga; mostra @username + avatar)
CREATE OR REPLACE FUNCTION public.voice_bio_reactions_list(p_owner uuid, p_reaction text)
RETURNS TABLE (
  user_id    uuid,
  username   text,
  avatar_url text,
  reaction   text,
  reacted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_owner THEN
    RAISE EXCEPTION 'only the bio owner can view reactors';
  END IF;
  IF p_reaction NOT IN ('like','dislike') THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;

  RETURN QUERY
    SELECT r.user_id,
           p.username,
           p.avatar_url,
           r.reaction,
           r.reacted_at
      FROM public.oculto_voice_bio_reactions r
      LEFT JOIN public.profiles p
        ON (p.id = r.user_id OR p.user_id = r.user_id)
     WHERE r.owner_id = p_owner AND r.reaction = p_reaction
     ORDER BY r.reacted_at DESC;
END;
$$;

-- 9) GRANTs nas RPCs
GRANT EXECUTE ON FUNCTION public.voice_bio_react(uuid, text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.voice_bio_reactions_summary(uuid)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.voice_bio_reactions_list(uuid, text)      TO authenticated;

-- 10) Realtime (para sincronizar contadores entre abas/clientes)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.oculto_voice_bio_reactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.oculto_voice_bio_reactions REPLICA IDENTITY FULL;
