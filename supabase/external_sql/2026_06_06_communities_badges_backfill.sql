-- =====================================================================
-- Comunidades — Backfill de Conquistas
-- Reavalia TODOS os pares (community, user) com base nos dados existentes
-- (tópicos, respostas, reações, RSVPs já criados antes dos triggers).
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
--
-- PRÉ-REQ: 2026_06_05_communities_part18_badges.sql já aplicado.
-- =====================================================================

DO $$
DECLARE r record;
BEGIN
  -- Avalia autores de tópicos
  FOR r IN
    SELECT DISTINCT community_id, author_id
      FROM public.oculto_community_topics
      WHERE status = 'active' AND author_id IS NOT NULL AND community_id IS NOT NULL
  LOOP
    PERFORM public.community_badge_evaluate(r.community_id, r.author_id);
  END LOOP;

  -- Avalia autores de replies (busca community via join)
  FOR r IN
    SELECT DISTINCT t.community_id, rep.author_id
      FROM public.oculto_community_replies rep
      JOIN public.oculto_community_topics t ON t.id = rep.topic_id
      WHERE rep.status = 'active' AND rep.author_id IS NOT NULL
  LOOP
    PERFORM public.community_badge_evaluate(r.community_id, r.author_id);
  END LOOP;

  -- Avalia membros ativos (para member_days/Veterano)
  FOR r IN
    SELECT community_id, user_id
      FROM public.oculto_community_members
      WHERE status = 'active' AND user_id IS NOT NULL
  LOOP
    PERFORM public.community_badge_evaluate(r.community_id, r.user_id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
