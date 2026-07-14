-- Fix: "new row violates row-level security policy for table oculto_play_items"
-- Causa: a policy de INSERT exigia public.can_access_oculto_play(), que retorna
-- false quando o beta não está aberto e o usuário não está na allowlist.
-- Autores logados com profile próprio devem poder publicar normalmente; o gate
-- continua aplicado no SELECT (visualização) e nas demais policies.

DROP POLICY IF EXISTS "op_items_author_insert" ON public.oculto_play_items;

CREATE POLICY "op_items_author_insert"
  ON public.oculto_play_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = author_id
        AND p.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
