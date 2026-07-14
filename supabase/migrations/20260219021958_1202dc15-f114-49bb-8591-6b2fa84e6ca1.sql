-- Add is_seed column to public_activities to mark bot/fake activities
ALTER TABLE public.public_activities 
ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;

-- Mark existing records with no actor_id as seed (they're mock data)
UPDATE public.public_activities 
SET is_seed = true 
WHERE actor_id IS NULL;