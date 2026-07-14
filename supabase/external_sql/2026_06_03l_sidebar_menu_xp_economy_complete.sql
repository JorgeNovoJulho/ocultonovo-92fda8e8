-- ============================================================
-- Economia de XP: TODOS itens do sidebar + correção do RPC
-- Externo: rvybbrkzmboqbhcemqar — rodar no SQL Editor
-- Idempotente
-- ============================================================

-- 1) Inserir/atualizar todos os action_keys do sidebar (categoria 'menu')
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, receiver_reward, enabled, category, description)
VALUES
  ('menu_feed',                 50, 0, true, 'menu', '🏠 Início (Feed)'),
  ('menu_pesquisar',             50, 0, true, 'menu', '🔍 Pesquisar'),
  ('menu_profile',               50, 0, true, 'menu', '👤 Meu Perfil'),
  ('menu_radar',                 50, 0, true, 'menu', '📍 Radar'),
  ('menu_canal_vip',             50, 0, true, 'menu', '👑 Meu Canal VIP'),
  ('menu_aura_match',            50, 0, true, 'menu', '✨ Aura Match'),
  ('menu_perfect_pair',          50, 0, true, 'menu', '❤️ Perfect Pair'),
  ('menu_publicar',              50, 0, true, 'menu', '➕ Publicar'),
  ('menu_sessoes_ocultas',       50, 0, true, 'menu', '🌌 Sessões Ocultas'),
  ('menu_followers',             50, 0, true, 'menu', '👥 Seguidores'),
  ('menu_following',             50, 0, true, 'menu', '🤝 Seguindo'),
  ('menu_my_gifts',              50, 0, true, 'menu', '🎁 Meus Presentes'),
  ('menu_matches',               50, 0, true, 'menu', '🔥 Matches'),
  ('menu_chat',                  50, 0, true, 'menu', '💬 Chat'),
  ('menu_notepad',               50, 0, true, 'menu', '📝 Bloco de Notas'),
  ('menu_likes',                 50, 0, true, 'menu', '❤️ Curtidas'),
  ('menu_ranking',               50, 0, true, 'menu', '🏆 Ranking'),
  ('menu_visits',                50, 0, true, 'menu', '👁️ Visitas Recebidas'),
  ('menu_notifications',         50, 0, true, 'menu', '🔔 Notificações'),
  ('menu_promotions',            50, 0, true, 'menu', '🎉 Promoções'),
  ('menu_my_media',              50, 0, true, 'menu', '📁 Minhas Mídias'),
  ('menu_vip_downloads',         50, 0, true, 'menu', '⬇️ Meus Downloads VIP'),
  ('menu_safety_checkin',        50, 0, true, 'menu', '🛡️ Encontro Seguro'),
  ('menu_support',               50, 0, true, 'menu', '⚠️ Problemas / Suporte'),
  ('menu_plans_paid',            50, 0, true, 'menu', '👑 Planos Pagos'),
  ('menu_subscriptions',         50, 0, true, 'menu', '👑 Assinaturas'),
  ('menu_vitrine',               50, 0, true, 'menu', '🛍️ Vitrine'),
  ('menu_affiliates',            50, 0, true, 'menu', '🎁 Ganhe Indicando'),
  ('menu_events',                50, 0, true, 'menu', '🎊 Eventos'),
  ('menu_saved',                 50, 0, true, 'menu', '🔖 Salvos'),
  ('menu_auctions',              50, 0, true, 'menu', '🔨 Leilões'),
  ('menu_financeiro',            50, 0, true, 'menu', '💰 Financeiro'),
  ('menu_settings',              50, 0, true, 'menu', '⚙️ Configurações'),
  ('menu_experiencias_ocultas',  50, 0, true, 'menu', '🌒 Experiências Ocultas')
ON CONFLICT (action_key) DO UPDATE
  SET category = EXCLUDED.category,
      description = COALESCE(NULLIF(public.aura_xp_interaction_config.description, ''), EXCLUDED.description);

-- 2) Sementes mínimas para ferramentas / botões / interações (idempotente)
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, receiver_reward, enabled, category, description)
VALUES
  ('tool_scheduled_posts',  50, 0, true, 'tool',          'Agendamento de Postagens'),
  ('tool_photo_editor',     50, 0, true, 'tool',          'Editor de Imagens Integrado'),
  ('tool_video_filters',    50, 0, true, 'tool',          'Filtros Avançados de Vídeo'),
  ('tool_ghost_mode',       50, 0, true, 'tool',          'Modo Invisível'),
  ('tool_profile_analytics',50, 0, true, 'tool',          'Estatísticas de Engajamento'),
  ('btn_like',              1,  1, true, 'action_button', 'Curtir uma Postagem'),
  ('btn_comment',           1,  3, true, 'action_button', 'Comentar em uma Postagem'),
  ('btn_share',             1,  5, true, 'action_button', 'Compartilhar Postagem'),
  ('btn_gift',              50, 0, true, 'action_button', 'Enviar Presente'),
  ('btn_save',              1,  2, true, 'action_button', 'Salvar Postagem'),
  ('inter_view_likes',      5,  5, true, 'interaction',   'Ver quem curtiu suas postagens'),
  ('inter_view_visits',     5,  0, true, 'interaction',   'Ver quem visitou seu perfil'),
  ('inter_super_like',     50,  0, true, 'interaction',   'Super Like no Aura Match'),
  ('inter_boost_profile',  50,  0, true, 'interaction',   'Impulsionar perfil')
ON CONFLICT (action_key) DO NOTHING;

-- 3) RPC dinâmico: retorna TUDO da tabela singular (corrige bug "configs" plural)
CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS TABLE(action_key text, actor_cost integer, receiver_reward integer, enabled boolean, category text, description text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.action_key::text,
    c.actor_cost,
    c.receiver_reward,
    c.enabled,
    c.category::text,
    c.description::text
  FROM public.aura_xp_interaction_config c
  ORDER BY c.category, c.action_key;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO anon, authenticated, service_role;

-- 4) Garantir Realtime para reflexo instantâneo no sidebar
ALTER TABLE public.aura_xp_interaction_config REPLICA IDENTITY FULL;
ALTER TABLE public.aura_xp_global_config       REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'aura_xp_interaction_config';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_xp_interaction_config';
  END IF;
END $$;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'aura_xp_global_config';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.aura_xp_global_config';
  END IF;
END $$;

-- 5) Recarrega cache PostgREST
NOTIFY pgrst, 'reload schema';
