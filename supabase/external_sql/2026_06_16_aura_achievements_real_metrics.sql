-- =====================================================================
-- Aura Match — Conquistas baseadas em DADOS REAIS do usuário
-- Substitui aura_achievements_metrics: as métricas *_quests deixam de
-- depender de "resgate de missão diária" e passam a refletir o total
-- real de ações do usuário (curtidas, follows, saves, comentários,
-- votos em enquetes e presentes).
-- Idempotente — rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================
DROP FUNCTION IF EXISTS public.aura_achievements_metrics();

CREATE OR REPLACE FUNCTION public.aura_achievements_metrics()
RETURNS TABLE(
  total_xp         integer,
  current_level    integer,
  current_streak   integer,
  visit_days       integer,
  quests_claimed   integer,
  super_dm_quests  integer,
  likes_quests     integer,
  follows_quests   integer,
  saves_quests     integer,
  comments_quests  integer,
  polls_quests     integer,
  gifts_quests     integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  -- profile.id é usado pelas tabelas sociais (follows, post_likes, saved_posts,
  -- post_comments, gift_history). auth.uid() não bate diretamente nessas tabelas.
  SELECT p.id INTO v_pid FROM public.profiles p WHERE p.user_id = v_uid LIMIT 1;

  RETURN QUERY
  SELECT
    -- XP / nível / streak vêm direto do profile
    COALESCE((SELECT aura_xp          FROM public.profiles WHERE user_id = v_uid), 0),
    COALESCE((SELECT aura_level       FROM public.profiles WHERE user_id = v_uid), 1),
    COALESCE((SELECT aura_streak_days FROM public.profiles WHERE user_id = v_uid), 0),

    -- Dias com presença real no Aura (qualquer interação com daily quests)
    COALESCE((SELECT COUNT(DISTINCT day)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid), 0),

    -- Missões diárias efetivamente resgatadas (com claimed_at)
    COALESCE((SELECT COUNT(*)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid AND claimed_at IS NOT NULL), 0),

    -- Super DM continua atrelado ao resgate de missão (precisa intenção explícita)
    COALESCE((SELECT COUNT(*)::int
                FROM public.oculto_aura_daily_quests
               WHERE user_id = v_uid
                 AND quest_key = 'send_super_dm'
                 AND claimed_at IS NOT NULL), 0),

    -- DADOS REAIS abaixo (independente do usuário ter "claimado" missão)
    COALESCE((SELECT COUNT(*)::int FROM public.post_likes
               WHERE user_id = COALESCE(v_pid, v_uid)), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.follows
               WHERE follower_id = COALESCE(v_pid, v_uid)), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.saved_posts
               WHERE user_id = COALESCE(v_pid, v_uid)), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.post_comments
               WHERE user_id = COALESCE(v_pid, v_uid)
                 AND COALESCE(is_hidden, false) = false), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.poll_votes
               WHERE voter_id = COALESCE(v_pid, v_uid)), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.gift_history
               WHERE sender_id = COALESCE(v_pid, v_uid)), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aura_achievements_metrics() TO authenticated;
NOTIFY pgrst, 'reload schema';
