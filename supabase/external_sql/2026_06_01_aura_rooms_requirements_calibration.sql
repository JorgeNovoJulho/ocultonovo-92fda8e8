-- ============================================================================
-- Calibração dos REQUISITOS MÍNIMOS das Salas Ocultas
-- ----------------------------------------------------------------------------
-- Baseline: @ocultomaster e @casaltomate devem cumprir TODOS os requisitos
-- de TODAS as salas. Como casaltomate é um usuário comum (sem VIP, sem KYC
-- obrigatório, sem prestígio alto), zeramos / liberamos os gates numéricos
-- e de plano em todas as salas, mantendo apenas marcação temática.
--
-- Idempotente: pode rodar várias vezes sem efeito colateral.
-- ============================================================================

BEGIN;

UPDATE public.oculto_aura_rooms
SET
  -- Plano / verificação
  vip_only         = false,
  required_plan    = NULL,
  requires_kyc     = false,
  couple_only      = false,
  -- Gêneros liberados (vazio = todos podem entrar)
  allowed_genders  = '{}'::text[],
  -- Gates numéricos zerados
  min_aura_level   = 0,
  min_social_score = 0,
  min_prestige_xp  = 0,
  -- Janela horária liberada (24h)
  hour_from        = NULL,
  hour_to          = NULL,
  -- Sempre visível
  active           = true,
  open_to_all      = true;

-- Recarrega o schema do PostgREST para refletir mudanças no client
NOTIFY pgrst, 'reload schema';

COMMIT;
