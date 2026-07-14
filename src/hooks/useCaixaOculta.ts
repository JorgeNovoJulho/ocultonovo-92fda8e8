/**
 * useCaixaOculta — hooks de Caixa Oculta (campanhas em XP).
 * Usa exclusivamente o Supabase externo (@/lib/supabaseExternal).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

export type CoxApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type CoxStatus = 'draft' | 'active' | 'closed' | 'drawn' | 'cancelled';
export type CoxPrizeKind = 'digital' | 'symbolic' | 'highlight' | 'mention' | 'custom_digital';

export interface CoxCampaign {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  xp_cost: number;
  draw_at: string;
  status: CoxStatus;
  approval_status: CoxApprovalStatus;
  rejection_reason: string | null;
  participants_count: number;
  winners_drawn: boolean;
  drawn_at: string | null;
  created_at: string;
}

export interface CoxPrize {
  id: string;
  campaign_id: string;
  prize_position: number;
  title: string;
  description: string | null;
  prize_kind: CoxPrizeKind;
}

export interface CoxSettings {
  enabled: boolean;
  require_admin_approval: boolean;
  creator_vip_only: boolean;
  allow_physical_prizes: boolean;
  max_entries_per_user: number;
  min_xp_cost: number;
  max_xp_cost: number;
  allow_second_prize: boolean;
  allow_third_prize: boolean;
  show_participants_publicly: boolean;
  show_in_feed: boolean;
  custom_feature_name: string;
  refund_xp_on_cancel: boolean;
}

export interface CoxAuditLog {
  id: string;
  campaign_id: string | null;
  actor_id: string | null;
  action: string;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

// ---------- Settings ----------
export function useCaixaOcultaSettings() {
  return useQuery({
    queryKey: ['cox-settings'],
    queryFn: async (): Promise<CoxSettings | null> => {
      const { data } = await (supabase as any)
        .from('oculto_caixa_oculta_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      return data as CoxSettings | null;
    },
    staleTime: 5 * 60_000,
  });
}

// ---------- Public feed of approved active campaigns ----------
export function useFeedCaixaOculta(limit = 20) {
  return useQuery({
    queryKey: ['cox-feed', limit],
    queryFn: async (): Promise<CoxCampaign[]> => {
      const { data, error } = await (supabase as any)
        .from('oculto_caixa_oculta_campaigns')
        .select('*')
        .eq('approval_status', 'approved')
        .in('status', ['active', 'drawn', 'closed'])
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return [];
      return (data ?? []) as CoxCampaign[];
    },
    staleTime: 60_000,
  });
}

// ---------- Creator: my campaigns ----------
export function useMyCaixaOculta() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cox-mine', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CoxCampaign[]> => {
      const { data } = await (supabase as any)
        .from('oculto_caixa_oculta_campaigns')
        .select('*')
        .eq('creator_id', user!.id)
        .order('created_at', { ascending: false });
      return (data ?? []) as CoxCampaign[];
    },
    staleTime: 30_000,
  });
}

// ---------- Campaign details + winners + my entry ----------
export function useCaixaOcultaCampaign(id: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cox-campaign', id, user?.id],
    enabled: !!id,
    queryFn: async () => {
      const [c, p, w, e] = await Promise.all([
        (supabase as any).from('oculto_caixa_oculta_campaigns').select('*').eq('id', id).maybeSingle(),
        (supabase as any).from('oculto_caixa_oculta_prizes').select('*').eq('campaign_id', id).order('prize_position'),
        (supabase as any).from('oculto_caixa_oculta_winners').select('*').eq('campaign_id', id).order('prize_position'),
        user
          ? (supabase as any).from('oculto_caixa_oculta_entries').select('*').eq('campaign_id', id).eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        campaign: (c.data ?? null) as CoxCampaign | null,
        prizes: (p.data ?? []) as CoxPrize[],
        winners: (w.data ?? []) as Array<{ user_id: string; prize_position: number; prize_id: string | null }>,
        myEntry: (e?.data ?? null) as { entry_number: number; xp_spent: number } | null,
      };
    },
    staleTime: 15_000,
  });
}

// ---------- Mutations ----------
export function useCreateCaixaOculta() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<CoxCampaign> & { prizes: Array<Partial<CoxPrize>> }) => {
      if (!user) throw new Error('not_authenticated');
      const { prizes, ...campaignPayload } = payload;
      const { data: camp, error } = await (supabase as any)
        .from('oculto_caixa_oculta_campaigns')
        .insert({ ...campaignPayload, creator_id: user.id })
        .select()
        .single();
      if (error) throw error;
      if (prizes?.length) {
        const rows = prizes.map((p, i) => ({ ...p, campaign_id: camp.id, prize_position: p.prize_position ?? i + 1 }));
        const { error: e2 } = await (supabase as any).from('oculto_caixa_oculta_prizes').insert(rows);
        if (e2) throw e2;
      }
      return camp as CoxCampaign;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cox-mine'] }),
  });
}

export function useSubmitCaixaOculta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc('cox_submit_for_approval', { p_campaign_id: id });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cox-mine'] }); toast.success('Enviada para aprovação.'); },
    onError: (e: any) => toast.error(`Falha ao enviar: ${e?.message ?? e}`),
  });
}

export function useParticipateCaixaOculta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc('cox_participate', { p_campaign_id: id });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
      return data as { entry_number: number; xp_spent: number; balance_after: number };
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['cox-campaign', id] });
      qc.invalidateQueries({ queryKey: ['cox-feed'] });
    },
  });
}

export function useDrawCaixaOculta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc('cox_draw', { p_campaign_id: id });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cox-mine'] });
      qc.invalidateQueries({ queryKey: ['cox-feed'] });
    },
  });
}

export function useApproveCaixaOculta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await (supabase as any).rpc('cox_approve_campaign', { p_campaign_id: campaignId });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cox-admin'] }); qc.invalidateQueries({ queryKey: ['cox-feed'] }); toast.success('Aprovada.'); },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
}

export function useRejectCaixaOculta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await (supabase as any).rpc('cox_reject_campaign', { p_campaign_id: id, p_reason: reason });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cox-admin'] }); toast.success('Reprovada.'); },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
}

export function useCancelCaixaOculta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, refund }: { id: string; refund?: boolean }) => {
      const { data, error } = await (supabase as any).rpc('cox_cancel_campaign', {
        p_campaign_id: id,
        p_refund: refund ?? true,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason ?? 'unknown_error');
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cox-admin'] }); qc.invalidateQueries({ queryKey: ['cox-feed'] }); toast.success('Cancelada.'); },
    onError: (e: any) => toast.error(`Falha: ${e?.message ?? e}`),
  });
}

// Admin lists — filtra por approval_status OU status (drawn/cancelled)
export type CoxAdminFilter =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'drawn'
  | 'cancelled'
  | 'all';

export function useAdminCoxCampaigns(filter: CoxAdminFilter = 'pending_approval') {
  return useQuery({
    queryKey: ['cox-admin', filter],
    queryFn: async (): Promise<CoxCampaign[]> => {
      let q = (supabase as any)
        .from('oculto_caixa_oculta_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'pending_approval' || filter === 'approved' || filter === 'rejected') {
        q = q.eq('approval_status', filter);
        if (filter === 'approved') q = q.eq('status', 'active');
      } else if (filter === 'drawn') {
        q = q.eq('status', 'drawn');
      } else if (filter === 'cancelled') {
        q = q.eq('status', 'cancelled');
      }
      const { data } = await q;
      return (data ?? []) as CoxCampaign[];
    },
    staleTime: 30_000,
  });
}

export function useAdminCoxAuditLogs(limit = 200) {
  return useQuery({
    queryKey: ['cox-admin-logs', limit],
    queryFn: async (): Promise<CoxAuditLog[]> => {
      const { data, error } = await (supabase as any).rpc('cox_admin_audit_logs', { p_limit: limit });
      if (error) return [];
      return (data ?? []) as CoxAuditLog[];
    },
    staleTime: 30_000,
  });
}

// Alias para compatibilidade com chamadas existentes
export const useSubmitCaixaOcultaForApproval = useSubmitCaixaOculta;

// Participantes paginados de uma campanha (retorna array para uso direto)
export function useCoxParticipants(campaignId: string | null, page = 0, pageSize = 30) {
  return useQuery({
    queryKey: ['cox-participants', campaignId, page, pageSize],
    enabled: !!campaignId,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data } = await (supabase as any)
        .from('oculto_caixa_oculta_entries')
        .select('id, user_id, entry_number, xp_spent, created_at')
        .eq('campaign_id', campaignId)
        .order('entry_number', { ascending: true })
        .range(from, to);
      return (data ?? []) as Array<{
        id: string;
        user_id: string;
        entry_number: number;
        xp_spent: number;
        created_at: string;
      }>;
    },
    staleTime: 20_000,
  });
}

// ---------- Prêmios de uma campanha (admin/criador) ----------
export function useCoxPrizes(campaignId: string | null) {
  return useQuery({
    queryKey: ['cox-prizes', campaignId],
    enabled: !!campaignId,
    queryFn: async (): Promise<CoxPrize[]> => {
      const { data } = await (supabase as any)
        .from('oculto_caixa_oculta_prizes')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('prize_position');
      return (data ?? []) as CoxPrize[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertCoxPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<CoxPrize> & { campaign_id: string; prize_position: number; title: string; prize_kind: CoxPrizeKind }) => {
      const { error } = await (supabase as any)
        .from('oculto_caixa_oculta_prizes')
        .upsert(p, { onConflict: 'campaign_id,prize_position' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['cox-prizes', v.campaign_id] }),
    onError: (e: any) => toast.error(`Falha ao salvar prêmio: ${e?.message ?? e}`),
  });
}

export function useDeleteCoxPrize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, campaign_id }: { id: string; campaign_id: string }) => {
      const { error } = await (supabase as any)
        .from('oculto_caixa_oculta_prizes')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { campaign_id };
    },
    onSuccess: (r) => qc.invalidateQueries({ queryKey: ['cox-prizes', r.campaign_id] }),
    onError: (e: any) => toast.error(`Falha ao remover prêmio: ${e?.message ?? e}`),
  });
}

// ---------- Histórico de sorteios (todas as campanhas apuradas/canceladas) ----------
export function useCoxHistory(limit = 100) {
  return useQuery({
    queryKey: ['cox-history', limit],
    queryFn: async () => {
      const { data: campaigns } = await (supabase as any)
        .from('oculto_caixa_oculta_campaigns')
        .select('*')
        .in('status', ['drawn', 'cancelled'])
        .order('drawn_at', { ascending: false, nullsFirst: false })
        .limit(limit);
      const ids = (campaigns ?? []).map((c: any) => c.id);
      if (!ids.length) return [] as Array<CoxCampaign & { prizes: CoxPrize[] }>;
      const { data: prizes } = await (supabase as any)
        .from('oculto_caixa_oculta_prizes')
        .select('*')
        .in('campaign_id', ids);
      const byCamp: Record<string, CoxPrize[]> = {};
      (prizes ?? []).forEach((p: CoxPrize) => {
        (byCamp[p.campaign_id] ||= []).push(p);
      });
      return (campaigns ?? []).map((c: CoxCampaign) => ({
        ...c,
        prizes: (byCamp[c.id] ?? []).sort((a, b) => a.prize_position - b.prize_position),
      }));
    },
    staleTime: 30_000,
  });
}

