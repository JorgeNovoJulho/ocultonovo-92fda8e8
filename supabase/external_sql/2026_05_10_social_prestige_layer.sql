-- ============================================================================
-- PRESTÍGIO SOCIAL — camada emocional acima do Score Social
-- 100% idempotente — cole no SQL Editor do Supabase EXTERNO
-- ============================================================================

-- ====== TABELA DE NÍVEIS DE PRESTÍGIO (configurável pelo admin) ======
CREATE TABLE IF NOT EXISTS public.oculto_social_prestige_levels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank          int  NOT NULL UNIQUE,           -- ordem (1..N)
  name          text NOT NULL,
  min_xp        int  NOT NULL,
  description   text,
  badge_icon    text NOT NULL DEFAULT 'sparkles',
  glow_color    text NOT NULL DEFAULT '270 70% 60%',
  visual_style  jsonb NOT NULL DEFAULT '{}'::jsonb,
  rewards       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oculto_social_prestige_levels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY social_prestige_read ON public.oculto_social_prestige_levels
    FOR SELECT USING (is_active);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed default tiers (somente se vazio)
INSERT INTO public.oculto_social_prestige_levels (rank, name, min_xp, description, badge_icon, glow_color)
SELECT * FROM (VALUES
  (1, 'Presença Inicial',   0,     'Seu perfil está começando a ganhar vida.',                 'sparkles',  '270 30% 55%'),
  (2, 'Perfil Misterioso',  200,   'Sua presença começa a chamar atenção.',                    'eye',       '260 60% 60%'),
  (3, 'Energia Popular',    400,   'Você é notado pela comunidade.',                           'flame',     '320 70% 60%'),
  (4, 'Presença Dominante', 600,   'Sua aura domina o ambiente.',                              'crown',     '40 90% 55%'),
  (5, 'Influência VIP',     800,   'Você é referência social na plataforma.',                  'gem',       '45 95% 55%'),
  (6, 'Ícone Social',       950,   'Lenda viva — poucos chegam aqui.',                         'star',      '50 100% 60%')
) AS v(rank, name, min_xp, description, badge_icon, glow_color)
WHERE NOT EXISTS (SELECT 1 FROM public.oculto_social_prestige_levels);

-- ====== RPC: GET PRESTÍGIO DO USUÁRIO ======
CREATE OR REPLACE FUNCTION public.social_prestige_get(p_user uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := coalesce(p_user, auth.uid());
  v_xp     int;
  v_cur    record;
  v_next   record;
  v_pct    int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','no_user'); END IF;

  SELECT coalesce(total_xp,0) INTO v_xp
    FROM oculto_social_scores WHERE user_id = v_uid;
  v_xp := coalesce(v_xp, 0);

  SELECT * INTO v_cur
    FROM oculto_social_prestige_levels
   WHERE is_active AND min_xp <= v_xp
   ORDER BY min_xp DESC LIMIT 1;

  IF v_cur IS NULL THEN
    SELECT * INTO v_cur FROM oculto_social_prestige_levels
     WHERE is_active ORDER BY min_xp ASC LIMIT 1;
  END IF;

  SELECT * INTO v_next
    FROM oculto_social_prestige_levels
   WHERE is_active AND min_xp > coalesce(v_cur.min_xp,0)
   ORDER BY min_xp ASC LIMIT 1;

  v_pct := CASE
    WHEN v_next.min_xp IS NULL THEN 100
    WHEN v_next.min_xp = v_cur.min_xp THEN 100
    ELSE LEAST(100, GREATEST(0,
      ROUND(((v_xp - v_cur.min_xp)::numeric * 100) / NULLIF((v_next.min_xp - v_cur.min_xp),0))))
  END;

  RETURN jsonb_build_object(
    'user_id',       v_uid,
    'xp',            v_xp,
    'rank',          v_cur.rank,
    'name',          v_cur.name,
    'description',   v_cur.description,
    'badge_icon',    v_cur.badge_icon,
    'glow_color',    v_cur.glow_color,
    'visual_style',  v_cur.visual_style,
    'rewards',       v_cur.rewards,
    'next_rank',     v_next.rank,
    'next_name',     v_next.name,
    'next_min_xp',   v_next.min_xp,
    'xp_to_next',    GREATEST(0, coalesce(v_next.min_xp,0) - v_xp),
    'progress_pct',  v_pct
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.social_prestige_get(uuid) TO authenticated, anon;

-- ====== RPC: LIST (admin/UI) ======
CREATE OR REPLACE FUNCTION public.social_prestige_list()
RETURNS SETOF public.oculto_social_prestige_levels
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM oculto_social_prestige_levels ORDER BY rank ASC;
$$;
GRANT EXECUTE ON FUNCTION public.social_prestige_list() TO authenticated, anon;

-- ====== RPC: ADMIN UPSERT ======
CREATE OR REPLACE FUNCTION public.social_admin_set_prestige(
  p_id uuid,
  p_rank int,
  p_name text,
  p_min_xp int,
  p_description text,
  p_badge_icon text,
  p_glow_color text,
  p_visual_style jsonb,
  p_rewards jsonb,
  p_is_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO oculto_social_prestige_levels
      (rank, name, min_xp, description, badge_icon, glow_color, visual_style, rewards, is_active)
    VALUES
      (p_rank, p_name, p_min_xp, p_description,
       coalesce(p_badge_icon,'sparkles'),
       coalesce(p_glow_color,'270 70% 60%'),
       coalesce(p_visual_style,'{}'::jsonb),
       coalesce(p_rewards,'{}'::jsonb),
       coalesce(p_is_active,true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE oculto_social_prestige_levels
       SET rank=p_rank, name=p_name, min_xp=p_min_xp, description=p_description,
           badge_icon=coalesce(p_badge_icon,'sparkles'),
           glow_color=coalesce(p_glow_color,'270 70% 60%'),
           visual_style=coalesce(p_visual_style,'{}'::jsonb),
           rewards=coalesce(p_rewards,'{}'::jsonb),
           is_active=coalesce(p_is_active,true),
           updated_at=now()
     WHERE id = p_id
     RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_set_prestige(uuid,int,text,int,text,text,text,jsonb,jsonb,boolean) TO authenticated;

-- ====== RPC: ADMIN DELETE ======
CREATE OR REPLACE FUNCTION public.social_admin_delete_prestige(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_master_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM oculto_social_prestige_levels WHERE id = p_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.social_admin_delete_prestige(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
