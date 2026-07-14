-- Adiciona campo social_links (JSONB) na tabela profiles
-- Estrutura: { instagram: "user", telegram: "user", tiktok: "user", twitter: "user",
--             youtube: "@canal", whatsapp: "5511999999999", onlyfans: "user",
--             privacy: "user", website: "https://..." }
-- Idempotente: pode rodar várias vezes sem erro.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.social_links IS
  'Links de redes sociais públicas do usuário (instagram, telegram, tiktok, twitter, youtube, whatsapp, onlyfans, privacy, website).';

-- Garante grants (idempotente)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
