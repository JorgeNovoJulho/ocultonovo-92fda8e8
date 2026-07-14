/**
 * useBetaGrants — Acesso BETA simulado (sem cobrança real) para conteúdo pago
 * e assinaturas de Canais VIP. Backend (beta_access_grants) é fonte da verdade.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export type BetaGrantType = 'paid_content' | 'creator_subscription';

interface GrantInput {
  grantType: BetaGrantType;
  postId?: string | null;
  creatorId?: string | null;
  planId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Cria um acesso beta (sem cobrança). Chamar apenas quando a feature paga estiver OFF. */
export function useCreateBetaGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: GrantInput) => {
      const { data, error } = await (supabase as any).rpc('grant_beta_access', {
        p_grant_type: input.grantType,
        p_post_id: input.postId ?? null,
        p_creator_id: input.creatorId ?? null,
        p_plan_id: input.planId ?? null,
        p_metadata: input.metadata ?? {},
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['media-access'] });
      qc.invalidateQueries({ queryKey: ['media-access-batch'] });
      qc.invalidateQueries({ queryKey: ['is-subscribed'] });
      qc.invalidateQueries({ queryKey: ['beta-grant'] });
      qc.invalidateQueries({ queryKey: ['my-subscriptions'] });
      if (input.grantType === 'paid_content') {
        toast({
          title: '✨ Acesso beta liberado',
          description: 'Nenhuma cobrança foi feita. No lançamento oficial, será necessário comprar de verdade.',
        });
      } else {
        toast({
          title: '✨ Assinatura beta liberada',
          description: 'Nenhuma cobrança foi feita. No lançamento oficial, será necessário assinar de verdade.',
        });
      }
    },
    onError: (e: any) => {
      const msg = String(e?.message || '');
      if (msg.includes('FEATURE_ALREADY_LIVE')) {
        toast({ title: 'Monetização ativa', description: 'Use o checkout real.', variant: 'destructive' });
      } else if (msg.includes('BETA_GRANT_ONLY_IN_BETA_MODE')) {
        toast({ title: 'Fora do Beta', description: 'Esta opção só funciona durante o Beta.', variant: 'destructive' });
      } else {
        toast({ title: 'Erro ao liberar acesso beta', description: msg, variant: 'destructive' });
      }
    },
  });
}

/** Verifica acesso beta a um post específico. */
export function useHasBetaPostAccess(postId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['beta-grant', 'post', postId, user?.id],
    enabled: !!user?.id && !!postId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('has_beta_post_access', {
        p_user: user!.id, p_post: postId,
      });
      if (error) return false;
      return !!data;
    },
  });
}

/** Verifica acesso beta a um criador (assinatura). */
export function useHasBetaCreatorAccess(creatorId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['beta-grant', 'creator', creatorId, user?.id],
    enabled: !!user?.id && !!creatorId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('has_beta_creator_access', {
        p_user: user!.id, p_creator: creatorId,
      });
      if (error) return false;
      return !!data;
    },
  });
}

/** Batch — lê grants ativos do usuário e retorna mapa post_id => true. */
export function useBatchBetaPostAccess(postIds: string[]) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['beta-grant', 'post-batch', postIds.join(','), user?.id],
    enabled: !!user?.id && postIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await (supabase as any)
        .from('beta_access_grants')
        .select('post_id')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .in('post_id', postIds);
      const map: Record<string, boolean> = {};
      postIds.forEach((id) => (map[id] = false));
      if (!error && data) {
        (data as Array<{ post_id: string }>).forEach((r) => {
          if (r.post_id) map[r.post_id] = true;
        });
      }
      return map;
    },
  });
}

/** Admin master: resumo de grants. */
export function useBetaGrantsSummary(enabled = true) {
  return useQuery({
    queryKey: ['beta-grants-summary'],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('beta_grants_summary');
      if (error) throw error;
      return data as {
        total_active: number;
        active_paid_content: number;
        active_subscriptions: number;
        total_revoked: number;
        unique_users_active: number;
      };
    },
  });
}

/** Admin master: revoga TODOS os grants beta de monetização. */
export function useRevokeBetaGrants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('revoke_beta_monetization_grants');
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: ['beta-grants-summary'] });
      qc.invalidateQueries({ queryKey: ['beta-grant'] });
      qc.invalidateQueries({ queryKey: ['media-access'] });
      qc.invalidateQueries({ queryKey: ['is-subscribed'] });
      toast({ title: `${count} acesso(s) beta encerrado(s)`, description: 'Usuários precisarão comprar/assinar de verdade.' });
    },
    onError: (e: any) => {
      toast({ title: 'Falha ao revogar grants', description: e?.message, variant: 'destructive' });
    },
  });
}
