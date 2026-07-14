-- Add pair_bio column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'pair_bio'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN pair_bio text DEFAULT '';
  END IF;
END $$;