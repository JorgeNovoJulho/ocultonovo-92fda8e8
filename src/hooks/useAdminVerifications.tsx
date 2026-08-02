import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// ── Types ───────────────────────────────────────────────────────────────

export interface VerificationDoc {
  id: string;
  profile_id: string;
  partner_number: number;
  document_type: string;
  storage_path: string;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  needs_admin_review: boolean;
  created_at: string;
  updated_at: string;
  profile?: {
    id: string;
    user_id: string;
    username: string | null;
    name: string;
    avatar_url: string | null;
    partner1_name: string | null;
    partner2_name: string | null;
    is_verified_couple: boolean;
  };
}

export interface VerificationStats {
  pending: number;
  autoApproved: number;
  approved: number;
  rejected: number;
  total: number;
}

export interface GroupedVerification {
  profile: VerificationDoc['profile'];
  documents: VerificationDoc[];
  partner1Docs: VerificationDoc[];
  partner2Docs: VerificationDoc[];
  needsReview: boolean;
  allApproved: boolean;
}

// ── Identity (KYC) types ────────────────────────────────────────────────

export interface IdentityVerificationUser {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  gender: string | null;
  email?: string | null;
  plan_type: string | null;
  is_verified: boolean;
  is_verified_couple: boolean;
  bio: string | null;
  created_at: string;
  pendencies?: string[];
  // Subscription info
  subscription_created_at?: string | null;
  subscription_expires_at?: string | null;
  subscription_status?: string | null;
  // KYC info
  kyc_submitted_at?: string | null;
  kyc_type?: string | null;
  kyc_document_url?: string | null;
  kyc_document_back_url?: string | null;
  kyc_selfie_url?: string | null;
}

export interface IdentityStats {
  verified: number;
  unverified: number;
  total: number;
  kycSubmitted: number;
}

async function resolveIdentityProfileRow(profileId: string, userId?: string | null) {
  const { data: byId, error: byIdError } = await supabase
    .from('profiles')
    .select('id, user_id, is_verified')
    .eq('id', profileId)
    .maybeSingle();

  if (byIdError) throw byIdError;
  if (byId) return byId;

  if (userId) {
    const { data: byUserId, error: byUserIdError } = await supabase
      .from('profiles')
      .select('id, user_id, is_verified')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (byUserIdError) throw byUserIdError;
    if (byUserId) return byUserId;
  }

  const { data: byProfileAsUserId, error: byProfileAsUserIdError } = await supabase
    .from('profiles')
    .select('id, user_id, is_verified')
    .eq('user_id', profileId)
    .limit(1)
    .maybeSingle();

  if (byProfileAsUserIdError) throw byProfileAsUserIdError;
  if (byProfileAsUserId) return byProfileAsUserId;

  return null;
}

// ── Founder types ───────────────────────────────────────────────────────

export interface FounderApplication {
  id: string;
  user_id: string;
  applicant_name: string | null;
  applicant_email: string | null;
  career_description: string | null;
  social_links: Record<string, string> | null;
  photo_url: string | null;
  video_url: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
}

export interface FounderStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

// ── Audit helper ────────────────────────────────────────────────────────

