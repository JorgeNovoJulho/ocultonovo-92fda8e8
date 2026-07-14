-- Allow users to manage their own paid video download access via profile ownership.
DROP POLICY IF EXISTS "Users can view own media access via profile" ON public.media_access;
DROP POLICY IF EXISTS "Users can insert own media access via profile" ON public.media_access;
DROP POLICY IF EXISTS "Users can delete own media access via profile" ON public.media_access;

CREATE POLICY "Users can view own media access via profile"
ON public.media_access FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = media_access.user_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can insert own media access via profile"
ON public.media_access FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = media_access.user_id AND p.user_id = auth.uid()));

CREATE POLICY "Users can delete own media access via profile"
ON public.media_access FOR DELETE
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = media_access.user_id AND p.user_id = auth.uid()));
