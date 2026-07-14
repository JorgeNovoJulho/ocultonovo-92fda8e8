-- Remover política existente que usa ALL (sem WITH CHECK para INSERT)
DROP POLICY IF EXISTS "Creator can manage share links" ON public.media_share_links;

-- Criar políticas separadas para cada operação com WITH CHECK correto
CREATE POLICY "Creator can insert share links"
ON public.media_share_links FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM posts p
    JOIN profiles pr ON p.user_id = pr.id
    WHERE p.id = media_share_links.post_id
    AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Creator can update share links"
ON public.media_share_links FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM posts p
    JOIN profiles pr ON p.user_id = pr.id
    WHERE p.id = media_share_links.post_id
    AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Creator can delete share links"
ON public.media_share_links FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM posts p
    JOIN profiles pr ON p.user_id = pr.id
    WHERE p.id = media_share_links.post_id
    AND pr.user_id = auth.uid()
  )
);