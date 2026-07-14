-- Remover funções antigas se existirem para evitar conflito de tipo de retorno
DROP FUNCTION IF EXISTS public.aura_xp_admin_features_list();

-- Tabela para configurações individuais de cada funcionalidade
CREATE TABLE IF NOT EXISTS public.aura_xp_interaction_configs (
    action_key TEXT PRIMARY KEY,
    actor_cost INTEGER NOT NULL DEFAULT 50,
    receiver_reward INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    category TEXT NOT NULL DEFAULT 'interaction',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_xp_interaction_configs TO authenticated;
GRANT ALL ON public.aura_xp_interaction_configs TO service_role;

ALTER TABLE public.aura_xp_interaction_configs ENABLE ROW LEVEL SECURITY;

-- Política simples: qualquer autenticado pode ler (para o sistema aplicar cobrança), mas apenas admin pode editar (será via RPC)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can read configs' AND tablename = 'aura_xp_interaction_configs') THEN
        CREATE POLICY "Anyone can read configs" ON public.aura_xp_interaction_configs FOR SELECT USING (true);
    END IF;
END $$;

-- Função para listar todas as features (hardcoded + overrides no DB)
CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS TABLE (
    action_key TEXT,
    actor_cost INTEGER,
    receiver_reward INTEGER,
    enabled BOOLEAN,
    category TEXT,
    description TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH defaults AS (
        -- MENUS
        SELECT 'menu_feed'::TEXT as ak, 50 as ac, 0 as rr, true as en, 'menu'::TEXT as cat, 'Acesso ao Feed Principal'::TEXT as ds
        UNION ALL SELECT 'menu_pesquisar', 50, 0, true, 'menu', 'Acesso à Busca de Usuários'
        UNION ALL SELECT 'menu_profile', 50, 0, true, 'menu', 'Acesso ao Próprio Perfil'
        UNION ALL SELECT 'menu_radar', 50, 0, true, 'menu', 'Acesso ao Radar de Proximidade'
        UNION ALL SELECT 'menu_canal_vip', 50, 0, true, 'menu', 'Acesso ao Canal VIP'
        UNION ALL SELECT 'menu_aura_match', 50, 0, true, 'menu', 'Acesso ao Jogo de Matches'
        UNION ALL SELECT 'menu_perfect_pair', 50, 0, true, 'menu', 'Algoritmo de Par Perfeito'
        UNION ALL SELECT 'menu_postar', 50, 0, true, 'menu', 'Acesso ao Criador de Posts'
        
        -- FERRAMENTAS
        UNION ALL SELECT 'tool_scheduled_posts', 50, 0, true, 'tool', 'Agendamento de Postagens'
        UNION ALL SELECT 'tool_photo_editor', 50, 0, true, 'tool', 'Editor de Imagens Integrado'
        UNION ALL SELECT 'tool_video_filters', 50, 0, true, 'tool', 'Filtros Avançados de Vídeo'
        UNION ALL SELECT 'tool_ghost_mode', 50, 0, true, 'tool', 'Navegação em Modo Invisível'
        UNION ALL SELECT 'tool_profile_analytics', 50, 0, true, 'tool', 'Estatísticas de Engajamento'
        
        -- BOTÕES DE AÇÃO
        UNION ALL SELECT 'btn_like', 50, 0, true, 'action_button', 'Curtir uma Postagem'
        UNION ALL SELECT 'btn_comment', 50, 0, true, 'action_button', 'Comentar em uma Postagem'
        UNION ALL SELECT 'btn_share', 50, 0, true, 'action_button', 'Compartilhar Postagem'
        UNION ALL SELECT 'btn_gift', 50, 0, true, 'action_button', 'Enviar Presentes de XP'
        UNION ALL SELECT 'btn_save', 50, 0, true, 'action_button', 'Salvar Postagem no Bloco de Notas'
        
        -- INTERAÇÕES
        UNION ALL SELECT 'inter_view_likes', 50, 0, true, 'interaction', 'Ver quem curtiu suas postagens'
        UNION ALL SELECT 'inter_view_visits', 50, 0, true, 'interaction', 'Ver quem visitou seu perfil'
        UNION ALL SELECT 'inter_super_like', 50, 0, true, 'interaction', 'Enviar Super Like no Aura Match'
        UNION ALL SELECT 'inter_boost_profile', 50, 0, true, 'interaction', 'Impulsionar perfil para novos usuários'
    )
    SELECT 
        d.ak, 
        COALESCE(c.actor_cost, d.ac), 
        COALESCE(c.receiver_reward, d.rr), 
        COALESCE(c.enabled, d.en), 
        d.cat, 
        d.ds
    FROM defaults d
    LEFT JOIN public.aura_xp_interaction_configs c ON d.ak = c.action_key;
END;
$$;

-- Função para UPSERT (Insert or Update) das configurações via painel admin
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_upsert(
    p_action_key TEXT,
    p_actor_cost INTEGER,
    p_enabled BOOLEAN,
    p_category TEXT,
    p_description TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.aura_xp_interaction_configs (
        action_key, 
        actor_cost, 
        enabled, 
        category, 
        description,
        updated_at
    )
    VALUES (
        p_action_key, 
        p_actor_cost, 
        p_enabled, 
        p_category, 
        p_description,
        now()
    )
    ON CONFLICT (action_key) DO UPDATE SET
        actor_cost = EXCLUDED.actor_cost,
        enabled = EXCLUDED.enabled,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        updated_at = now();
END;
$$;
