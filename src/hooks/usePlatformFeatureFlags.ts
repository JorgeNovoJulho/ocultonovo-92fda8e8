/**
 * usePlatformFeatureFlags — Laboratório Oculto (Recursos Experimentais).
 *
 * Lê/edita `platform_feature_flags` no Supabase Externo. Decisão de exibição
 * por usuário usa a RPC `feature_flag_is_enabled` (hash determinístico).
 *
 * Esta camada é INERTE: não consome nenhuma flag em produção até que outra
 * superfície decida usar `useFeatureFlag('chave')`.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export type FeatureRolloutMode =
  | 'disabled'
  | 'admin_only'
  | 'beta_users'
  | 'percentage'
  | 'global';

export interface PlatformFeatureFlag {
  id: string;
  feature_key: string;
  enabled: boolean;
  rollout_mode: FeatureRolloutMode;
  rollout_percentage: number;
  admin_only: boolean;
  beta_users: string[];
  description: string | null;
  created_at: string;
  updated_at: string;
}

const QK = ['platform-feature-flags'] as const;

export function usePlatformFeatureFlags() {
  return useQuery<PlatformFeatureFlag[]>({
    queryKey: QK,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_feature_flags')
        .select('*')
        .order('feature_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlatformFeatureFlag[];
    },
  });
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PlatformFeatureFlag> & { id: string }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from('platform_feature_flags')
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return data as PlatformFeatureFlag;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

/** Verifica se uma flag está ativa para o usuário corrente. */
export function useFeatureFlag(key: string) {
  const { user } = useAuth();
  return useQuery<boolean>({
    queryKey: ['feature-flag', key, user?.id ?? 'anon'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('feature_flag_is_enabled', {
        p_key: key,
        p_user_id: user?.id ?? null,
      });
      if (error) return false;
      return !!data;
    },
  });
}

/** Helper imperativo (fora de componentes). */
export async function checkFeatureFlag(key: string, userId?: string | null) {
  const { data, error } = await supabase.rpc('feature_flag_is_enabled', {
    p_key: key,
    p_user_id: userId ?? null,
  });
  if (error) return false;
  return !!data;
}

/** Util para administrar beta_users (add/remove) sem reescrever o array todo. */
export function useToggleBetaUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { flag: PlatformFeatureFlag; userId: string; add: boolean }) => {
      const set = new Set(input.flag.beta_users);
      if (input.add) set.add(input.userId); else set.delete(input.userId);
      const { error } = await supabase
        .from('platform_feature_flags')
        .update({ beta_users: Array.from(set) })
        .eq('id', input.flag.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export const KNOWN_EXPERIMENTAL_FEATURES: Array<{ key: string; label: string; description: string }> = [
  { key: 'today_in_oculto',     label: 'Hoje no Oculto',           description: 'Curadoria diária na home.' },
  { key: 'journey_system',      label: 'Sistema de Jornadas',      description: 'Onboarding gamificado em etapas.' },
  { key: 'ai_concierge',        label: 'Concierge IA',             description: 'Sugestões e atalhos contextuais.' },
  { key: 'historical_timeline', label: 'Linha do Tempo Histórica', description: 'Histórico rico do usuário no Oculto.' },
  { key: 'profile_visitors',    label: 'Visitantes do Perfil',     description: 'Painel rico de quem visitou.' },
  { key: 'retention_dashboard', label: 'Hub de Retenção',          description: 'XP/níveis/missões/ranking unificados.' },
  // Experiência do Usuário (Master)
  { key: 'nova_aura_ai',              label: 'Nova Aura IA',              description: 'Painel premium da nova Aura IA na Home.' },
  { key: 'central_aura_ia',           label: 'Central Aura IA',           description: 'Modal Central Aura IA (Jornada/História/Oportunidades/Missões/Explorar).' },
  { key: 'oportunidades_inteligentes',label: 'Oportunidades Inteligentes',description: 'Aba Oportunidades com sinais reais (mensagens, likes, alcance).' },
  { key: 'mapa_do_oculto',            label: 'Mapa do Oculto',            description: 'Aba Explorar inteligente — usado vs. não explorado.' },
  { key: 'onboarding_inteligente',    label: 'Onboarding Inteligente',    description: 'Onboarding adaptativo guiado pela Aura IA.' },
];

/** Chaves controladas pela página "Experiência do Usuário". */
export const MASTER_UX_FLAG_KEYS = [
  'nova_aura_ai',
  'central_aura_ia',
  'oportunidades_inteligentes',
  'mapa_do_oculto',
  'onboarding_inteligente',
] as const;
export type MasterUxFlagKey = typeof MASTER_UX_FLAG_KEYS[number];

export function useEnsureKnownFlags() {
  const qc = useQueryClient();
  return useCallback(async () => {
    // Cria via INSERT ... ON CONFLICT no banco já está coberto pelo seed SQL.
    // Esta função existe para revalidar a lista após o seed.
    await qc.invalidateQueries({ queryKey: QK });
  }, [qc]);
}
