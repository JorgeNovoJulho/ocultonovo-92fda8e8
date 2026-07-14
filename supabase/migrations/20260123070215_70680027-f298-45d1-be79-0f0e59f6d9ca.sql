-- Add story_id column to content_reports for story reporting
-- Stories are flash posts, so this references the posts table
ALTER TABLE public.content_reports 
ADD COLUMN IF NOT EXISTS story_id uuid REFERENCES public.posts(id) ON DELETE CASCADE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_content_reports_story_id 
ON public.content_reports(story_id);