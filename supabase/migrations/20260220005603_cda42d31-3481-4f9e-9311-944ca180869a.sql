
-- Adiciona política UPDATE em perfect_pairs para o upsert via RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'perfect_pairs' AND policyname = 'Users can update own pairs'
  ) THEN
    EXECUTE '
      CREATE POLICY "Users can update own pairs"
        ON public.perfect_pairs FOR UPDATE
        USING (
          auth.uid() = (SELECT user_id FROM profiles WHERE id = perfect_pairs.user_id)
        )
    ';
  END IF;
END;
$$;
