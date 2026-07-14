-- =====================================================================
-- 2026_05_30 — Correção: "column reference expires_at is ambiguous"
-- e "Erro ao ativar boost". Mantém OUT params com nomes originais
-- (compatível com o frontend) e elimina ambiguidade qualificando colunas.
-- Idempotente — cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================

-- ----------------------------------------------------------------------
-- 1) aura_boost_activate — remove dependência opcional de
--    aura_level_from_xp (que pode não existir e estourar exceção),
--    qualifica colunas.
-- ----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.aura_boost_activate();

CREATE OR REPLACE FUNCTION public.aura_boost_activate()
RETURNS TABLE(ok boolean, message text, expires_at timestamptz, xp int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_xp      int;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT ob.expires_at INTO v_expires
    FROM public.oculto_aura_boosts ob
   WHERE ob.user_id = v_uid AND ob.expires_at > now()
   ORDER BY ob.expires_at DESC LIMIT 1;

  IF v_expires IS NOT NULL THEN
    SELECT COALESCE(p.aura_xp, 0) INTO v_xp
      FROM public.profiles p WHERE p.user_id = v_uid;
    ok := false; message := 'Você já tem um boost ativo';
    expires_at := v_expires; xp := v_xp;
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(p.aura_xp, 0) INTO v_xp
    FROM public.profiles p WHERE p.user_id = v_uid;

  IF v_xp < 200 THEN
    ok := false; message := 'XP insuficiente (precisa de 200)';
    expires_at := NULL; xp := v_xp;
    RETURN NEXT; RETURN;
  END IF;

  v_expires := now() + interval '60 minutes';

  -- Debita XP de forma segura, sem depender de aura_level_from_xp
  UPDATE public.profiles AS pr
     SET aura_xp = GREATEST(0, COALESCE(pr.aura_xp, 0) - 200)
   WHERE pr.user_id = v_uid
   RETURNING pr.aura_xp INTO v_xp;

  INSERT INTO public.oculto_aura_boosts (user_id, expires_at, xp_spent)
       VALUES (v_uid, v_expires, 200);

  ok := true; message := 'Boost ativado por 60 minutos';
  expires_at := v_expires; xp := COALESCE(v_xp, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_boost_activate() TO authenticated;

-- ----------------------------------------------------------------------
-- 2) aura_bond_create — qualifica RETURNING com nome da tabela,
--    elimina ambiguidade entre coluna e OUT param `expires_at`.
-- ----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.aura_bond_create(uuid);

CREATE OR REPLACE FUNCTION public.aura_bond_create(p_other uuid)
RETURNS TABLE(ok boolean, message text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_a   uuid;
  v_b   uuid;
  v_exp timestamptz;
BEGIN
  IF v_uid IS NULL OR p_other IS NULL OR v_uid = p_other THEN
    ok := false; message := 'Parceiro inválido'; expires_at := NULL;
    RETURN NEXT; RETURN;
  END IF;

  v_a := LEAST(v_uid, p_other);
  v_b := GREATEST(v_uid, p_other);

  SELECT b.expires_at INTO v_exp
    FROM public.oculto_aura_shared_bonds b
   WHERE b.user_a = v_a AND b.user_b = v_b AND b.expires_at > now()
   ORDER BY b.expires_at DESC LIMIT 1;

  IF v_exp IS NOT NULL THEN
    ok := false; message := 'Vocês já têm um vínculo ativo'; expires_at := v_exp;
    RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.oculto_aura_shared_bonds AS sb (user_a, user_b)
       VALUES (v_a, v_b)
    RETURNING sb.expires_at INTO v_exp;

  ok := true; message := 'Aura compartilhada por 1h! +20% XP'; expires_at := v_exp;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_bond_create(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
