-- ============================================================================
-- INTEGRAÇÃO PRESTÍGIO ↔ BOOSTS / DESCONTOS — idempotente
-- Estende social_boosts_for_users para considerar também prestige.rewards
-- e expõe social_prestige_discount_for_user para o checkout.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.social_boosts_for_users(
  p_users uuid[], p_kind text
) RETURNS TABLE(user_id uuid, multiplier numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT unnest(p_users) AS uid
  ),
  scored AS (
    SELECT b.uid AS user_id,
           coalesce(s.level,    1) AS lvl,
           coalesce(s.total_xp, 0) AS xp
      FROM base b
      LEFT JOIN oculto_social_scores s ON s.user_id = b.uid
  ),
  social_mult AS (
    SELECT sc.user_id,
           coalesce(
             (SELECT max(r.value) FROM oculto_social_rewards r
               WHERE r.active AND r.kind = p_kind AND r.level_min <= sc.lvl),
             1
           )::numeric AS m
      FROM scored sc
  ),
  prestige_mult AS (
    SELECT sc.user_id,
           coalesce(
             (SELECT max( nullif((pl.rewards ->> p_kind),'')::numeric )
                FROM oculto_social_prestige_levels pl
               WHERE pl.is_active AND pl.min_xp <= sc.xp),
             1
           )::numeric AS m
      FROM scored sc
  )
  SELECT s.user_id, GREATEST(s.m, p.m) AS multiplier
    FROM social_mult s JOIN prestige_mult p USING (user_id);
$$;
GRANT EXECUTE ON FUNCTION public.social_boosts_for_users(uuid[],text) TO authenticated, anon;

-- Desconto efetivo do Prestígio para um usuário (usado em checkout/preview)
CREATE OR REPLACE FUNCTION public.social_prestige_discount_for_user(
  p_user uuid, p_kind text
) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH xp AS (
    SELECT coalesce(total_xp,0) AS x FROM oculto_social_scores WHERE user_id = p_user
  )
  SELECT coalesce(
    (SELECT max( nullif((pl.rewards ->> p_kind),'')::numeric )
       FROM oculto_social_prestige_levels pl, xp
      WHERE pl.is_active AND pl.min_xp <= xp.x),
    0
  );
$$;
GRANT EXECUTE ON FUNCTION public.social_prestige_discount_for_user(uuid,text) TO authenticated;

-- ============================================================================
-- Estende social_apply_discount: combina Aura Social + Prestígio (pega o maior %)
-- Mantém retorno e assinatura idênticos para não quebrar callers.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.social_apply_discount(
  p_user uuid, p_kind text, p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lvl int;
  v_xp  int;
  v_pct_social   numeric := 0;
  v_pct_prestige numeric := 0;
  v_pct  numeric;
  v_disc numeric;
  v_final numeric;
BEGIN
  IF p_user IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('applied_pct',0,'final_amount',p_amount,'discount_amount',0,'level',0);
  END IF;

  SELECT coalesce(level,1), coalesce(total_xp,0)
    INTO v_lvl, v_xp
    FROM oculto_social_scores WHERE user_id = p_user;
  v_lvl := coalesce(v_lvl, 1);
  v_xp  := coalesce(v_xp,  0);

  SELECT coalesce(max(value),0) INTO v_pct_social
    FROM oculto_social_rewards
   WHERE active AND kind = p_kind AND level_min <= v_lvl;

  SELECT coalesce(max( nullif((rewards ->> p_kind),'')::numeric ),0) INTO v_pct_prestige
    FROM oculto_social_prestige_levels
   WHERE is_active AND min_xp <= v_xp;

  v_pct  := GREATEST(v_pct_social, v_pct_prestige);
  v_disc := round((p_amount * v_pct / 100)::numeric, 2);
  v_final:= round((p_amount - v_disc)::numeric, 2);

  RETURN jsonb_build_object(
    'applied_pct', v_pct,
    'discount_amount', v_disc,
    'final_amount', v_final,
    'level', v_lvl
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.social_apply_discount(uuid,text,numeric) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
