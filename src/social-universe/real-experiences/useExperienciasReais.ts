/**
 * useExperienciasReais — Onda C
 * Eventos locais aprovados pela moderação. Inclui RSVP com consentimento.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

export interface RealExperience {
  id: string;
  kind: 'lounge' | 'encontro' | 'evento_local' | 'experiencia';
  title: string;
  description: string | null;
  city: string | null;
  state: string | null;
  approximate_region: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number;
  vip_only: boolean;
  requires_kyc: boolean;
  host_user: string;
  going_count: number;
}

export function useExperienciasReais(limit = 20) {
  return useQuery({
    queryKey: ['real-experiences-upcoming', limit],
    queryFn: async (): Promise<RealExperience[]> => {
      const { data } = await (supabase as any).rpc('real_experiences_upcoming', { p_limit: limit });
      return (data ?? []) as RealExperience[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * useRsvpExperiencia — solicita participação em uma experiência real.
 * Usa RPC `real_experience_request_join` que valida consentimento, score, trust,
 * aura, KYC, bloqueios e capacidade. Retorna 'pending' ou 'approved'.
 */
export function useRsvpExperiencia() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useCallback(async (experienceId: string, consent: boolean): Promise<'pending' | 'approved'> => {
    if (!user?.id) throw new Error('auth required');
    if (!consent) throw new Error('consent required');
    const { data, error } = await (supabase as any).rpc('real_experience_request_join', {
      p_experience: experienceId, p_consent: true,
    });
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['real-experiences-upcoming'] });
    return (data as 'pending' | 'approved') ?? 'pending';
  }, [user?.id, qc]);
}