async function logAuditAction(
  adminId: string,
  actionType: string,
  targetResource: string,
  targetId: string,
  details: Record<string, unknown>
) {
  try {
    await (supabase as any).from('audit_logs').insert([{
      action: actionType,
      admin_id: adminId,
      action_type: actionType,
      target_resource: targetResource,
      target_id: targetId,
      details: details as any,
      user_agent: navigator.userAgent
    }]);
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// COUPLE VERIFICATION HOOKS (existing)
// ═══════════════════════════════════════════════════════════════════════

export function useVerificationStats(enabled: boolean = true) {
  return useQuery({
    queryKey: ['admin-verification-stats'],
    queryFn: async (): Promise<VerificationStats> => {
      // Versão enxuta: 1 query agregada, sem buscar lista de seed/test
      // (filtro de bots ocorre nos painéis detalhados, não nas contagens
      // exibidas no sidebar do admin).
      const { data, error } = await supabase
        .from('couple_verification_docs')
        .select('status, needs_admin_review')
        .limit(5000);
      if (error) throw error;

      const stats: VerificationStats = {
        pending: 0, autoApproved: 0, approved: 0, rejected: 0, total: (data || []).length
      };

      (data || []).forEach((doc: any) => {
        if (doc.status === 'pending') stats.pending++;
        else if (doc.status === 'approved' && doc.needs_admin_review) stats.autoApproved++;
        else if (doc.status === 'approved' && !doc.needs_admin_review) stats.approved++;
        else if (doc.status === 'rejected') stats.rejected++;
      });

      return stats;
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
}

export function useVerificationDocs(statusFilter: string = 'all') {
  return useQuery({
    queryKey: ['admin-verification-docs', statusFilter],
    queryFn: async (): Promise<GroupedVerification[]> => {
      let query = supabase
        .from('couple_verification_docs')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter === 'pending') {
        query = query.eq('needs_admin_review', true);
      } else if (statusFilter === 'approved') {
        query = query.eq('status', 'approved').eq('needs_admin_review', false);
      } else if (statusFilter === 'rejected') {
        query = query.eq('status', 'rejected');
      }

      const { data, error } = await query;
      if (error) throw error;

      const docs = (data || []) as any[];
      const profileIds = [...new Set(docs.map((d) => d.profile_id).filter(Boolean))];
      const { data: profiles } = profileIds.length
        ? await (supabase as any)
            .from('profiles')
            .select('id, user_id, username, name, avatar_url, partner1_name, partner2_name, is_verified_couple, is_seed, is_test_account')
            .in('id', profileIds)
        : { data: [] as any[] };
      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));

      // Attach profile and filter out bots/seed/test accounts
      const realDocs = docs
        .map((d: any) => ({ ...d, profile: profileMap.get(d.profile_id) || null }))
        .filter((doc: any) => {
          const p = doc.profile;
          return p && !p.is_seed && !p.is_test_account;
        });

      const groupedMap = new Map<string, GroupedVerification>();

      realDocs.forEach((doc: VerificationDoc) => {
        const profileId = doc.profile_id;
        if (!groupedMap.has(profileId)) {
          groupedMap.set(profileId, {
            profile: doc.profile, documents: [], partner1Docs: [], partner2Docs: [],
            needsReview: false, allApproved: true
          });
        }
        const group = groupedMap.get(profileId)!;
        group.documents.push(doc);
        if (doc.partner_number === 1) group.partner1Docs.push(doc);
        else group.partner2Docs.push(doc);
        if (doc.needs_admin_review && doc.status !== 'rejected') group.needsReview = true;
        if (doc.status !== 'approved' || doc.needs_admin_review) group.allApproved = false;
      });

      return Array.from(groupedMap.values());
    }
  });
}

export function useApproveVerification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ docId, profileId }: { docId: string; profileId: string }) => {
      const { error } = await supabase
        .from('couple_verification_docs')
        .update({ status: 'approved', needs_admin_review: false, reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
        .eq('id', docId);
      if (error) throw error;

      const { data: allDocs } = await supabase
        .from('couple_verification_docs')
        .select('status, needs_admin_review')
        .eq('profile_id', profileId);

      const allApproved = allDocs?.every(d => d.status === 'approved' && !d.needs_admin_review);
      if (allApproved) {
        await supabase.from('profiles').update({
          is_verified_couple: true, partner1_doc_verified: true, partner1_selfie_verified: true,
          partner2_doc_verified: true, partner2_selfie_verified: true
        }).eq('id', profileId);
      }
      return { docId, profileId, allApproved };
    },
    onSuccess: async (data) => {
      if (user?.id) await logAuditAction(user.id, 'couple_doc_approved', 'couple_verification_docs', data.docId, { profileId: data.profileId, allApproved: data.allApproved });
      toast({ title: "✅ Documento Aprovado", description: data.allApproved ? "Casal verificado!" : "Documento aprovado." });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-docs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-stats'] });
    },
    onError: (error) => { toast({ title: "Erro ao aprovar", description: error.message, variant: "destructive" }); }
  });
}

export function useRejectVerification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ docId, profileId, reason }: { docId: string; profileId: string; reason: string }) => {
      const { error } = await supabase
        .from('couple_verification_docs')
        .update({ status: 'rejected', needs_admin_review: false, rejection_reason: reason, reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
        .eq('id', docId);
      if (error) throw error;
      await supabase.from('profiles').update({ is_verified_couple: false }).eq('id', profileId);
      return { docId, profileId, reason };
    },
    onSuccess: async (data) => {
      if (user?.id) await logAuditAction(user.id, 'couple_doc_rejected', 'couple_verification_docs', data.docId, { profileId: data.profileId, reason: data.reason });
      toast({ title: "🚫 Documento Rejeitado", description: "Usuário notificado." });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-docs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-stats'] });
    },
    onError: (error) => { toast({ title: "Erro ao rejeitar", description: error.message, variant: "destructive" }); }
  });
}

