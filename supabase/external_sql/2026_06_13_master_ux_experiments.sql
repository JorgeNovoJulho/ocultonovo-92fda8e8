-- =====================================================================
-- Experiências exclusivas do Master — Feature flags da nova Aura IA
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
--
-- Cria/garante 5 flags com rollout_mode='admin_only' → somente
-- @oculto_master enxerga; demais usuários permanecem no sistema atual.
-- Quando o admin alternar para 'global', libera para todos os usuários.
-- =====================================================================

INSERT INTO public.platform_feature_flags
  (feature_key, enabled, rollout_mode, rollout_percentage, admin_only, beta_users, description)
VALUES
  ('nova_aura_ai',             true, 'admin_only', 0, true, ARRAY[]::uuid[], 'Painel premium da nova Aura IA na Home.'),
  ('central_aura_ia',          true, 'admin_only', 0, true, ARRAY[]::uuid[], 'Modal Central Aura IA (fullscreen mobile / dialog desktop).'),
  ('oportunidades_inteligentes', true, 'admin_only', 0, true, ARRAY[]::uuid[], 'Aba Oportunidades com sinais reais (mensagens, likes, alcance).'),
  ('mapa_do_oculto',           true, 'admin_only', 0, true, ARRAY[]::uuid[], 'Aba Explorar inteligente — usado vs. não explorado.'),
  ('onboarding_inteligente',   false,'admin_only', 0, true, ARRAY[]::uuid[], 'Onboarding adaptativo guiado pela Aura IA.')
ON CONFLICT (feature_key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at  = now();
