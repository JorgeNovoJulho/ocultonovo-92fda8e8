-- Add couple verification fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_verified_couple BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partner1_doc_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partner2_doc_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partner1_selfie_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partner2_selfie_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS partner1_name TEXT,
ADD COLUMN IF NOT EXISTS partner2_name TEXT;

-- Create couple_verification_documents table for storing document references
CREATE TABLE IF NOT EXISTS public.couple_verification_docs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  partner_number INTEGER NOT NULL CHECK (partner_number IN (1, 2)),
  document_type TEXT NOT NULL CHECK (document_type IN ('id_front', 'id_back', 'selfie')),
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profile_id, partner_number, document_type)
);

-- Enable RLS
ALTER TABLE public.couple_verification_docs ENABLE ROW LEVEL SECURITY;

-- Users can view their own verification docs
CREATE POLICY "Users can view own verification docs"
ON public.couple_verification_docs
FOR SELECT
USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Users can create their own verification docs
CREATE POLICY "Users can create verification docs"
ON public.couple_verification_docs
FOR INSERT
WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Admins can view all verification docs
CREATE POLICY "Admins can view all verification docs"
ON public.couple_verification_docs
FOR SELECT
USING (is_admin(auth.uid()));

-- Admins can update verification docs (approve/reject)
CREATE POLICY "Admins can update verification docs"
ON public.couple_verification_docs
FOR UPDATE
USING (is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_couple_verification_docs_updated_at
BEFORE UPDATE ON public.couple_verification_docs
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_timestamp();