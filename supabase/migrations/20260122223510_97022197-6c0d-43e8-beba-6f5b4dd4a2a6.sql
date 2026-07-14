-- Adicionar campo is_super_match para identificar matches entre dois usuários VIP
ALTER TABLE public.looking_now_matches 
ADD COLUMN IF NOT EXISTS is_super_match BOOLEAN DEFAULT false;

-- Criar índice para consultas de super matches
CREATE INDEX IF NOT EXISTS idx_looking_now_matches_super 
ON public.looking_now_matches (is_super_match) 
WHERE is_super_match = true;