-- ============================================================
-- Etapa 54 — Desafio da Semana (Oculto Play)
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.oculto_play_weekly_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end   date NOT NULL,
  theme_title       text NOT NULL,
  theme_description text,
  hashtag           text,
  prize_description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start)
);

GRANT SELECT ON public.oculto_play_weekly_challenges TO anon, authenticated;
GRANT ALL    ON public.oculto_play_weekly_challenges TO service_role;
ALTER TABLE public.oculto_play_weekly_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS challenges_read ON public.oculto_play_weekly_challenges;
CREATE POLICY challenges_read ON public.oculto_play_weekly_challenges
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.oculto_play_challenge_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.oculto_play_weekly_challenges(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES public.oculto_play_items(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_chal_sub_chal ON public.oculto_play_challenge_submissions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_chal_sub_user ON public.oculto_play_challenge_submissions(user_id);

GRANT SELECT, INSERT, DELETE ON public.oculto_play_challenge_submissions TO authenticated;
GRANT SELECT ON public.oculto_play_challenge_submissions TO anon;
GRANT ALL    ON public.oculto_play_challenge_submissions TO service_role;
ALTER TABLE public.oculto_play_challenge_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chal_sub_read ON public.oculto_play_challenge_submissions;
CREATE POLICY chal_sub_read ON public.oculto_play_challenge_submissions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS chal_sub_insert ON public.oculto_play_challenge_submissions;
CREATE POLICY chal_sub_insert ON public.oculto_play_challenge_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chal_sub_delete ON public.oculto_play_challenge_submissions;
CREATE POLICY chal_sub_delete ON public.oculto_play_challenge_submissions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Desafio ativo da semana
CREATE OR REPLACE FUNCTION public.oculto_play_current_challenge()
RETURNS TABLE (
  id uuid, week_start date, week_end date,
  theme_title text, theme_description text, hashtag text,
  prize_description text, submissions_count integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.week_start, c.week_end, c.theme_title, c.theme_description,
         c.hashtag, c.prize_description,
         (SELECT COUNT(*)::int FROM public.oculto_play_challenge_submissions s WHERE s.challenge_id = c.id)
  FROM public.oculto_play_weekly_challenges c
  WHERE c.is_active = true
    AND CURRENT_DATE BETWEEN c.week_start AND c.week_end
  ORDER BY c.week_start DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_current_challenge() TO anon, authenticated;

-- Leaderboard do desafio ativo (ordenado por reações 24h + views)
CREATE OR REPLACE FUNCTION public.oculto_play_challenge_leaderboard(p_challenge_id uuid)
RETURNS TABLE (
  item_id uuid, title text, thumb_url text, media_url text, kind text,
  author_id uuid, author_username text, author_display_name text, author_avatar_url text,
  view_count integer, recent_reactions integer, score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH recent AS (
    SELECT item_id, COUNT(*)::int AS qty
      FROM public.oculto_play_timeline_reactions
     WHERE created_at >= now() - interval '7 days'
     GROUP BY item_id
  )
  SELECT
    i.id, i.title, i.thumb_url, i.media_url, i.kind,
    i.author_id, p.username, p.display_name, p.avatar_url,
    COALESCE(i.view_count, 0),
    COALESCE(r.qty, 0),
    (COALESCE(r.qty,0) * 3.0 + ln(GREATEST(COALESCE(i.view_count,0),1)))::numeric(10,2)
  FROM public.oculto_play_challenge_submissions s
  JOIN public.oculto_play_items i ON i.id = s.item_id
  LEFT JOIN recent r ON r.item_id = i.id
  LEFT JOIN public.profiles p ON p.id = i.author_id
  WHERE s.challenge_id = p_challenge_id
  ORDER BY score DESC, i.published_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.oculto_play_challenge_leaderboard(uuid) TO anon, authenticated;
