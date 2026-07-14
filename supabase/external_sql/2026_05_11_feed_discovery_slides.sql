-- =====================================================================
-- Feed Discovery Slides — Carrossel "Descubra o Universo Oculto"
-- Idempotente. Rodar no SQL Editor do Supabase EXTERNO.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.feed_discovery_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  cta_label text NOT NULL,
  cta_route text NOT NULL,
  icon text,
  category text,
  target_plans text[] NOT NULL DEFAULT ARRAY['free','premium','vip'],
  priority integer NOT NULL DEFAULT 0,
  is_new boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  requires_kyc boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fds_active_priority
  ON public.feed_discovery_slides (is_active, priority DESC);

ALTER TABLE public.feed_discovery_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discovery_read_active ON public.feed_discovery_slides;
CREATE POLICY discovery_read_active ON public.feed_discovery_slides
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS discovery_admin_all ON public.feed_discovery_slides;
CREATE POLICY discovery_admin_all ON public.feed_discovery_slides
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fds_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fds_updated_at ON public.feed_discovery_slides;
CREATE TRIGGER trg_fds_updated_at
  BEFORE UPDATE ON public.feed_discovery_slides
  FOR EACH ROW EXECUTE FUNCTION public.fds_set_updated_at();

-- ---------------------------------------------------------------------
-- Seed inicial (idempotente via slug UNIQUE)
-- ---------------------------------------------------------------------
INSERT INTO public.feed_discovery_slides
  (slug, title, description, cta_label, cta_route, icon, category, target_plans, priority, is_new)
VALUES
  ('aura-match',      'Aura Match',           'Descubra quem está sentindo sua presença agora. Conexões raras, instantâneas.', 'Entrar no Aura Match',      '/aura-match',            'sparkles',       'social',       ARRAY['free','premium','vip'], 100, true),
  ('salas',           'Salas Sociais',        'Ambientes ao vivo no Aura Match onde o desejo encontra companhia.',             'Explorar Salas',            '/aura-match?tab=salas',  'users',          'social',       ARRAY['free','premium','vip'],  90, false),
  ('radar',           'Radar Oculto',         'Veja presenças próximas e quem está ativo agora ao seu redor.',                  'Abrir Radar',               '/radar',                 'radar',          'discovery',    ARRAY['premium','vip'],          85, false),
  ('chat',            'Chat Privado',         'Conversas que começam discretas e podem ir longe.',                              'Abrir Chat',                '/messages',              'message-circle', 'social',       ARRAY['free','premium','vip'],  70, false),
  ('criar-post',      'Crie sua presença',    'Publique e seja descoberto pelos olhares certos.',                               'Criar Publicação',          '/feed',                  'plus-circle',    'creator',      ARRAY['free','premium','vip'],  60, false),
  ('vitrine-vip',     'Vitrine VIP',          'Os criadores mais desejados do Oculto, em um só lugar.',                         'Ver Vitrine VIP',           '/vitrine-vip',           'crown',          'vip',          ARRAY['free','premium','vip'],  80, false),
  ('canais-vip',      'Canais VIP',           'Conteúdo exclusivo direto dos seus criadores favoritos.',                        'Explorar Canais',           '/subscriptions',         'star',           'vip',          ARRAY['free','premium','vip'],  78, false),
  ('monetizar',       'Monetize seu charme',  'Transforme presença em renda. Ative seu canal VIP agora.',                       'Ativar Monetização',        '/subscriptions',         'banknote',       'creator',      ARRAY['free','premium','vip'],  95, true),
  ('plano-vip',       'Plano VIP',            'Acesso completo, sem limites, com prioridade absoluta.',                         'Ver Plano VIP',             '/subscriptions',         'crown',          'plans',        ARRAY['free','premium'],         88, false),
  ('eventos',         'Eventos Oculto',       'Encontros marcados, momentos inesquecíveis.',                                    'Ver Eventos',               '/events',                'calendar',       'events',       ARRAY['premium','vip'],          65, false),
  ('leiloes',         'Leilões Oculto',       'Ofertas únicas em tempo real. Ouse arrematar.',                                  'Ver Leilões',               '/auctions',              'gavel',          'events',       ARRAY['premium','vip'],          55, false),
  ('conquistas',      'Suas Conquistas',      'XP, níveis e badges. Sua jornada vira lenda no Aura Match.',                     'Ver Conquistas',            '/aura-match',            'trophy',         'gamification', ARRAY['free','premium','vip'],  40, false),
  ('prestigio',       'Prestígio Social',     'Acompanhe seu nível, badges e prestígio direto no seu perfil.',                  'Ver Meu Prestígio',         '/profile',               'flame',          'gamification', ARRAY['free','premium','vip'],  45, true),
  ('encontro-seguro', 'Encontro Seguro',      'Compartilhe seu check-in e tenha proteção em tempo real nos seus encontros.',    'Ativar Encontro Seguro',    '/profile?tab=safety',               'shield',         'safety',       ARRAY['free','premium','vip'],  75, true)
ON CONFLICT (slug) DO UPDATE SET
  title         = EXCLUDED.title,
  description   = EXCLUDED.description,
  cta_label     = EXCLUDED.cta_label,
  cta_route     = EXCLUDED.cta_route,
  icon          = EXCLUDED.icon,
  category      = EXCLUDED.category,
  target_plans  = EXCLUDED.target_plans,
  priority      = EXCLUDED.priority,
  is_new        = EXCLUDED.is_new,
  updated_at    = now();
