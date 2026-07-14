
-- Table to store user-created custom tags accessible to all
CREATE TABLE public.custom_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('social', 'adult')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tag_name, tag_type)
);

ALTER TABLE public.custom_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read custom tags" ON public.custom_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create custom tags" ON public.custom_tags FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
