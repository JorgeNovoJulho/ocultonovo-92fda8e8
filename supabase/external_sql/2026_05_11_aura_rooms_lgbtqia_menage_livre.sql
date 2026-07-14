-- =====================================================================
-- Aura Match — Novas salas: LGBTQIA+, Adoramos Menage, Tema Livre
-- Idempotente. Cole no SQL Editor do Supabase externo.
-- =====================================================================

INSERT INTO public.oculto_aura_rooms
  (slug, name, theme, hue, emoji, active, vip_only,
   hour_from, hour_to, min_aura_level, min_social_score, min_prestige_xp,
   required_plan, requires_kyc, couple_only, sort_order, glow_intensity, description)
VALUES
  ('lgbtqia-plus',     'LGBTQIA+',         'Diversidade, orgulho e conexões livres',
   310, '🏳️‍🌈', true, false, NULL, NULL, 0, 0, 0, NULL, false, false, 15, 75,
   'Espaço seguro de afeto e desejo para toda a comunidade LGBTQIA+.'),

  ('adoramos-menage',  'Adoramos Menage',  'Trios e dinâmicas plurais',
   340, '🔥',     true, false, NULL, NULL, 0, 0, 0, NULL, false, false, 25, 80,
   'Quem curte ménage e dinâmicas a três (ou mais) — sem julgamentos.'),

  ('tema-livre',       'Tema Livre',       'Conversa solta, qualquer assunto',
   200, '💬',     true, false, NULL, NULL, 0, 0, 0, NULL, false, false, 35, 60,
   'Sala aberta, sem tema fixo — papo livre entre auras.')
ON CONFLICT (slug) DO UPDATE SET
  name             = EXCLUDED.name,
  theme            = EXCLUDED.theme,
  hue              = EXCLUDED.hue,
  emoji            = EXCLUDED.emoji,
  active           = EXCLUDED.active,
  vip_only         = EXCLUDED.vip_only,
  description      = EXCLUDED.description,
  glow_intensity   = EXCLUDED.glow_intensity,
  sort_order       = EXCLUDED.sort_order;
