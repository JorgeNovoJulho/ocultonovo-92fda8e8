-- =====================================================
-- 1. TABELA DE FOTOS DO EVENTO
-- =====================================================
CREATE TABLE IF NOT EXISTS public.event_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  photo_url text NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now()
);

-- Index para busca por evento
CREATE INDEX IF NOT EXISTS idx_event_photos_event_id ON public.event_photos(event_id);

-- Enable RLS
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;

-- Participantes confirmados podem visualizar fotos (coluna correta: recipient_id)
CREATE POLICY "Participantes podem ver fotos do evento"
ON public.event_photos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_id AND e.creator_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.event_rsvps r WHERE r.event_id = event_photos.event_id AND r.user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.event_invites i WHERE i.event_id = event_photos.event_id AND i.recipient_id = (SELECT id FROM profiles WHERE user_id = auth.uid()) AND i.status = 'accepted'
  )
);

-- Participantes com check-in podem fazer upload de fotos
CREATE POLICY "Participantes com check-in podem adicionar fotos"
ON public.event_photos FOR INSERT
WITH CHECK (
  user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.event_checkins c WHERE c.event_id = event_photos.event_id AND c.user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

-- Usuários podem deletar suas próprias fotos
CREATE POLICY "Usuários podem deletar suas próprias fotos"
ON public.event_photos FOR DELETE
USING (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Organizador pode deletar qualquer foto do seu evento
CREATE POLICY "Organizador pode deletar fotos do evento"
ON public.event_photos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_id AND e.creator_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

-- =====================================================
-- 2. TABELA DE AVALIAÇÕES DO EVENTO
-- =====================================================
CREATE TABLE IF NOT EXISTS public.event_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback text,
  aspects jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Index para busca por evento
CREATE INDEX IF NOT EXISTS idx_event_ratings_event_id ON public.event_ratings(event_id);

-- Enable RLS
ALTER TABLE public.event_ratings ENABLE ROW LEVEL SECURITY;

-- Participantes com check-in podem avaliar
CREATE POLICY "Participantes com check-in podem avaliar"
ON public.event_ratings FOR INSERT
WITH CHECK (
  user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.event_checkins c WHERE c.event_id = event_ratings.event_id AND c.user_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

-- Usuários podem ver suas próprias avaliações
CREATE POLICY "Usuários podem ver suas avaliações"
ON public.event_ratings FOR SELECT
USING (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Organizador pode ver todas avaliações do seu evento
CREATE POLICY "Organizador pode ver avaliações do evento"
ON public.event_ratings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_id AND e.creator_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  )
);

-- Usuários podem atualizar sua avaliação
CREATE POLICY "Usuários podem atualizar sua avaliação"
ON public.event_ratings FOR UPDATE
USING (user_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- =====================================================
-- 3. PREFERÊNCIA DE NOTIFICAÇÃO NO RSVP
-- =====================================================
ALTER TABLE public.event_rsvps 
ADD COLUMN IF NOT EXISTS mute_notifications boolean DEFAULT false;

-- =====================================================
-- 4. REALTIME PARA FOTOS
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'event_photos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.event_photos;
  END IF;
END $$;