-- ============================================================================
-- Aura XP Gifts — persistência do estado "Agradecido" (idempotente)
-- ============================================================================
-- Adiciona a coluna `thanked_at` em oculto_aura_xp_gifts para que o botão
-- "Agradecer" mantenha o estado "Agradecido" mesmo após logout / troca de
-- dispositivo. Antes era persistido apenas em localStorage.
-- ============================================================================

ALTER TABLE public.oculto_aura_xp_gifts
  ADD COLUMN IF NOT EXISTS thanked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_oculto_aura_xp_gifts_thanked_at
  ON public.oculto_aura_xp_gifts (receiver_id, thanked_at);

-- Permite que o destinatário marque seu próprio presente como agradecido.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'oculto_aura_xp_gifts'
      AND policyname = 'gift_receiver_can_thank'
  ) THEN
    CREATE POLICY gift_receiver_can_thank
      ON public.oculto_aura_xp_gifts
      FOR UPDATE
      USING (
        receiver_id = auth.uid()
        OR receiver_id IN (
          SELECT id FROM public.profiles WHERE user_id = auth.uid()
        )
        OR receiver_id IN (
          SELECT user_id FROM public.profiles WHERE id = auth.uid()
        )
      )
      WITH CHECK (
        receiver_id = auth.uid()
        OR receiver_id IN (
          SELECT id FROM public.profiles WHERE user_id = auth.uid()
        )
        OR receiver_id IN (
          SELECT user_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
