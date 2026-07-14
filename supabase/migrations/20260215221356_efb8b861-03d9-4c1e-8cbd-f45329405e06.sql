
-- Ensure anon and authenticated roles can insert into creator_founder_applications
GRANT INSERT, SELECT ON public.creator_founder_applications TO anon;
GRANT INSERT, SELECT ON public.creator_founder_applications TO authenticated;

-- Also update the INSERT policy to explicitly target anon and authenticated
DROP POLICY IF EXISTS "Anyone can submit founder application" ON public.creator_founder_applications;
CREATE POLICY "Anyone can submit founder application"
ON public.creator_founder_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
