-- =============================================================
-- RETENTION MISSIONS V2 — 6 dias x 5 missoes + dia 7 "ultima chance"
-- Rodar no SQL Editor do Supabase EXTERNO (rvybbrkzmboqbhcemqar)
-- 100% idempotente. Reaproveita oculto_retention_progress existente.
-- =============================================================

-- 1) Schema additions
ALTER TABLE public.oculto_retention_missions_config
  ADD COLUMN IF NOT EXISTS xp_reward integer NOT NULL DEFAULT 10;
ALTER TABLE public.oculto_retention_missions_config
  ADD COLUMN IF NOT EXISTS day integer;

-- 2) Desativa as 5 missoes genericas antigas
UPDATE public.oculto_retention_missions_config
   SET active = false, updated_at = now()
 WHERE key IN ('enter_room','try_aura_match','check_radar','send_pulse','view_5_profiles');

-- 3) Seed das 30 missoes (6 dias x 5)
INSERT INTO public.oculto_retention_missions_config
  (key, title, body, cta_label, cta_route, icon, hue, reward, sort_order, min_day, max_day, xp_reward, day, active) VALUES
  -- DIA 1 — boas-vindas
  ('d1_view_5_profiles',  'Descubra 5 energias',          'Explore 5 perfis no feed.',              'Explorar',     '/feed',           'eye',         260, 'aura_temp', 10, 1, 1, 10, 1, true),
  ('d1_complete_profile', 'Complete seu perfil',          'Mais informacao = mais conexoes.',       'Editar perfil','/profile',        'user',        200, 'aura_temp', 20, 1, 1, 15, 1, true),
  ('d1_check_radar',      'Veja quem esta online',        'Pessoas conectadas perto de voce.',      'Abrir radar',  '/radar',          'radar',       180, 'aura_temp', 30, 1, 1, 20, 1, true),
  ('d1_try_aura_match',   'Explore o Aura Match',         'Descubra afinidades sutis.',             'Aura Match',   '/aura-match',     'sparkles',    320, 'aura_temp', 40, 1, 1, 25, 1, true),
  ('d1_enter_room',       'Entre em uma sala',            'Sinta a energia ao vivo.',               'Ver salas',    '/aura-match#aura-anchor-rooms', 'users', 280, 'aura_temp', 50, 1, 1, 30, 1, true),

  -- DIA 2 — conexoes
  ('d2_send_pulse',       'Envie seu primeiro Pulso',     'Marque presenca sem dizer nada.',        'Enviar pulso', '/settings/pulses','zap',          45, 'aura_temp', 10, 2, 2, 15, 2, true),
  ('d2_like_3',           'Curta 3 perfis',               'Demonstre interesse a 3 pessoas.',       'Ir ao feed',   '/feed',           'heart',       340, 'aura_temp', 20, 2, 2, 20, 2, true),
  ('d2_follow_2',         'Siga 2 pessoas novas',         'Construa sua rede.',                     'Pesquisar',    '/pesquisar',      'user-plus',   220, 'aura_temp', 30, 2, 2, 25, 2, true),
  ('d2_view_visits',      'Veja quem visitou voce',       'Descubra quem se interessou.',           'Ver visitas',  '/visits',         'eye',         260, 'aura_temp', 40, 2, 2, 30, 2, true),
  ('d2_perfect_pair',     'Experimente o Perfect Pair',   'Encontre seu par ideal.',                'Perfect Pair', '/perfect-pair',   'heart',       320, 'aura_temp', 50, 2, 2, 35, 2, true),

  -- DIA 3 — presenca
  ('d3_create_post',      'Faca sua primeira publicacao', 'Compartilhe sua energia.',               'Criar post',   '/feed',           'edit',        280, 'aura_temp', 10, 3, 3, 20, 3, true),
  ('d3_upload_media',     'Adicione midia ao acervo',     'Enriqueca seu perfil.',                  'Minhas midias','/my-media',       'image',       200, 'aura_temp', 20, 3, 3, 25, 3, true),
  ('d3_start_chat',       'Inicie uma conversa',          'Quebre o gelo com alguem.',              'Mensagens',    '/messages',       'message',     240, 'aura_temp', 30, 3, 3, 30, 3, true),
  ('d3_search_tags',      'Pesquise por tags',            'Encontre pessoas pela afinidade.',       'Pesquisar',    '/pesquisar',      'search',      180, 'aura_temp', 40, 3, 3, 35, 3, true),
  ('d3_view_events',      'Explore os eventos',           'Veja o que esta rolando.',               'Ver eventos',  '/events',         'calendar',     30, 'aura_temp', 50, 3, 3, 40, 3, true),

  -- DIA 4 — reciprocidade
  ('d4_check_likes',      'Veja quem curtiu voce',        'Retribua quem demonstrou interesse.',    'Meus likes',   '/likes',          'heart',       340, 'aura_temp', 10, 4, 4, 25, 4, true),
  ('d4_check_followers',  'Veja seus seguidores',         'Conheca quem te acompanha.',             'Seguidores',   '/followers',      'users',       220, 'aura_temp', 20, 4, 4, 30, 4, true),
  ('d4_check_following',  'Confira quem voce segue',      'Organize sua rede.',                     'Seguindo',     '/following',      'user-check',  260, 'aura_temp', 30, 4, 4, 35, 4, true),
  ('d4_save_post',        'Salve uma publicacao',         'Guarde o que te marcou.',                'Salvos',       '/saved',          'bookmark',     30, 'aura_temp', 40, 4, 4, 40, 4, true),
  ('d4_send_gift',        'Envie um presente',            'Surpreenda alguem com XP.',              'Mensagens',    '/messages',       'gift',        320, 'aura_temp', 50, 4, 4, 45, 4, true),

  -- DIA 5 — descoberta & monetizacao
  ('d5_marketplace',      'Explore o Marketplace',        'Veja conteudos exclusivos.',             'Marketplace',  '/marketplace',    'shopping-bag',280, 'aura_temp', 10, 5, 5, 30, 5, true),
  ('d5_vitrine_vip',      'Conheca a Vitrine VIP',        'Descubra creators VIP.',                 'Vitrine VIP',  '/vitrine-vip',    'crown',        45, 'aura_temp', 20, 5, 5, 35, 5, true),
  ('d5_auctions',         'Visite os Leiloes',            'Lances unicos te esperam.',              'Leiloes',      '/auctions',       'gavel',        20, 'aura_temp', 30, 5, 5, 40, 5, true),
  ('d5_indicacoes',       'Convide alguem',               'Indique e ganhe recompensas.',           'Indicacoes',   '/indicacoes',     'gift',        320, 'aura_temp', 40, 5, 5, 45, 5, true),
  ('d5_novidades',        'Veja as novidades',            'O que ha de novo na plataforma.',        'Novidades',    '/novidades',      'star',         45, 'aura_temp', 50, 5, 5, 50, 5, true),

  -- DIA 6 — maestria
  ('d6_aura_room_again',  'Volte a uma sala Aura',        'Suas conexoes te esperam.',              'Salas',        '/aura-match#aura-anchor-rooms', 'users', 280, 'aura_temp', 10, 6, 6, 35, 6, true),
  ('d6_aura_match_again', 'Aura Match - 5 toques',        'Aprofunde sua leitura social.',          'Aura Match',   '/aura-match',     'sparkles',    320, 'aura_temp', 20, 6, 6, 40, 6, true),
  ('d6_match_message',    'Mensagem para um match',       'Continue a conversa.',                   'Matches',      '/matches',        'message',     340, 'aura_temp', 30, 6, 6, 45, 6, true),
  ('d6_subscriptions',    'Veja planos de assinatura',    'Desbloqueie o universo VIP.',            'Assinaturas',  '/subscriptions',  'crown',        45, 'aura_temp', 40, 6, 6, 50, 6, true),
  ('d6_settings',         'Revise suas configuracoes',    'Personalize sua experiencia.',           'Configuracoes','/settings',       'settings',    200, 'aura_temp', 50, 6, 6, 60, 6, true)
