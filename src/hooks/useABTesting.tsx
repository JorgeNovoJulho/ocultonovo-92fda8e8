import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { useEffect, useState } from 'react';

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export interface ABExperiment {
  id: string;
  name: string;
  description: string | null;
  hypothesis: string | null;
  metric_key: string;
  status: ExperimentStatus;
  traffic_percentage: number;
  target_sample_size: number | null;
  start_date: string | null;
  end_date: string | null;
  winner_variant_id: string | null;
  statistical_significance: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ABVariant {
  id: string;
  experiment_id: string;
  name: string;
  description: string | null;
  is_control: boolean;
  config: Record<string, any>;
  weight: number;
  impressions: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
  created_at: string;
}

export interface ABExperimentResult {
  experiment_id: string;
  experiment_name: string;
  status: string;
  metric_key: string;
  variant_id: string;
  variant_name: string;
  is_control: boolean;
  impressions: number;
  conversions: number;
  conversion_rate: number;
  revenue: number;
  lift: number;
}

// Fetch all experiments
export function useABExperiments() {
  return useQuery({
    queryKey: ['ab-experiments'],
    queryFn: async (): Promise<ABExperiment[]> => {
      const { data, error } = await supabase
        .from('ab_experiments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as ABExperiment[];
    },
  });
}

// Fetch single experiment with variants
export function useABExperiment(experimentId: string | null) {
  return useQuery({
    queryKey: ['ab-experiment', experimentId],
    queryFn: async () => {
      if (!experimentId) return null;

      const [expResult, variantsResult] = await Promise.all([
        supabase.from('ab_experiments').select('*').eq('id', experimentId).single(),
        supabase.from('ab_variants').select('*').eq('experiment_id', experimentId).order('is_control', { ascending: false }),
      ]);

      if (expResult.error) throw expResult.error;

      return {
        experiment: expResult.data as unknown as ABExperiment,
        variants: (variantsResult.data || []) as unknown as ABVariant[],
      };
    },
    enabled: !!experimentId,
  });
}

// Fetch experiment results
export function useABExperimentResults(experimentId: string | null) {
  return useQuery({
    queryKey: ['ab-experiment-results', experimentId],
    queryFn: async (): Promise<ABExperimentResult[]> => {
      if (!experimentId) return [];

      const { data, error } = await supabase
        .from('ab_experiment_results')
        .select('*')
        .eq('experiment_id', experimentId);

      if (error) throw error;
      return (data || []) as unknown as ABExperimentResult[];
    },
    enabled: !!experimentId,
  });
}

// Create experiment
export function useCreateABExperiment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (experiment: Record<string, any>) => {
      const { data, error } = await supabase
        .from('ab_experiments')
        .insert({
          name: experiment.name,
          description: experiment.description || null,
          hypothesis: experiment.hypothesis || null,
          metric_key: experiment.metric_key,
          traffic_percentage: experiment.traffic_percentage || 100,
          target_sample_size: experiment.target_sample_size || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiments'] });
      toast({ title: 'Experimento criado', description: 'Agora adicione as variantes.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar experimento', description: error.message, variant: 'destructive' });
    },
  });
}

// Update experiment
export function useUpdateABExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any> & { id: string }) => {
      const { data, error } = await supabase
        .from('ab_experiments')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['ab-experiment'] });
      toast({ title: 'Experimento atualizado' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete experiment
export function useDeleteABExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (experimentId: string) => {
      const { error } = await supabase.from('ab_experiments').delete().eq('id', experimentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiments'] });
      toast({ title: 'Experimento excluído' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    },
  });
}

// Start/Stop experiment
export function useToggleABExperiment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'pause' | 'complete' }) => {
      const statusMap = {
        start: 'running',
        pause: 'paused',
        complete: 'completed',
      };

      const updates: Record<string, any> = {
        status: statusMap[action],
        updated_at: new Date().toISOString(),
      };

      if (action === 'start') {
        updates.start_date = new Date().toISOString();
      } else if (action === 'complete') {
        updates.end_date = new Date().toISOString();
      }

      const { error } = await supabase.from('ab_experiments').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['ab-experiment'] });
      const messages = {
        start: 'Experimento iniciado! Os usuários estão sendo distribuídos.',
        pause: 'Experimento pausado.',
        complete: 'Experimento finalizado.',
      };
      toast({ title: messages[variables.action] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    },
  });
}