export function useApproveAllDocs() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ profileId }: { profileId: string }) => {
      const { error } = await supabase
        .from('couple_verification_docs')
        .update({ status: 'approved', needs_admin_review: false, reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
        .eq('profile_id', profileId)
        .neq('status', 'rejected');
      if (error) throw error;

      await supabase.from('profiles').update({
        is_verified_couple: true, partner1_doc_verified: true, partner1_selfie_verified: true,
        partner2_doc_verified: true, partner2_selfie_verified: true
      }).eq('id', profileId);

      return { profileId };
    },
    onSuccess: async (data) => {
      if (user?.id) await logAuditAction(user.id, 'couple_all_docs_approved', 'profiles', data.profileId, {});
      toast({ title: "✅ Casal Verificado", description: "Todos os documentos aprovados!" });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-docs'] });
      queryClient.invalidateQueries({ queryKey: ['admin-verification-stats'] });
    },
    onError: (error) => { toast({ title: "Erro ao aprovar", description: error.message, variant: "destructive" }); }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// IDENTITY (KYC) HOOKS
// ═══════════════════════════════════════════════════════════════════════

export function useIdentityStats() {
  return useQuery({
    queryKey: ['admin-identity-stats'],
    queryFn: async (): Promise<IdentityStats> => {
      const baseFilter = (q: any) => q;

      const { count: verifiedCount } = await baseFilter(
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_verified', true)
      );

      const { count: totalCount } = await baseFilter(
        supabase.from('profiles').select('*', { count: 'exact', head: true })
      );

      const { count: kycCount } = await baseFilter(
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .not('kyc_submitted_at', 'is', null)
          .eq('is_verified', false)
      );

      const verified = verifiedCount || 0;
      const total = totalCount || 0;
      return {
        verified,
        unverified: total - verified,
        total,
        kycSubmitted: kycCount || 0,
      };
    }
  });
}

export function useIdentityUsers(filter: 'all' | 'verified' | 'unverified' | 'kyc_submitted' = 'all') {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeTable('profiles', () => {
      queryClient.invalidateQueries({ queryKey: ['admin-identity-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-identity-stats'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: ['admin-identity-users', filter, user?.id],
    queryFn: async (): Promise<IdentityVerificationUser[]> => {
      const MASTER_EMAIL = 'oculto_master@gmail.com';
      const MASTER_USERNAME = 'ocultomaster';

      let query = supabase
        .from('profiles')
        .select('id, user_id, name, display_name, username, email, avatar_url, gender, plan_type, is_verified, is_verified_couple, bio, created_at, is_seed, kyc_submitted_at, kyc_type, kyc_document_url, kyc_document_back_url, kyc_selfie_url')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (filter === 'verified') query = query.eq('is_verified', true);
      else if (filter === 'unverified') query = query.eq('is_verified', false);
      else if (filter === 'kyc_submitted') {
        query = query.not('kyc_submitted_at', 'is', null).eq('is_verified', false);
      }

      const { data, error } = await query;

      // Em cenários com RLS restritivo, mantemos fallback local em vez de quebrar a tela
      const users = ([...(data || [])] as any[]);
      if (error) {
        console.warn('[useIdentityUsers] profiles query blocked, using fallback list:', error.message);
      }

      const hasById = (id?: string | null) => !!id && users.some((u) => u?.id === id);

      const hasByUserId = (uid?: string | null) => !!uid && users.some((u) => u?.user_id === uid);

      // Garantia 1: usuário autenticado atual sempre aparece na listview
      if (user?.id && !hasByUserId(user.id)) {
        const { data: selfProfile } = await supabase
          .from('profiles')
          .select('id, user_id, name, display_name, username, email, avatar_url, gender, plan_type, is_verified, is_verified_couple, bio, created_at, is_seed')
          .eq('user_id', user.id)
          .maybeSingle();

        if (selfProfile) users.unshift(selfProfile as any);
      }

      // Garantia 2: conta master aparece mesmo se email estiver nulo em profiles
      const hasMaster = users.some(
        (u) => u?.email === MASTER_EMAIL || (u?.username || '').toLowerCase() === MASTER_USERNAME
      );

      if (!hasMaster) {
        const { data: masterCandidates } = await supabase
          .from('profiles')
          .select('id, user_id, name, display_name, username, email, avatar_url, gender, plan_type, is_verified, is_verified_couple, bio, created_at, is_seed')
          .or(`email.eq.${MASTER_EMAIL},username.eq.${MASTER_USERNAME}`)
          .limit(2);

        (masterCandidates || []).forEach((m: any) => {
          if (!hasById(m.id)) users.unshift(m);
        });
      }

      // Fallback final: injeta usuário autenticado quando não veio de profiles
      if (user?.id && !hasByUserId(user.id)) {
        const meta = (user.user_metadata || {}) as Record<string, any>;
        const fallbackName = (meta.display_name || meta.name || meta.full_name || user.email?.split('@')[0] || 'Usuário') as string;
        const fallbackUsername = (meta.username || user.email?.split('@')[0] || null) as string | null;
        const fallbackAvatar = (
          meta.avatar_url ||
          meta.picture ||
          meta.avatar ||
          meta.profile_image_url ||
          null
        ) as string | null;

        users.unshift({
          id: user.id,
          user_id: user.id,
          name: fallbackName,
          display_name: (meta.display_name as string) || null,
          username: fallbackUsername,
          email: user.email || null,
          avatar_url: fallbackAvatar,
          gender: (meta.gender as string) || null,
          plan_type: user.email === MASTER_EMAIL ? 'vip' : null,
          is_verified: user.email === MASTER_EMAIL ? true : false,
          is_verified_couple: false,
          bio: (meta.bio as string) || null,
          created_at: user.created_at || new Date().toISOString(),
          is_seed: false,
        });
      }

      // Respeita filtro de aba também no fallback local
      const filteredUsers = users.filter((u) => {
        const identityVerified = !!u.is_verified;
        if (filter === 'verified') return identityVerified;
        if (filter === 'unverified') return !identityVerified;
        if (filter === 'kyc_submitted') return !!u.kyc_submitted_at && !identityVerified;
        return true;
      });

      const profileIds = filteredUsers.map((u) => u.id);

      // Fetch latest active subscription for each user
      const subsMap = new Map<string, { created_at: string; expires_at: string | null; status: string }>();
      if (profileIds.length > 0) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('subscriber_id, created_at, expires_at, status')
          .in('subscriber_id', profileIds)
          .order('created_at', { ascending: false });

        (subs || []).forEach((s: any) => {
          if (!subsMap.has(s.subscriber_id)) {
            subsMap.set(s.subscriber_id, { created_at: s.created_at, expires_at: s.expires_at, status: s.status });
          }
        });
      }

      return filteredUsers.map((u) => {
        const identityVerified = !!u.is_verified;
        const pendencies: string[] = [];
        if (!identityVerified && !u.avatar_url) pendencies.push('Sem foto de perfil');
        if (!identityVerified && !u.bio) pendencies.push('Sem bio');
        if (!identityVerified && !u.gender) pendencies.push('Gênero não informado');

        const sub = subsMap.get(u.id);
        return {
          ...u,
          is_verified: identityVerified,
          pendencies,
          subscription_created_at: sub?.created_at || null,
          subscription_expires_at: sub?.expires_at || null,
          subscription_status: sub?.status || null,
        } as IdentityVerificationUser;
      });
    },
  });
}

export function useToggleIdentityVerification() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ profileId, userId, verified }: { profileId: string; userId?: string | null; verified: boolean }) => {
      const { data: rpcRows, error: rpcError } = await (supabase as any)
        .rpc('oculto_set_kyc_verification_status', {
          p_profile_id: profileId,
          p_user_id: userId ?? null,
          p_verified: verified,
          p_rejection_reason: verified ? null : 'Documento rejeitado na revisão administrativa.',
        });

      if (!rpcError) {
        const confirmed = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
        if (confirmed?.is_verified === verified) {
          return { profileId: confirmed.profile_id || profileId, verified };
        }
      } else {
        const rpcMessage = String(rpcError.message || '');
        const canFallbackToDirectUpdate =
          rpcError.code === '42883' ||
          rpcError.code === '23502' ||
          rpcMessage.includes('oculto_set_kyc_verification_status') ||
          rpcMessage.includes('null value in column "action"') ||
          rpcMessage.includes('relation "audit_logs"');

        if (!canFallbackToDirectUpdate) {
          throw new Error(rpcMessage || 'Falha ao gravar a verificação no banco de dados.');
        }
      }

      const targetProfile = await resolveIdentityProfileRow(profileId, userId);

      if (!targetProfile?.id) {
        throw new Error('Perfil não encontrado para atualizar a verificação.');
      }

      const profileUpdatePayload: Record<string, unknown> = verified
        ? {
            is_verified: true,
            document_verified: true,
            kyc_status: 'approved',
            kyc_rejection_reason: null,
            kyc_reviewed_by: user?.id ?? null,
            kyc_reviewed_at: new Date().toISOString(),
          }
        : {
            is_verified: false,
            document_verified: false,
            kyc_status: 'rejected',
            kyc_rejection_reason: 'Documento rejeitado na revisão administrativa.',
            kyc_reviewed_by: user?.id ?? null,
            kyc_reviewed_at: new Date().toISOString(),
          };

      let { error } = await supabase
        .from('profiles')
        .update(profileUpdatePayload as any)
        .eq('id', targetProfile.id);

      if (error && /column .* does not exist/i.test(String(error.message || ''))) {
        const fallbackResult = await supabase
          .from('profiles')
          .update({ is_verified: verified } as any)
          .eq('id', targetProfile.id);

        error = fallbackResult.error;
      }

      if (error) throw error;

      const confirmed = await resolveIdentityProfileRow(targetProfile.id, targetProfile.user_id ?? userId);
      if (!confirmed || confirmed.is_verified !== verified) {
        throw new Error('A verificação não foi gravada corretamente no banco de dados.');
      }
      return { profileId: confirmed.id || targetProfile.id, verified };
    },
    onMutate: async ({ profileId, verified }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['admin-identity-users'] });
      await queryClient.cancelQueries({ queryKey: ['admin-identity-stats'] });

      // Snapshot previous values
      const previousUsers = queryClient.getQueriesData({ queryKey: ['admin-identity-users'] });
      const previousStats = queryClient.getQueryData(['admin-identity-stats']);

      // Optimistically update identity users lists
      queryClient.setQueriesData<IdentityVerificationUser[]>({ queryKey: ['admin-identity-users'] }, (old) => {
        if (!old) return old;
        return old.map(u => u.id === profileId ? { ...u, is_verified: verified, pendencies: verified ? [] : u.pendencies } : u);
      });

      // Optimistically update stats
      queryClient.setQueryData<IdentityStats>(['admin-identity-stats'], (old) => {
        if (!old) return old;
        const delta = verified ? 1 : -1;
        return { ...old, verified: old.verified + delta, unverified: old.unverified - delta };
      });

      return { previousUsers, previousStats };
    },
    onError: (error, _vars, context) => {
      // Rollback on error
      if (context?.previousUsers) {
        context.previousUsers.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      if (context?.previousStats) {
        queryClient.setQueryData(['admin-identity-stats'], context.previousStats);
      }
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
    onSuccess: async (data) => {
      if (user?.id) await logAuditAction(user.id, data.verified ? 'identity_verified' : 'identity_unverified', 'profiles', data.profileId, {});
      toast({ title: data.verified ? "✅ Identidade Verificada" : "🚫 Verificação Removida" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-identity-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-identity-stats'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
// FOUNDER APPLICATION HOOKS
// ═══════════════════════════════════════════════════════════════════════

export function useFounderStats() {
  return useQuery({
    queryKey: ['admin-founder-stats'],
    queryFn: async (): Promise<FounderStats> => {
      const { data, error } = await (supabase as any)
        .from('creator_founder_applications')
        .select('status');
      if (error) throw error;

      const stats: FounderStats = { pending: 0, approved: 0, rejected: 0, total: data?.length || 0 };
      data?.forEach((a: any) => {
        if (a.status === 'pending') stats.pending++;
        else if (a.status === 'approved') stats.approved++;
        else if (a.status === 'rejected') stats.rejected++;
      });
      return stats;
    }
  });
}

export function useFounderApplicationsList(filter: string = 'all') {
  return useQuery({
    queryKey: ['admin-founder-apps-list', filter],
    queryFn: async (): Promise<FounderApplication[]> => {
      let query = (supabase as any)
        .from('creator_founder_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter !== 'all') query = query.eq('status', filter);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });
}

// ── Delete a single KYC document ──────────────────────────────────────
export type KycDocField = 'kyc_document_url' | 'kyc_document_back_url' | 'kyc_selfie_url';

export function useDeleteKycDocument() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      profileId,
      field,
      storagePath,
    }: {
      profileId: string;
      field: KycDocField;
      storagePath: string;
    }) => {
      // Tenta remover o arquivo de todos os buckets candidatos
      const buckets = ['kyc-documents', 'post-media', 'profile-media', 'avatars'];
      for (const bucket of buckets) {
        try {
          await supabase.storage.from(bucket).remove([storagePath]);
        } catch {
          /* ignora — arquivo pode não existir nesse bucket */
        }
      }
      // Limpa a referência no perfil
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ [field]: null })
        .eq('id', profileId);
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      toast({ title: 'Documento removido', description: 'O arquivo foi excluído do servidor.' });
      queryClient.invalidateQueries({ queryKey: ['admin-identity-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-identity-stats'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Falha ao remover',
        description: err?.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });
}
