-- Tabela de eventos (somente VIP pode criar)
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  location text NOT NULL,
  event_date date NOT NULL,
  event_time time NOT NULL,
  image_url text,
  max_attendees integer,
  price text,
  tags text[],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de interesse (RSVP)
CREATE TABLE public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Índices para performance
CREATE INDEX idx_events_creator_id ON public.events(creator_id);
CREATE INDEX idx_events_event_date ON public.events(event_date);
CREATE INDEX idx_events_is_active ON public.events(is_active);
CREATE INDEX idx_event_rsvps_event_id ON public.event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_user_id ON public.event_rsvps(user_id);

-- RLS para eventos
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- Políticas: Todos autenticados podem ver eventos ativos
CREATE POLICY "Eventos visíveis para todos autenticados" ON public.events
  FOR SELECT TO authenticated USING (is_active = true);

-- Apenas VIP pode criar eventos
CREATE POLICY "VIP pode criar eventos" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = creator_id 
        AND user_id = auth.uid()
        AND plan_type = 'vip'
    )
  );

-- Criador pode atualizar próprios eventos
CREATE POLICY "Criador pode atualizar eventos" ON public.events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = events.creator_id 
        AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = events.creator_id 
        AND user_id = auth.uid()
    )
  );

-- Criador pode deletar próprios eventos
CREATE POLICY "Criador pode deletar eventos" ON public.events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = events.creator_id 
        AND user_id = auth.uid()
    )
  );

-- RSVPs: Usuários podem ver todos os RSVPs
CREATE POLICY "RSVPs visíveis para autenticados" ON public.event_rsvps
  FOR SELECT TO authenticated USING (true);

-- Usuários podem criar próprios RSVPs
CREATE POLICY "Usuários podem criar RSVP" ON public.event_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = event_rsvps.user_id 
        AND user_id = auth.uid()
    )
  );

-- Usuários podem deletar próprios RSVPs
CREATE POLICY "Usuários podem cancelar RSVP" ON public.event_rsvps
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = event_rsvps.user_id 
        AND user_id = auth.uid()
    )
  );

-- Realtime para contador de RSVPs
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_rsvps;