
-- Seed com valores padrão (tabela já existe)
INSERT INTO public.landing_settings (setting_key, setting_value) VALUES
  ('texts', '{"headline":"Conteúdo Exclusivo","subheadline":"Acesse conteúdos exclusivos dos seus criadores favoritos","cta_button":"Cadastre-se Grátis","blur_message":"Cadastre-se para ver o conteúdo completo","video_message":"Cadastre-se para assistir o vídeo completo","footer_text":"© 2026 Oculto Swing. Todos os direitos reservados."}'::jsonb),
  ('style', '{"primary_color":"#e91e63","secondary_color":"#1a1a2e","font_heading":"Inter","font_body":"Inter","logo_url":null}'::jsonb),
  ('timers', '{"image_preview_seconds":5,"video_preview_seconds":10}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
