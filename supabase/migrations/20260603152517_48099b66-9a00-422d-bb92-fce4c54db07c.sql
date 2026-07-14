-- Drop existing functions to avoid return type conflicts
DROP FUNCTION IF EXISTS public.aura_xp_admin_features_list();
DROP FUNCTION IF EXISTS public.aura_xp_interaction_config_list();

-- Inserir/Atualizar itens de Menu Lateral
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, category, description, enabled)
VALUES 
  ('menu_feed', 50, 'menu', '🏠 Feed de Notícias', true),
  ('menu_radar', 50, 'menu', '📍 Radar Oculto', true),
  ('menu_pesquisar', 50, 'menu', '🔍 Pesquisa Avançada', true),
  ('menu_profile', 50, 'menu', '👤 Meu Perfil', true),
  ('menu_followers', 50, 'menu', '👥 Ver Seguidores', true),
  ('menu_following', 50, 'menu', '🤝 Ver Seguindo', true),
  ('menu_perfect_pair', 50, 'menu', '❤️ Perfect Pair', true),
  ('menu_aura_match', 50, 'menu', '✨ Aura Match', true),
  ('menu_canal_vip', 50, 'menu', '👑 Canal VIP', true),
  ('menu_chat', 50, 'menu', '💬 Conversas e Chat', true),
  ('menu_notifications', 50, 'menu', '🔔 Notificações', true),
  ('menu_saved', 50, 'menu', '🔖 Itens Salvos', true),
  ('menu_financeiro', 50, 'menu', '💰 Painel Financeiro', true),
  ('menu_settings', 50, 'menu', '⚙️ Configurações', true),
  ('menu_support', 50, 'menu', '🎫 Suporte Técnico', true)
ON CONFLICT (action_key) DO UPDATE SET 
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Inserir/Atualizar Ferramentas
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, category, description, enabled)
VALUES 
  ('tool_impersonation', 100, 'tool', '🎭 Impersonificação (Admin)', true),
  ('tool_scheduled_posts', 50, 'tool', '📅 Agendamento de Posts', true),
  ('tool_notepad', 50, 'tool', '📝 Bloco de Notas', true),
  ('tool_ads_manager', 50, 'tool', '📢 Gestor de Anúncios', true),
  ('tool_reports_panel', 50, 'tool', '🛡️ Central de Denúncias', true),
  ('tool_analytics', 50, 'tool', '📊 Analytics e Métricas', true),
  ('tool_test_mode', 50, 'tool', '🧪 Modo de Teste', true)
ON CONFLICT (action_key) DO UPDATE SET 
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Inserir/Atualizar Botões de Ação
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, category, description, enabled)
VALUES 
  ('btn_like', 50, 'action_button', '❤️ Curtir (Botão)', true),
  ('btn_comment', 50, 'action_button', '💬 Comentar (Botão)', true),
  ('btn_share', 50, 'action_button', '🚀 Compartilhar', true),
  ('btn_save', 50, 'action_button', '🔖 Salvar Postagem', true),
  ('btn_report', 50, 'action_button', '🚩 Denunciar Postagem', true),
  ('btn_send_gift', 50, 'action_button', '🎁 Enviar Presente', true),
  ('btn_write_mural', 50, 'action_button', '✍️ Escrever no Mural', true),
  ('btn_aura_match', 50, 'action_button', '⚡ Aura Match (Post)', true)
ON CONFLICT (action_key) DO UPDATE SET 
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Inserir/Atualizar Interações
INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, category, description, enabled)
VALUES 
  ('post_like', 50, 'interaction', '❤️ Curtir Postagem', true),
  ('post_comment', 50, 'interaction', '💬 Comentar Postagem', true),
  ('profile_visit', 50, 'interaction', '👤 Visitar Perfil', true),
  ('message_send', 50, 'interaction', '✉️ Enviar Mensagem', true),
  ('follow_user', 50, 'interaction', '➕ Seguir Usuário', true),
  ('aura_gift', 50, 'interaction', '🎁 Presente de Aura', true)
ON CONFLICT (action_key) DO UPDATE SET 
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Criar RPC de listagem unificada
CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS SETOF public.aura_xp_interaction_config
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM aura_xp_interaction_config ORDER BY category, description;
$$;

-- Alias para compatibilidade com o hook useAuraXpCatalog
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_list()
RETURNS SETOF public.aura_xp_interaction_config
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM aura_xp_interaction_config WHERE enabled = true;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO service_role;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_list() TO service_role;
