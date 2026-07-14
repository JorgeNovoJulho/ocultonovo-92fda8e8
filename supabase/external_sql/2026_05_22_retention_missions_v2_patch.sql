-- =============================================================
-- RETENTION MISSIONS V2 — PATCH: substitui 5 missoes de features
-- desativadas no beta (Perfect Pair, Eventos, Marketplace, Leiloes,
-- Planos de Assinatura) por missoes equivalentes em rotas ativas.
-- Rodar no SQL Editor do Supabase EXTERNO. 100% idempotente.
-- =============================================================

-- 1) Desativa as missoes antigas (mantem historico no banco)
UPDATE public.oculto_retention_missions_config
   SET active = false, updated_at = now()
 WHERE key IN (
   'd2_perfect_pair',   -- 10: Perfect Pair -> nao existe mais (Aura Match)
   'd3_view_events',    -- 15: Eventos -> desativados no beta
   'd5_marketplace',    -- 21: Marketplace -> nao ativado
   'd5_auctions',       -- 23: Leiloes -> desativados no beta
   'd6_subscriptions'   -- 29: Assinaturas -> apenas plano gratuito no beta
 );

-- 2) Insere/atualiza as 5 substituicoes (mesmos slots: day + sort_order)
INSERT INTO public.oculto_retention_missions_config
  (key, title, body, cta_label, cta_route, icon, hue, reward, sort_order, min_day, max_day, xp_reward, day, active) VALUES
  -- Substitui #10 (DIA 2, slot 50) — antes: Perfect Pair
  ('d2_update_profile_tags', 'Adicione tags ao perfil',     'Mais tags = melhores conexoes via Aura.', 'Editar perfil', '/profile',        'tag',         200, 'aura_temp', 50, 2, 2, 35, 2, true),

  -- Substitui #15 (DIA 3, slot 50) — antes: Eventos
  ('d3_set_preferences',     'Ajuste suas preferencias',    'Personalize sua experiencia no Oculto.',  'Configuracoes', '/settings',       'settings',    200, 'aura_temp', 50, 3, 3, 40, 3, true),

  -- Substitui #21 (DIA 5, slot 10) — antes: Marketplace
  ('d5_radar_focus',         'Foque seu radar',             'Veja quem esta conectado agora.',         'Abrir radar',   '/radar',          'radar',       180, 'aura_temp', 10, 5, 5, 30, 5, true),

  -- Substitui #23 (DIA 5, slot 30) — antes: Leiloes
  ('d5_search_people',       'Pesquise novas pessoas',      'Encontre afinidades por tags ou nome.',   'Pesquisar',     '/pesquisar',      'search',      260, 'aura_temp', 30, 5, 5, 40, 5, true),

  -- Substitui #29 (DIA 6, slot 40) — antes: Assinaturas
  ('d6_aura_deepen',         'Aprofunde no Aura Match',     'Faca uma nova rodada de leitura social.', 'Aura Match',    '/aura-match',     'sparkles',    320, 'aura_temp', 40, 6, 6, 50, 6, true)
ON CONFLICT (key) DO UPDATE
  SET title       = EXCLUDED.title,
      body        = EXCLUDED.body,
      cta_label   = EXCLUDED.cta_label,
      cta_route   = EXCLUDED.cta_route,
      icon        = EXCLUDED.icon,
      hue         = EXCLUDED.hue,
      sort_order  = EXCLUDED.sort_order,
      min_day     = EXCLUDED.min_day,
      max_day     = EXCLUDED.max_day,
      xp_reward   = EXCLUDED.xp_reward,
      day         = EXCLUDED.day,
      active      = true,
      updated_at  = now();

NOTIFY pgrst, 'reload schema';
