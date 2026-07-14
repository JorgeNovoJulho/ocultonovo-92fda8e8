import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from '@/hooks/use-toast';

export interface CoupleVerificationDoc {
  id: string;
  profile_id: string;
  partner_number: 1 | 2;
  document_type: 'id_front' | 'id_back' | 'selfie';
  storage_path: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoupleVerificationStatus {
  partner1: {
    name: string | null;
    docVerified: boolean;
    selfieVerified: boolean;
    documents: CoupleVerificationDoc[];
  };
  partner2: {
    name: string | null;
    docVerified: boolean;
    selfieVerified: boolean;
    documents: CoupleVerificationDoc[];
  };
  isFullyVerified: boolean;
}

// Get current user's couple verification status
export function useCoupleVerificationStatus() {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['couple-verification-status', profile?.id],
    queryFn: async (): Promise<CoupleVerificationStatus | null> => {
      if (!profile?.id) return null;

      // Get profile verification fields
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('partner1_name, partner2_name, partner1_doc_verified, partner2_doc_verified, partner1_selfie_verified, partner2_selfie_verified, is_verified_couple')
        .eq('id', profile.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile verification:', profileError);
        return null;
      }

      // Get verification documents
      const { data: docs, error: docsError } = await (supabase as any)
        .from('couple_verification_docs')
        .select('*')
        .eq('profile_id', profile.id)
        .order('created_at', { ascending: false });

      if (docsError) {
        console.error('Error fetching verification docs:', docsError);
      }

      const partner1Docs = (docs || []).filter((d: CoupleVerificationDoc) => d.partner_number === 1);
      const partner2Docs = (docs || []).filter((d: CoupleVerificationDoc) => d.partner_number === 2);

      return {
        partner1: {
          name: profileData.partner1_name,
          docVerified: profileData.partner1_doc_verified || false,
          selfieVerified: profileData.partner1_selfie_verified || false,
          documents: partner1Docs,
        },
        partner2: {
          name: profileData.partner2_name,
          docVerified: profileData.partner2_doc_verified || false,
          selfieVerified: profileData.partner2_selfie_verified || false,
          documents: partner2Docs,
        },
        isFullyVerified: profileData.is_verified_couple || false,
      };
    },
    enabled: !!profile?.id && profile?.profile_type === 'couple',
  });
}

