-- Fix RLS polls: cobrir perfis legados (profiles.id = auth.uid()).
-- Idempotente.

DROP POLICY IF EXISTS "Creators can insert polls" ON public.polls;
CREATE POLICY "Creators can insert polls" ON public.polls
  FOR INSERT TO authenticated
  WITH CHECK (
    creator_id IN (
      SELECT id FROM public.profiles
       WHERE user_id = auth.uid() OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Creators can update their polls" ON public.polls;
CREATE POLICY "Creators can update their polls" ON public.polls
  FOR UPDATE TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM public.profiles
       WHERE user_id = auth.uid() OR id = auth.uid()
    )
  )
  WITH CHECK (
    creator_id IN (
      SELECT id FROM public.profiles
       WHERE user_id = auth.uid() OR id = auth.uid()
    )
  );

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid='public.poll_options'::regclass LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.poll_options', r.polname);
  END LOOP;
END$$;

CREATE POLICY "read poll_options" ON public.poll_options
  FOR SELECT USING (true);

CREATE POLICY "creators manage poll_options" ON public.poll_options
  FOR ALL TO authenticated
  USING (
    poll_id IN (
      SELECT id FROM public.polls
       WHERE creator_id IN (
         SELECT id FROM public.profiles
          WHERE user_id = auth.uid() OR id = auth.uid()
       )
    )
  )
  WITH CHECK (
    poll_id IN (
      SELECT id FROM public.polls
       WHERE creator_id IN (
         SELECT id FROM public.profiles
          WHERE user_id = auth.uid() OR id = auth.uid()
       )
    )
  );

NOTIFY pgrst, 'reload schema';
