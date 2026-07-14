-- Tabela de convites para eventos
CREATE TABLE public.event_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  message text,
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(event_id, recipient_id)
);

-- Índices para performance
CREATE INDEX idx_event_invites_event_id ON public.event_invites(event_id);
CREATE INDEX idx_event_invites_sender_id ON public.event_invites(sender_id);
CREATE INDEX idx_event_invites_recipient_id ON public.event_invites(recipient_id);
CREATE INDEX idx_event_invites_status ON public.event_invites(status);

-- RLS
ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

-- Criador do evento pode enviar convites
CREATE POLICY "Criadores podem enviar convites" ON public.event_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.profiles p ON e.creator_id = p.id
      WHERE e.id = event_id 
        AND p.user_id = auth.uid()
    )
  );

-- Usuários podem ver convites que enviaram ou receberam
CREATE POLICY "Usuários podem ver seus convites" ON public.event_invites
  FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Destinatários podem atualizar status do convite
CREATE POLICY "Destinatários podem responder convites" ON public.event_invites
  FOR UPDATE TO authenticated
  USING (
    recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  WITH CHECK (
    recipient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Criadores podem deletar convites pendentes
CREATE POLICY "Criadores podem cancelar convites" ON public.event_invites
  FOR DELETE TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    AND status = 'pending'
  );

-- Realtime para notificações
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_invites;