ON CONFLICT (key) DO UPDATE
  SET title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      cta_label   = EXCLUDED.cta_label,
      cta_route   = EXCLUDED.cta_route,
      icon        = EXCLUDED.icon,
      hue         = EXCLUDED.hue,
      sort_order  = EXCLUDED.sort_order,
      min_day     = EXCLUDED.min_day,
      max_day     = EXCLUDED.max_day,
      xp_reward   = EXCLUDED.xp_reward,
      day         = EXCLUDED.day,
      active      = true,
      updated_at  = now();

-- 4) RPC: missions_for_me v2 — por dia + dia 7 (catch-up XP x2)
DROP FUNCTION IF EXISTS public.retention_missions_for_me();
CREATE OR REPLACE FUNCTION public.retention_missions_for_me()
RETURNS TABLE (
  key text, title text, body text, cta_label text, cta_route text,
  icon text, hue int, reward text, sort_order int, completed boolean,
  xp_reward int, day int, is_last_chance boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_day int := 1;
  v_done jsonb := '[]'::jsonb;
  v_is_d7 boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT COALESCE(p.retention_day,1), COALESCE(p.completed_missions,'[]'::jsonb)
    INTO v_day, v_done
    FROM public.oculto_retention_progress p WHERE p.user_id = v_uid;
  v_day  := COALESCE(v_day, 1);
  v_done := COALESCE(v_done, '[]'::jsonb);
  v_is_d7 := (v_day >= 7);

  IF v_is_d7 THEN
    RETURN QUERY
    SELECT m.key, m.title, m.body, m.cta_label, m.cta_route, m.icon, m.hue, m.reward, m.sort_order,
           false AS completed,
           (m.xp_reward * 2)::int AS xp_reward,
           m.day, true AS is_last_chance
    FROM public.oculto_retention_missions_config m
    WHERE m.active = true
      AND m.day BETWEEN 1 AND 6
      AND NOT (v_done ? m.key)
    ORDER BY m.day ASC, m.sort_order ASC;
  ELSE
    RETURN QUERY
    SELECT m.key, m.title, m.body, m.cta_label, m.cta_route, m.icon, m.hue, m.reward, m.sort_order,
           (v_done ? m.key) AS completed,
           m.xp_reward, m.day, false AS is_last_chance
    FROM public.oculto_retention_missions_config m
    WHERE m.active = true AND m.day = v_day
    ORDER BY (v_done ? m.key) ASC, m.sort_order ASC;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.retention_missions_for_me() TO authenticated;

-- 5) RPC: mission_complete v2 — concede XP via aura_award_xp (x2 no dia 7)
DROP FUNCTION IF EXISTS public.retention_mission_complete(text);
CREATE OR REPLACE FUNCTION public.retention_mission_complete(p_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_existing  jsonb;
  v_xp        int;
  v_user_day  int;
  v_mult      int := 1;
  v_awarded   int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT xp_reward INTO v_xp
    FROM public.oculto_retention_missions_config
    WHERE key = p_key AND active = true;
  IF v_xp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'mission_not_found');
  END IF;

  INSERT INTO public.oculto_retention_progress (user_id)
  VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  SELECT completed_missions, COALESCE(retention_day,1)
    INTO v_existing, v_user_day
    FROM public.oculto_retention_progress WHERE user_id = v_uid;

  IF v_existing ? p_key THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  IF COALESCE(v_user_day,1) >= 7 THEN v_mult := 2; END IF;
  v_awarded := v_xp * v_mult;

  UPDATE public.oculto_retention_progress
    SET completed_missions = COALESCE(v_existing,'[]'::jsonb) || to_jsonb(p_key),
        last_active_at     = now(),
        updated_at         = now()
  WHERE user_id = v_uid;

  -- concede XP via engine Aura (silencioso em caso de erro)
  BEGIN
    PERFORM public.aura_award_xp(v_awarded, 'retention_mission:' || p_key);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'xp_awarded', v_awarded, 'multiplier', v_mult);
END $$;
GRANT EXECUTE ON FUNCTION public.retention_mission_complete(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
