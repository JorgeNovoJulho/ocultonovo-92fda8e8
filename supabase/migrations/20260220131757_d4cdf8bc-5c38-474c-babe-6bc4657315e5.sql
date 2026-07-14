
-- Índices compostos para filtragem anti-bot e janela temporal no feed
-- Garante que a query (created_at >= 5 dias AND is_seed = false) seja instantânea

-- Índice para filtragem temporal + anti-seed no feed principal
CREATE INDEX IF NOT EXISTS idx_posts_feed_antibot
  ON public.posts (created_at DESC, user_id)
  WHERE is_flash IS DISTINCT FROM true;

-- Índice em profiles para is_seed (usado na join de autores)
CREATE INDEX IF NOT EXISTS idx_profiles_is_seed
  ON public.profiles (is_seed)
  WHERE is_seed = true;

-- Índice em profiles para is_test_account
CREATE INDEX IF NOT EXISTS idx_profiles_is_test
  ON public.profiles (is_test_account)
  WHERE is_test_account = true;

-- Índice para get_suggested_users filtrar bots eficientemente
CREATE INDEX IF NOT EXISTS idx_profiles_real_users
  ON public.profiles (id)
  WHERE is_seed IS DISTINCT FROM true AND is_test_account IS DISTINCT FROM true;
