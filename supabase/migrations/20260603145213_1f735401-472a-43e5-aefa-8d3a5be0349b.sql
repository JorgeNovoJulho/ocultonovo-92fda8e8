-- Tabela de configurações de custo de XP por ação
CREATE TABLE IF NOT EXISTS public.aura_xp_interaction_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_key TEXT UNIQUE NOT NULL,
    actor_cost INTEGER NOT NULL DEFAULT 50,
    receiver_reward INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'interaction',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aura_xp_interaction_config TO authenticated;
GRANT ALL ON public.aura_xp_interaction_config TO service_role;

-- RLS
ALTER TABLE public.aura_xp_interaction_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view interaction config" ON public.aura_xp_interaction_config FOR SELECT USING (true);
CREATE POLICY "Admin master can manage interaction config" ON public.aura_xp_interaction_config FOR ALL USING (true);

-- Tabela para controle global da economia de XP
CREATE TABLE IF NOT EXISTS public.aura_xp_global_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insere configuração inicial se não existir
INSERT INTO public.aura_xp_global_config (billing_enabled)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM public.aura_xp_global_config);

-- Garantir permissões
GRANT SELECT, UPDATE ON public.aura_xp_global_config TO authenticated;
GRANT ALL ON public.aura_xp_global_config TO service_role;

-- RLS
ALTER TABLE public.aura_xp_global_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can view global config" ON public.aura_xp_global_config FOR SELECT USING (true);
CREATE POLICY "Admin master can update global config" ON public.aura_xp_global_config FOR UPDATE USING (true);

-- RPC para listar configurações filtrando por categorias
CREATE OR REPLACE FUNCTION public.aura_xp_admin_features_list()
RETURNS TABLE (
    action_key TEXT,
    actor_cost INTEGER,
    receiver_reward INTEGER,
    enabled BOOLEAN,
    description TEXT,
    category TEXT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.action_key,
        c.actor_cost,
        c.receiver_reward,
        c.enabled,
        c.description,
        c.category
    FROM public.aura_xp_interaction_config c
    ORDER BY c.category, c.action_key;
END;
$$;

-- RPC para upsert de configurações de XP
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_upsert(
    p_action_key TEXT,
    p_actor_cost INTEGER,
    p_receiver_reward INTEGER DEFAULT 0,
    p_enabled BOOLEAN DEFAULT true,
    p_category TEXT DEFAULT 'interaction',
    p_description TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.aura_xp_interaction_config (action_key, actor_cost, receiver_reward, enabled, category, description)
    VALUES (p_action_key, p_actor_cost, p_receiver_reward, p_enabled, p_category, p_description)
    ON CONFLICT (action_key) DO UPDATE SET
        actor_cost = EXCLUDED.actor_cost,
        receiver_reward = EXCLUDED.receiver_reward,
        enabled = EXCLUDED.enabled,
        category = COALESCE(p_category, aura_xp_interaction_config.category),
        description = COALESCE(p_description, aura_xp_interaction_config.description),
        updated_at = now();
END;
$$;

-- RPC para listar todas as configurações (compatibilidade com código existente)
CREATE OR REPLACE FUNCTION public.aura_xp_interaction_config_list()
RETURNS SETOF public.aura_xp_interaction_config LANGUAGE sql AS $$
    SELECT * FROM public.aura_xp_interaction_config;
$$;

GRANT EXECUTE ON FUNCTION public.aura_xp_admin_features_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_upsert(TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aura_xp_interaction_config_list() TO authenticated;

-- Inserir alguns dados iniciais
SELECT public.aura_xp_interaction_config_upsert('post_like', 50, 0, true, 'interaction', '❤️ Curtir Post');
SELECT public.aura_xp_interaction_config_upsert('post_comment', 50, 0, true, 'interaction', '💬 Comentar Post');
SELECT public.aura_xp_interaction_config_upsert('menu_radar', 50, 0, true, 'menu', '📍 Acessar Radar');
SELECT public.aura_xp_interaction_config_upsert('tool_impersonation', 100, 0, true, 'tool', '🎭 Ferramenta de Impersonificação');
SELECT public.aura_xp_interaction_config_upsert('btn_aura_match', 50, 0, true, 'action_button', '⚡ Botão Aura Match');
