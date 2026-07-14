-- Index para filtro rápido de usuários reais vs seed/bot
CREATE INDEX IF NOT EXISTS idx_profiles_is_seed ON public.profiles (is_seed);

-- Index para status online (prioridade de quem está ativo)
CREATE INDEX IF NOT EXISTS idx_profiles_is_online ON public.profiles (is_online);

-- Index composto para ordenação otimizada no feed
CREATE INDEX IF NOT EXISTS idx_posts_is_seed_created ON public.posts (is_seed, created_at DESC);

-- Index para profiles com campos de prioridade
CREATE INDEX IF NOT EXISTS idx_profiles_priority ON public.profiles (is_seed, plan_type, is_verified, is_online);