// Upload verification document - AUTO APPROVE with admin review flag
export function useUploadVerificationDoc() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      partnerNumber,
      documentType,
      file,
    }: {
      partnerNumber: 1 | 2;
      documentType: 'id_front' | 'id_back' | 'selfie';
      file: File;
    }) => {
      if (!profile?.id) throw new Error('Profile not found');

      // Upload file to storage (using post-media bucket which exists)
      const fileName = `verification/${profile.id}/${partnerNumber}/${documentType}_${Date.now()}.${file.name.split('.').pop()}`;
      
      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Check if document already exists
      const { data: existingDoc } = await (supabase as any)
        .from('couple_verification_docs')
        .select('id')
        .eq('profile_id', profile.id)
        .eq('partner_number', partnerNumber)
        .eq('document_type', documentType)
        .single();

      if (existingDoc) {
        // Update existing - AUTO APPROVE but mark for review
        const { error: dbError } = await (supabase as any)
          .from('couple_verification_docs')
          .update({
            storage_path: fileName,
            status: 'approved', // Auto-approve
            needs_admin_review: true, // Flag for admin review
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingDoc.id);

        if (dbError) throw dbError;
      } else {
        // Create new - AUTO APPROVE but mark for review
        const { error: dbError } = await (supabase as any)
          .from('couple_verification_docs')
          .insert([{
            profile_id: profile.id,
            partner_number: partnerNumber,
            document_type: documentType,
            storage_path: fileName,
            status: 'approved', // Auto-approve
            needs_admin_review: true, // Flag for admin review
          }]);

        if (dbError) throw dbError;
      }

      // Update partner verification fields immediately
      const updateFields: Record<string, boolean> = {};
      if (partnerNumber === 1) {
        if (documentType === 'selfie') {
          updateFields.partner1_selfie_verified = true;
        } else {
          updateFields.partner1_doc_verified = true;
        }
      } else {
        if (documentType === 'selfie') {
          updateFields.partner2_selfie_verified = true;
        } else {
          updateFields.partner2_doc_verified = true;
        }
      }

      await supabase
        .from('profiles')
        .update(updateFields)
        .eq('id', profile.id);

      // Check if all documents are now complete
      const { data: allDocs } = await (supabase as any)
        .from('couple_verification_docs')
        .select('partner_number, document_type, status')
        .eq('profile_id', profile.id);

      const requiredDocs = [
        { partner_number: 1, document_type: 'id_front' },
        { partner_number: 1, document_type: 'id_back' },
        { partner_number: 1, document_type: 'selfie' },
        { partner_number: 2, document_type: 'id_front' },
        { partner_number: 2, document_type: 'id_back' },
        { partner_number: 2, document_type: 'selfie' },
      ];

      const hasAllDocs = requiredDocs.every(required => 
        (allDocs || []).some((doc: CoupleVerificationDoc) => 
          doc.partner_number === required.partner_number && 
          doc.document_type === required.document_type &&
          doc.status !== 'rejected'
        )
      );
      
      if (hasAllDocs) {
        // Mark couple as verified
        await supabase
          .from('profiles')
          .update({ 
            is_verified_couple: true,
            partner1_doc_verified: true,
            partner1_selfie_verified: true,
            partner2_doc_verified: true,
            partner2_selfie_verified: true
          })
          .eq('id', profile.id);

        // Create admin notification for review
        await (supabase as any).from('admin_notifications').insert([{
          type: 'couple_verification',
          title: '🔍 Nova verificação de casal pendente',
          body: `O perfil @${profile.username || profile.name} enviou todos os documentos e foi auto-aprovado. Revisão manual necessária.`,
          data: { profileId: profile.id, username: profile.username }
        }]);
      }

      return { hasAllDocs };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['couple-verification-status'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: data?.hasAllDocs ? '🎉 Casal Verificado!' : 'Documento enviado!',
        description: data?.hasAllDocs 
          ? 'Todos os documentos foram enviados e aprovados automaticamente. Um moderador irá revisar em breve.'
          : 'Documento aprovado automaticamente. Continue enviando os demais.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar documento',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update partner names
export function useUpdatePartnerNames() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      partner1Name,
      partner2Name,
    }: {
      partner1Name: string;
      partner2Name: string;
    }) => {
      if (!profile?.id) throw new Error('Profile not found');

      const { error } = await supabase
        .from('profiles')
        .update({
          partner1_name: partner1Name,
          partner2_name: partner2Name,
        })
        .eq('id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['couple-verification-status'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// Admin: Approve or reject verification
export function useReviewVerificationDoc() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      docId,
      status,
      rejectionReason,
    }: {
      docId: string;
      status: 'approved' | 'rejected';
      rejectionReason?: string;
    }) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { error } = await (supabase as any)
        .from('couple_verification_docs')
        .update({
          status,
          needs_admin_review: false,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
        })
        .eq('id', docId);

      if (error) throw error;

      // Get doc info to update profile
      const { data: doc } = await (supabase as any)
        .from('couple_verification_docs')
        .select('profile_id, partner_number, document_type')
        .eq('id', docId)
        .single();

      if (doc && status === 'approved') {
        // Update profile verification fields based on what was approved
        const updateFields: Record<string, boolean> = {};
        
        if (doc.partner_number === 1) {
          if (doc.document_type === 'selfie') {
            updateFields.partner1_selfie_verified = true;
          } else {
            updateFields.partner1_doc_verified = true;
          }
        } else {
          if (doc.document_type === 'selfie') {
            updateFields.partner2_selfie_verified = true;
          } else {
            updateFields.partner2_doc_verified = true;
          }
        }

        await supabase
          .from('profiles')
          .update(updateFields)
          .eq('id', doc.profile_id);

        // Check if fully verified
        const { data: profileData } = await supabase
          .from('profiles')
          .select('partner1_doc_verified, partner2_doc_verified, partner1_selfie_verified, partner2_selfie_verified')
          .eq('id', doc.profile_id)
          .single();

        if (profileData &&
            profileData.partner1_doc_verified &&
            profileData.partner2_doc_verified &&
            profileData.partner1_selfie_verified &&
            profileData.partner2_selfie_verified) {
          await supabase
            .from('profiles')
            .update({ is_verified_couple: true, is_verified: true })
            .eq('id', doc.profile_id);
        }
      } else if (doc && status === 'rejected') {
        // Remove couple verification if rejected
        await supabase
          .from('profiles')
          .update({ is_verified_couple: false })
          .eq('id', doc.profile_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['couple-verification-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-docs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-stats'] });
      toast({
        title: 'Documento revisado!',
      });
    },
  });
}
