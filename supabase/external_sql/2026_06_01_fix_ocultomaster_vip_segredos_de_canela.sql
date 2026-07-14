-- ============================================================================
-- Corrige assinatura VIP: ocultomaster -> mulatacuriosa ("Segredos de Canela")
-- Idempotente. Executar no SQL Editor do Supabase EXTERNO.
-- ============================================================================

DO $$
DECLARE
  v_creator_profile_id uuid;
  v_creator_user_id    uuid;
  v_master_profile_id  uuid;
  v_master_user_id     uuid;
  v_plan_id            uuid;
  v_monthly_price      numeric(10,2) := 29.90;
  v_candidates         text;
BEGIN
  -- 1) Resolver perfil da creator (tenta varias variacoes do username/nome)
  SELECT id, user_id INTO v_creator_profile_id, v_creator_user_id
    FROM public.profiles
   WHERE lower(username) IN ('mulatacuriosa','mulatacuriosa_ofc','mulata_curiosa','mulatacuriosaofc')
      OR lower(username) LIKE 'mulatacuriosa%'
      OR lower(name)     LIKE 'mulata%curiosa%'
   ORDER BY
     CASE WHEN lower(username) = 'mulatacuriosa' THEN 0
          WHEN lower(username) LIKE 'mulatacuriosa%' THEN 1
          ELSE 2 END,
     created_at ASC
   LIMIT 1;

  IF v_creator_profile_id IS NULL THEN
    SELECT string_agg(username || ' / ' || COALESCE(name,''), E'\n')
      INTO v_candidates
      FROM (
        SELECT username, name FROM public.profiles
         WHERE lower(username) LIKE '%mulata%'
            OR lower(username) LIKE '%canela%'
            OR lower(name)     LIKE '%mulata%'
            OR lower(name)     LIKE '%canela%'
         LIMIT 20
      ) s;
    RAISE EXCEPTION E'Creator nao encontrada. Candidatos no banco:\n%', COALESCE(v_candidates,'(nenhum)');
  END IF;

  -- 2) Resolver perfil do master
  SELECT id, user_id INTO v_master_profile_id, v_master_user_id
    FROM public.profiles
   WHERE lower(username) = 'ocultomaster'
      OR upper(name) = 'OCULTO MASTER'
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_master_profile_id IS NULL THEN
    RAISE EXCEPTION 'Usuario ocultomaster nao encontrado';
  END IF;

  -- 3) Garantir creator marcada como criadora/VIP
  UPDATE public.profiles
     SET is_creator = true,
         is_vip     = COALESCE(is_vip, true),
         plan_type  = COALESCE(NULLIF(plan_type,''), 'vip')
   WHERE id = v_creator_profile_id;

  -- 4) Criar/atualizar plano "Segredos de Canela"
  SELECT id INTO v_plan_id
    FROM public.subscription_plans
   WHERE profile_id = v_creator_profile_id
     AND title ILIKE 'Segredos de Canela'
   LIMIT 1;

  IF v_plan_id IS NULL THEN
    INSERT INTO public.subscription_plans
      (profile_id, title, bio, monthly_price, annual_price, is_enabled, sort_order)
    VALUES
      (v_creator_profile_id,
       'Segredos de Canela',
       'Canal VIP exclusivo de mulatacuriosa.',
       v_monthly_price,
       v_monthly_price * 10,
       true,
       0)
    RETURNING id INTO v_plan_id;
  ELSE
    UPDATE public.subscription_plans
       SET is_enabled    = true,
           monthly_price = COALESCE(monthly_price, v_monthly_price)
     WHERE id = v_plan_id;
  END IF;

  -- 5) Criar/renovar assinatura ocultomaster -> creator
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE subscriber_id = v_master_profile_id
       AND creator_id    = v_creator_profile_id
  ) THEN
    INSERT INTO public.subscriptions
      (subscriber_id, creator_id, status, price, expires_at, created_at)
    VALUES
      (v_master_profile_id, v_creator_profile_id, 'active',
       v_monthly_price, now() + interval '365 days', now());
  ELSE
    UPDATE public.subscriptions
       SET status     = 'active',
           expires_at = GREATEST(COALESCE(expires_at, now()), now() + interval '365 days')
     WHERE subscriber_id = v_master_profile_id
       AND creator_id    = v_creator_profile_id;
  END IF;

  RAISE NOTICE 'OK: creator_profile=%, plano=%', v_creator_profile_id, v_plan_id;
END $$;

-- Verificacao
SELECT s.id, sub.username AS subscriber, cr.username AS creator, s.status, s.expires_at
  FROM public.subscriptions s
  JOIN public.profiles sub ON sub.id = s.subscriber_id
  JOIN public.profiles cr  ON cr.id  = s.creator_id
 WHERE lower(sub.username) = 'ocultomaster';

SELECT id, title, monthly_price, is_enabled
  FROM public.subscription_plans
 WHERE profile_id IN (SELECT id FROM public.profiles WHERE lower(username) LIKE 'mulatacuriosa%');
