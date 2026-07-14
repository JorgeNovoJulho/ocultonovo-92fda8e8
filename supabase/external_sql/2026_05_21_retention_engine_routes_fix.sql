-- Fix CTA routes for retention missions (404 fix).
-- Routes corrigidas conforme rotas reais do App.tsx:
--   /aura-rooms -> /aura-match#aura-anchor-rooms (salas vivem dentro do AuraMatchPage)
--   /pulses     -> /settings/pulses
-- As demais (/aura-match, /radar, /feed) já existem.

UPDATE public.oculto_retention_missions_config
SET cta_route = '/aura-match#aura-anchor-rooms'
WHERE key = 'enter_room';

UPDATE public.oculto_retention_missions_config
SET cta_route = '/settings/pulses'
WHERE key = 'send_pulse';
