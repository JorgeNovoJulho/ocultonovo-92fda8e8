-- Aura Match v2 — Bloco J: Aura Compartilhada
CREATE TABLE IF NOT EXISTS public.oculto_aura_shared_bonds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS idx_bonds_active ON public.oculto_aura_shared_bonds(expires_at);
CREATE INDEX IF NOT EXISTS idx_bonds_users ON public.oculto_aura_shared_bonds(user_a, user_b);

ALTER TABLE public.oculto_aura_shared_bonds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bonds_select_participant" ON public.oculto_aura_shared_bonds;
CREATE POLICY "bonds_select_participant" ON public.oculto_aura_shared_bonds FOR SELECT
  USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE OR REPLACE FUNCTION public.aura_bond_create(p_other uuid)
RETURNS TABLE(ok boolean, message text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_a uuid; v_b uuid; v_exp timestamptz;
BEGIN
  IF v_uid IS NULL OR p_other IS NULL OR v_uid = p_other THEN
    RETURN QUERY SELECT false, 'Parceiro inválido', NULL::timestamptz; RETURN;
  END IF;
  v_a := LEAST(v_uid, p_other); v_b := GREATEST(v_uid, p_other);
  IF EXISTS (SELECT 1 FROM oculto_aura_shared_bonds WHERE user_a = v_a AND user_b = v_b AND expires_at > now()) THEN
    RETURN QUERY SELECT false, 'Vocês já têm um vínculo ativo', NULL::timestamptz; RETURN;
  END IF;
  INSERT INTO oculto_aura_shared_bonds (user_a, user_b) VALUES (v_a, v_b)
    RETURNING expires_at INTO v_exp;
  RETURN QUERY SELECT true, 'Aura compartilhada por 1h! +20% XP', v_exp;
END; $$;

CREATE OR REPLACE FUNCTION public.aura_bond_my_active()
RETURNS TABLE(id uuid, partner_user_id uuid, partner_name text, partner_avatar text, expires_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
    SELECT b.id,
      CASE WHEN b.user_a = v_uid THEN b.user_b ELSE b.user_a END,
      p.name, p.avatar_url, b.expires_at
    FROM oculto_aura_shared_bonds b
    LEFT JOIN profiles p ON p.user_id = (CASE WHEN b.user_a = v_uid THEN b.user_b ELSE b.user_a END)
    WHERE (b.user_a = v_uid OR b.user_b = v_uid) AND b.expires_at > now()
    ORDER BY b.expires_at DESC LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION public.aura_bond_multiplier(p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM oculto_aura_shared_bonds
    WHERE (user_a = p_user OR user_b = p_user) AND expires_at > now()
  ) THEN 1.2 ELSE 1.0 END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_bond_create(uuid), public.aura_bond_my_active(), public.aura_bond_multiplier(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
