-- Add category and attachment columns to support_tickets
ALTER TABLE public.support_tickets 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'problem',
ADD COLUMN IF NOT EXISTS attachment_url text;

-- Add check constraint for category
ALTER TABLE public.support_tickets 
ADD CONSTRAINT support_tickets_category_check 
CHECK (category IN ('problem', 'suggestion', 'complaint'));
