-- =====================================================================
-- Comunidades Ocultas — Aumenta limite VIP para 10 comunidades
-- Idempotente. Execute no SQL Editor do Supabase externo
-- (rvybbrkzmboqbhcemqar).
-- =====================================================================

UPDATE public.oculto_community_settings
   SET vip_max_communities = 10
 WHERE vip_max_communities IS DISTINCT FROM 10;
