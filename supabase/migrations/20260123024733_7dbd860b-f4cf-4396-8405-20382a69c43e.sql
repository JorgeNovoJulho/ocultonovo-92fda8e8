-- Insert testimonials section into site_sections
INSERT INTO site_sections (section_type, section_key, section_name, display_order, is_visible, content)
VALUES (
  'testimonials',
  'testimonials',
  'Depoimentos',
  7,
  true,
  '{
    "badge": "💬 Histórias Reais",
    "title": "O que dizem sobre o OCULTO",
    "subtitle": "Depoimentos de quem já vive essa experiência"
  }'::jsonb
)
ON CONFLICT (section_key) DO NOTHING;