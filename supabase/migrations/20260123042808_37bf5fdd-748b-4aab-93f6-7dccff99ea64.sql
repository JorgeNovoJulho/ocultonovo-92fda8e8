-- Adicionar campos para compartilhamento e metadados de mídia na tabela posts
ALTER TABLE public.posts
ADD COLUMN IF NOT EXISTS allow_sharing BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS share_link TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_filename TEXT DEFAULT NULL;

-- Criar tabela para rastrear links de compartilhamento
CREATE TABLE IF NOT EXISTS public.media_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  share_code TEXT UNIQUE NOT NULL,
  views_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS para share_links
ALTER TABLE public.media_share_links ENABLE ROW LEVEL SECURITY;

-- Criadores podem gerenciar seus links
CREATE POLICY "Creator can manage share links" ON public.media_share_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM posts p 
      JOIN profiles pr ON p.user_id = pr.id 
      WHERE p.id = post_id AND pr.user_id = auth.uid()
    )
  );

-- Qualquer um pode visualizar links públicos (para acesso via share code)
CREATE POLICY "Anyone can view share links by code" ON public.media_share_links
  FOR SELECT USING (true);

-- Permitir incrementar views_count
CREATE POLICY "Anyone can update view count" ON public.media_share_links
  FOR UPDATE USING (true)
  WITH CHECK (true);