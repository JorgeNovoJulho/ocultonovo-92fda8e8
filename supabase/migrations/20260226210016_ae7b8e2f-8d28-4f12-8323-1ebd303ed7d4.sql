-- Permitir que o usuário que recebeu a curtida marque essa curtida como vista
CREATE POLICY "Users can mark received likes as seen"
ON public.profile_likes
FOR UPDATE
USING (
  liked_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  liked_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
);