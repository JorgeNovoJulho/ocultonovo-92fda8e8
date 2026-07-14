-- =====================================================================
-- Banner padrão para perfis sem capa
-- Idempotente. Cole no SQL Editor do Supabase EXTERNO.
--
-- Regras:
--   - Preenche profiles.cover_image_url com '/default-banner.jpg' apenas
--     onde for NULL ou string vazia.
--   - Não sobrescreve banners já enviados pelo usuário.
--   - Mantém o usuário livre para trocar pela tela de Configurações.
-- =====================================================================

UPDATE public.profiles
SET cover_image_url = '/default-banner.jpg',
    updated_at = COALESCE(updated_at, now())
WHERE cover_image_url IS NULL
   OR length(trim(cover_image_url)) = 0;

-- Confirmação (opcional, apenas leitura)
-- SELECT count(*) AS profiles_com_banner_padrao
-- FROM public.profiles
-- WHERE cover_image_url = '/default-banner.jpg';
