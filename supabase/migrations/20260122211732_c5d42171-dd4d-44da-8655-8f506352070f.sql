-- Adicionar campo is_flash para posts efêmeros de 24h
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS is_flash BOOLEAN DEFAULT false;

-- Criar índice para buscar flash posts eficientemente
CREATE INDEX IF NOT EXISTS idx_posts_flash_stories 
ON public.posts (is_flash, created_at DESC) 
WHERE is_flash = true;

-- Criar tabela para rastrear visualizações de stories
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(story_id, viewer_id)
);

-- Habilitar RLS na tabela story_views
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para story_views
CREATE POLICY "Usuários autenticados podem criar views"
ON public.story_views
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Criadores podem ver quem visualizou seus stories"
ON public.story_views
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.posts p
    JOIN public.profiles pr ON p.user_id = pr.id
    WHERE p.id = story_views.story_id
    AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem ver suas próprias visualizações"
ON public.story_views
FOR SELECT
USING (viewer_id = auth.uid());

-- Habilitar realtime para stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_views;