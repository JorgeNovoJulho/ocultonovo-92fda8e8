-- 1. Adicionar coluna de saldo de XP se não existir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS aura_xp INTEGER NOT NULL DEFAULT 1000;

-- 2. Função para processar cobranças de XP
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_charge(
    p_action_key TEXT,
    p_post_id UUID DEFAULT NULL,
    p_receiver_id UUID DEFAULT NULL,
    p_ref_key TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_actor_id UUID;
    v_cost INTEGER;
    v_enabled BOOLEAN;
    v_global_enabled BOOLEAN;
    v_actor_balance INTEGER;
    v_receiver_reward INTEGER;
BEGIN
    -- Identificar o ator
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
    END IF;

    -- Checar global (se não existir, assume habilitado)
    SELECT billing_enabled INTO v_global_enabled FROM public.aura_xp_global_config LIMIT 1;
    IF v_global_enabled = false THEN
        RETURN jsonb_build_object('ok', true, 'reason', 'disabled_globally');
    END IF;

    -- Obter custo da ação do banco ou usar defaults
    SELECT actor_cost, enabled, receiver_reward 
    INTO v_cost, v_enabled, v_receiver_reward
    FROM public.aura_xp_interaction_configs
    WHERE action_key = p_action_key;

    IF v_cost IS NULL THEN
        -- Defaults baseados na lista oficial
        v_cost := 50;
        v_enabled := true;
        v_receiver_reward := 0;
    END IF;

    IF v_enabled = false THEN
        RETURN jsonb_build_object('ok', true, 'reason', 'disabled');
    END IF;

    -- Verificar saldo
    SELECT aura_xp INTO v_actor_balance FROM public.profiles WHERE id = v_actor_id;
    
    IF v_actor_balance < v_cost THEN
        RETURN jsonb_build_object(
            'ok', false, 
            'reason', 'insufficient_xp', 
            'actor_cost', v_cost, 
            'actor_balance', v_actor_balance
        );
    END IF;

    -- Deduzir saldo
    UPDATE public.profiles SET aura_xp = aura_xp - v_cost WHERE id = v_actor_id;
    
    -- Recompensar recebedor (opcional)
    IF p_receiver_id IS NOT NULL AND v_receiver_reward > 0 AND p_receiver_id != v_actor_id THEN
        UPDATE public.profiles SET aura_xp = aura_xp + v_receiver_reward WHERE id = p_receiver_id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true, 
        'reason', 'success', 
        'actor_cost', v_cost, 
        'actor_balance', v_actor_balance - v_cost,
        'receiver_reward', v_receiver_reward
    );
END;
$$;

-- 3. Garantir que a lista administrativa inclua todas as categorias pedidas
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