// Create variant
export function useCreateABVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variant: Record<string, any>) => {
      const { data, error } = await supabase
        .from('ab_variants')
        .insert({
          experiment_id: variant.experiment_id,
          name: variant.name,
          description: variant.description || null,
          is_control: variant.is_control || false,
          config: variant.config || {},
          weight: variant.weight || 50,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiment'] });
      toast({ title: 'Variante criada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar variante', description: error.message, variant: 'destructive' });
    },
  });
}

// Update variant
export function useUpdateABVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any> & { id: string }) => {
      const { error } = await supabase.from('ab_variants').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiment'] });
    },
  });
}

// Delete variant
export function useDeleteABVariant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variantId: string) => {
      const { error } = await supabase.from('ab_variants').delete().eq('id', variantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiment'] });
      toast({ title: 'Variante excluída' });
    },
  });
}

// Declare winner
export function useDeclareWinner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ experimentId, variantId }: { experimentId: string; variantId: string }) => {
      const { error } = await supabase
        .from('ab_experiments')
        .update({
          winner_variant_id: variantId,
          status: 'completed',
          end_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', experimentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-experiments'] });
      queryClient.invalidateQueries({ queryKey: ['ab-experiment'] });
      toast({ title: '🏆 Vencedor declarado!', description: 'O experimento foi finalizado.' });
    },
  });
}

// Hook for getting user's assigned variant (client-side)
export function useABVariant(experimentId: string | null) {
  const { user } = useAuth();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [variantConfig, setVariantConfig] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!experimentId) {
      setLoading(false);
      return;
    }

    const getVariant = async () => {
      try {
        // Get or generate session ID for anonymous users
        let sessionId = localStorage.getItem('ab_session_id');
        if (!sessionId) {
          sessionId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          localStorage.setItem('ab_session_id', sessionId);
        }

        // Call the database function to get/assign variant
        const { data: assignedVariantId, error } = await supabase.rpc('assign_ab_variant', {
          p_experiment_id: experimentId,
          p_user_id: user?.id || null,
          p_session_id: user?.id ? null : sessionId,
        });

        if (error) throw error;

        if (assignedVariantId) {
          setVariantId(assignedVariantId);

          // Fetch variant config
          const { data: variant } = await supabase
            .from('ab_variants')
            .select('config')
            .eq('id', assignedVariantId)
            .single();

          if (variant) {
            setVariantConfig(variant.config as Record<string, any>);
          }
        }
      } catch (error) {
        console.error('[A/B Testing] Error getting variant:', error);
      } finally {
        setLoading(false);
      }
    };

    getVariant();
  }, [experimentId, user?.id]);

  // Function to track conversion
  const trackConversion = async (conversionType = 'default', value?: number) => {
    if (!experimentId || !variantId) return false;

    try {
      let sessionId = localStorage.getItem('ab_session_id');

      const { data, error } = await supabase.rpc('record_ab_conversion', {
        p_experiment_id: experimentId,
        p_user_id: user?.id || null,
        p_session_id: user?.id ? null : sessionId,
        p_conversion_type: conversionType,
        p_value: value || null,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('[A/B Testing] Error tracking conversion:', error);
      return false;
    }
  };

  return {
    variantId,
    variantConfig,
    loading,
    trackConversion,
  };
}

// Stats summary for dashboard
export function useABStats() {
  return useQuery({
    queryKey: ['ab-stats'],
    queryFn: async () => {
      const { data: experiments, error } = await supabase
        .from('ab_experiments')
        .select('status');

      if (error) throw error;

      return {
        total: experiments?.length || 0,
        running: experiments?.filter(e => e.status === 'running').length || 0,
        completed: experiments?.filter(e => e.status === 'completed').length || 0,
        draft: experiments?.filter(e => e.status === 'draft').length || 0,
      };
    },
  });
}
