-- Bucket para imagens de eventos
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS para bucket de imagens de eventos
CREATE POLICY "VIP pode fazer upload de imagens de eventos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'event-images' 
  AND EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() 
    AND plan_type = 'vip'
  )
);

CREATE POLICY "Qualquer um pode ver imagens de eventos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'event-images');

CREATE POLICY "Criador pode deletar suas imagens de eventos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'event-images' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Tabela de check-in para eventos
CREATE TABLE public.event_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  checked_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  checked_in_at timestamptz DEFAULT now(),
  notes text,
  UNIQUE(event_id, user_id)
);

-- Índices
CREATE INDEX idx_event_checkins_event_id ON public.event_checkins(event_id);
CREATE INDEX idx_event_checkins_user_id ON public.event_checkins(user_id);

-- RLS para check-ins
ALTER TABLE public.event_checkins ENABLE ROW LEVEL SECURITY;

-- Organizadores podem criar check-ins
CREATE POLICY "Organizadores podem fazer check-in"
ON public.event_checkins FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.profiles p ON e.creator_id = p.id
    WHERE e.id = event_id AND p.user_id = auth.uid()
  )
);

-- Todos podem ver check-ins do evento
CREATE POLICY "Participantes podem ver check-ins"
ON public.event_checkins FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.event_rsvps r
    JOIN public.profiles p ON r.user_id = p.id
    WHERE r.event_id = event_checkins.event_id AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.profiles p ON e.creator_id = p.id
    WHERE e.id = event_id AND p.user_id = auth.uid()
  )
);

-- Organizadores podem deletar check-ins
CREATE POLICY "Organizadores podem remover check-in"
ON public.event_checkins FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.profiles p ON e.creator_id = p.id
    WHERE e.id = event_id AND p.user_id = auth.uid()
  )
);

-- Tabela de mensagens do chat do evento
CREATE TABLE public.event_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX idx_event_messages_event_id ON public.event_messages(event_id);
CREATE INDEX idx_event_messages_created_at ON public.event_messages(created_at);

-- RLS para mensagens
ALTER TABLE public.event_messages ENABLE ROW LEVEL SECURITY;

-- Participantes confirmados podem enviar mensagens
CREATE POLICY "Participantes podem enviar mensagens"
ON public.event_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND (
    -- É o criador do evento
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.profiles p ON e.creator_id = p.id
      WHERE e.id = event_id AND p.user_id = auth.uid()
    )
    -- Ou confirmou interesse
    OR EXISTS (
      SELECT 1 FROM public.event_rsvps r
      JOIN public.profiles p ON r.user_id = p.id
      WHERE r.event_id = event_messages.event_id AND p.user_id = auth.uid()
    )
    -- Ou aceitou convite
    OR EXISTS (
      SELECT 1 FROM public.event_invites i
      JOIN public.profiles p ON i.recipient_id = p.id
      WHERE i.event_id = event_messages.event_id 
        AND p.user_id = auth.uid() 
        AND i.status = 'accepted'
    )
  )
);

-- Participantes podem ver mensagens
CREATE POLICY "Participantes podem ver mensagens"
ON public.event_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.profiles p ON e.creator_id = p.id
    WHERE e.id = event_id AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.event_rsvps r
    JOIN public.profiles p ON r.user_id = p.id
    WHERE r.event_id = event_messages.event_id AND p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.event_invites i
    JOIN public.profiles p ON i.recipient_id = p.id
    WHERE i.event_id = event_messages.event_id 
      AND p.user_id = auth.uid() 
      AND i.status = 'accepted'
  )
);

-- Remetentes podem deletar próprias mensagens
CREATE POLICY "Usuários podem deletar próprias mensagens"
ON public.event_messages FOR DELETE TO authenticated
USING (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Realtime para chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_checkins;