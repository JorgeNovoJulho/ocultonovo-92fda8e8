-- Adicionar coluna updated_at para rastrear edições de comentários
ALTER TABLE public.post_comments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NULL;

-- Política RLS para permitir atualização apenas do próprio comentário
-- e apenas dentro de 5 minutos após criação
CREATE POLICY "Users can update own comments within 5 minutes"
ON public.post_comments FOR UPDATE
TO authenticated
USING (
  user_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
  AND (NOW() - created_at) < INTERVAL '5 minutes'
)
WITH CHECK (
  user_id IN (
    SELECT id FROM profiles WHERE user_id = auth.uid()
  )
  AND (NOW() - created_at) < INTERVAL '5 minutes'
);