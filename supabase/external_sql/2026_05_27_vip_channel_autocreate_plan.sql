-- ============================================================
-- 2026-05-27 — Auto-cria subscription_plans no toggle do canal VIP
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================
-- Problema: usuários sem nenhum plano em subscription_plans ficavam com o
-- toggle "Ativar canal" travado. Esta RPC garante que, ao ligar pela
-- primeira vez, uma linha mínima de plano é criada automaticamente, e
-- ao desligar, todos os planos do criador são marcados is_enabled=false.
-- ============================================================

CREATE OR REPLACE FUNCTION public.vip_channel_set_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_existing int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT id INTO v_profile_id
    FROM public.profiles
   WHERE user_id = auth.uid()
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT COUNT(*) INTO v_existing
    FROM public.subscription_plans
   WHERE profile_id = v_profile_id;

  IF v_existing = 0 THEN
    -- Cria plano mínimo padrão (rascunho). Usuário ajusta preço/título depois.
    INSERT INTO public.subscription_plans (
      profile_id,
      title,
      monthly_price,
      is_enabled,
      created_at,
      updated_at
    ) VALUES (
      v_profile_id,
      'Meu Canal VIP',
      9.90,
      COALESCE(p_enabled, false),
      now(),
      now()
    );
  ELSE
    UPDATE public.subscription_plans
       SET is_enabled = COALESCE(p_enabled, false),
           updated_at = now()
     WHERE profile_id = v_profile_id;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vip_channel_set_enabled(boolean)
  TO authenticated, service_role;
