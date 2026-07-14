-- =====================================================================
-- Sala Mineração — REMOVE requisitos mínimos (liberação total)
-- Aplica em produção sem quebrar o histórico.
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
-- =====================================================================
--
-- Decisão de produto (2026-06-04):
--   • A Sala Mineração passa a ser o ponto de entrada para usuários
--     com saldo de XP = 0 ganharem XP conversando.
--   • Acesso liberado para TODOS os usuários autenticados.
--   • Sem exigência de Aura nível, Score Social ou Prestígio.
-- =====================================================================

UPDATE public.oculto_aura_rooms
   SET min_aura_level   = 0,
       min_social_score = 0,
       min_prestige_xp  = 0,
       required_plan    = NULL,
       requires_kyc     = false,
       couple_only      = false,
       vip_only         = false,
       active           = true,
       description      = 'Acesso livre — converse de verdade e cada minuto vira XP.'
 WHERE slug = 'mineracao';

-- Garante que a sala exista mesmo em ambientes onde nunca rodou o seed.
INSERT INTO public.oculto_aura_rooms
  (slug, name, theme, hue, emoji, active, vip_only,
   hour_from, hour_to, min_aura_level, min_social_score, min_prestige_xp,
   required_plan, requires_kyc, couple_only, sort_order, glow_intensity, description)
SELECT 'mineracao', 'Mineração', 'Permaneça, conecte-se e minere XP',
       45, '⛏️', true, false, NULL, NULL,
       0, 0, 0,
       NULL, false, false, 5, 90,
       'Acesso livre — converse de verdade e cada minuto vira XP.'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.oculto_aura_rooms WHERE slug = 'mineracao'
 );
