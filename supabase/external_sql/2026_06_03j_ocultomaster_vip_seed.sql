-- =============================================================
-- 2026_06_03j_ocultomaster_vip_seed.sql
-- Objetivo: garantir que ocultomaster veja conteúdo VIP real do
-- canal "Segredos de Canela" (@mulatacuriosa_ofc) na aba
-- "Meu Conteúdo VIP" e no Modo Card.
--
-- Faz 3 coisas (todas idempotentes):
--   1) cria assinatura ativa do ocultomaster ao plano da mulatacuriosa
--   2) marca 2 posts existentes da mulatacuriosa como privacy_level='vip'
--      (assim eles aparecem com borda dourada + selo Crown no Modo Card
--       e na aba Meu Conteúdo VIP).
--   3) registra log para auditoria.
-- =============================================================

-- IDs reais já confirmados no banco externo
-- ocultomaster:          33b9c88a-99e1-43d8-9e7d-29e16500f5d9
-- mulatacuriosa_ofc:     606652f7-bd83-4741-af7c-012191479911
-- plano "Segredos de Canela": 9a7ebcaa-bcb7-44ea-be13-86611b415997

-- 1) Assinatura ativa (idempotente via UNIQUE em subscriber_id+creator_id+plan_id)
INSERT INTO public.subscriptions (
  subscriber_id,
  creator_id,
  plan_id,
  status,
  price,
  created_at,
  expires_at
)
SELECT
  '33b9c88a-99e1-43d8-9e7d-29e16500f5d9'::uuid,
  '606652f7-bd83-4741-af7c-012191479911'::uuid,
  '9a7ebcaa-bcb7-44ea-be13-86611b415997'::uuid,
  'active',
  19.90,
  now(),
  now() + interval '365 days'
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions
  WHERE subscriber_id = '33b9c88a-99e1-43d8-9e7d-29e16500f5d9'
    AND creator_id    = '606652f7-bd83-4741-af7c-012191479911'
    AND status IN ('active','trialing')
);

-- 2) Marca os 2 posts mais recentes da mulatacuriosa como VIP (somente
--    se ainda não houver nenhum post VIP dela).
DO $$
DECLARE
  v_creator uuid := '606652f7-bd83-4741-af7c-012191479911';
  v_vip_count int;
BEGIN
  SELECT count(*) INTO v_vip_count
  FROM public.posts
  WHERE author_id = v_creator
    AND privacy_level = 'vip';

  IF v_vip_count = 0 THEN
    UPDATE public.posts
       SET privacy_level = 'vip',
           updated_at = now()
     WHERE id IN (
       SELECT id FROM public.posts
        WHERE author_id = v_creator
          AND COALESCE(is_hidden,false) = false
          AND COALESCE(is_flash,false)  = false
        ORDER BY created_at DESC
        LIMIT 2
     );
  END IF;
END $$;

-- 3) Log
DO $$
BEGIN
  RAISE NOTICE 'Seed VIP ocultomaster <- mulatacuriosa_ofc aplicado em %', now();
END $$;
