-- =====================================================================
-- OCULTO PLAY — Coleção padrão "Recebidas" + encaminhar item para usuário
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- 1) Garante a coleção "Recebidas" para todos os usuários existentes.
INSERT INTO public.oculto_play_collections (owner_id, name, description, is_public)
SELECT u.id, 'Recebidas', 'Áudios enviados para você por outros usuários.', false
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.oculto_play_collections c
   WHERE c.owner_id = u.id AND lower(c.name) = 'recebidas'
);

-- 2) Trigger: ao criar usuário em auth.users, cria a coleção padrão.
CREATE OR REPLACE FUNCTION public.oculto_play_ensure_recebidas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.oculto_play_collections (owner_id, name, description, is_public)
  SELECT NEW.id, 'Recebidas', 'Áudios enviados para você por outros usuários.', false
  WHERE NOT EXISTS (
    SELECT 1 FROM public.oculto_play_collections c
     WHERE c.owner_id = NEW.id AND lower(c.name) = 'recebidas'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oculto_play_recebidas_on_user ON auth.users;
CREATE TRIGGER trg_oculto_play_recebidas_on_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.oculto_play_ensure_recebidas();

-- 3) RPC: encaminha um item para a coleção "Recebidas" de outro usuário.
--    Aceita target por auth user_id. Cria a coleção se não existir.
CREATE OR REPLACE FUNCTION public.oculto_play_forward_to_user(
  p_target_user uuid,
  p_item_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_collection_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF p_target_user IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments' USING ERRCODE = '22023';
  END IF;
  IF p_target_user = v_uid THEN
    RAISE EXCEPTION 'cannot_forward_to_self' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.oculto_play_items WHERE id = p_item_id) THEN
    RAISE EXCEPTION 'item_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_collection_id
    FROM public.oculto_play_collections
   WHERE owner_id = p_target_user AND lower(name) = 'recebidas'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_collection_id IS NULL THEN
    INSERT INTO public.oculto_play_collections (owner_id, name, description, is_public)
    VALUES (p_target_user, 'Recebidas', 'Áudios enviados para você por outros usuários.', false)
    RETURNING id INTO v_collection_id;
  END IF;

  INSERT INTO public.oculto_play_collection_items (collection_id, item_id)
  VALUES (v_collection_id, p_item_id)
  ON CONFLICT DO NOTHING;

  RETURN v_collection_id;
END $$;

GRANT EXECUTE ON FUNCTION public.oculto_play_forward_to_user(uuid, uuid)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
