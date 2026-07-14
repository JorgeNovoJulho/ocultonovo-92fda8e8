-- =====================================================================
-- 2026_05_09_share_landing_settings.sql  (idempotente)
-- Seed da configuração da página padrão de compartilhamento /c/:slug
-- e backfill leve de duração de vídeo.
-- =====================================================================

-- 1) Garante linha em landing_settings com setting_key='share_landing'
INSERT INTO public.landing_settings (setting_key, setting_value, updated_at)
SELECT
  'share_landing',
  jsonb_build_object(
    'show_logo', true,
    'show_creator', true,
    'show_qr', false,
    'show_price', true,
    'show_footer', true,
    'show_buy_button', true,

    'headline', 'Conteúdo Exclusivo OCULTO',
    'subheadline', 'Acesse mídias exclusivas dos seus criadores favoritos.',
    'cta_primary_text', 'Acessar conteúdo',
    'cta_signup_text', 'Criar conta para acessar',
    'cta_buy_text', 'Comprar agora',
    'footer_text', 'Plataforma OCULTO · Conteúdo +18 destinado a maiores de idade',

    'bg_gradient_from', '#0b0610',
    'bg_gradient_to', '#1a0a14',
    'accent_color', '#facc15',
    'accent_color_dark', '#a16207',
    'card_border_color', '#facc1555',

    'logo_override_url', null,
    'background_image_url', null,

    'default_blur', 'medium'
  ),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.landing_settings WHERE setting_key = 'share_landing'
);

-- 2) Backfill: media_duration_seconds <- video_duration_seconds quando nulo
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='media_duration_seconds'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='video_duration_seconds'
  ) THEN
    UPDATE public.posts
       SET media_duration_seconds = video_duration_seconds
     WHERE media_duration_seconds IS NULL
       AND video_duration_seconds IS NOT NULL
       AND video_duration_seconds > 0;

    UPDATE public.posts
       SET video_duration_seconds = media_duration_seconds
     WHERE video_duration_seconds IS NULL
       AND media_duration_seconds IS NOT NULL
       AND media_duration_seconds > 0;
  END IF;
END $$;
