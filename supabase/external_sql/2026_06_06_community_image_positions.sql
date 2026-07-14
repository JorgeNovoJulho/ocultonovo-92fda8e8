-- =====================================================================
-- Comunidades — Posição customizada do banner (cover) e avatar
-- Permite ao dono "arrastar" a foto para enquadrar melhor.
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Colunas na tabela base oculto_communities (0-100, default 50 = centro)
ALTER TABLE public.oculto_communities
  ADD COLUMN IF NOT EXISTS cover_position_x  smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cover_position_y  smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS avatar_position_x smallint NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS avatar_position_y smallint NOT NULL DEFAULT 50;

-- Clamp 0-100 via trigger (CHECK em coluna existente preenchida é caro)
CREATE OR REPLACE FUNCTION public._community_clamp_positions()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.cover_position_x  := GREATEST(0, LEAST(100, COALESCE(NEW.cover_position_x, 50)));
  NEW.cover_position_y  := GREATEST(0, LEAST(100, COALESCE(NEW.cover_position_y, 50)));
  NEW.avatar_position_x := GREATEST(0, LEAST(100, COALESCE(NEW.avatar_position_x, 50)));
  NEW.avatar_position_y := GREATEST(0, LEAST(100, COALESCE(NEW.avatar_position_y, 50)));
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_community_clamp_positions ON public.oculto_communities;
CREATE TRIGGER trg_community_clamp_positions
  BEFORE INSERT OR UPDATE OF cover_position_x, cover_position_y, avatar_position_x, avatar_position_y
  ON public.oculto_communities
  FOR EACH ROW EXECUTE FUNCTION public._community_clamp_positions();

-- 2) RPC para o dono atualizar as posições (sem precisar do RPC genérico)
CREATE OR REPLACE FUNCTION public.community_update_image_positions(
  _community uuid,
  _cover_x  smallint DEFAULT NULL,
  _cover_y  smallint DEFAULT NULL,
  _avatar_x smallint DEFAULT NULL,
  _avatar_y smallint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT owner_id INTO v_owner
    FROM public.oculto_communities
   WHERE id = _community;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Dono ou master admin podem ajustar
  IF v_owner <> v_uid AND NOT public.oculto_is_master(v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.oculto_communities
     SET cover_position_x  = COALESCE(_cover_x,  cover_position_x),
         cover_position_y  = COALESCE(_cover_y,  cover_position_y),
         avatar_position_x = COALESCE(_avatar_x, avatar_position_x),
         avatar_position_y = COALESCE(_avatar_y, avatar_position_y)
   WHERE id = _community;
END$$;

REVOKE ALL ON FUNCTION public.community_update_image_positions(uuid, smallint, smallint, smallint, smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.community_update_image_positions(uuid, smallint, smallint, smallint, smallint) TO authenticated;

NOTIFY pgrst, 'reload schema';
