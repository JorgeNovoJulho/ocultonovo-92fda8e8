/**
 * Hook para Testes A/B de Preços
 * Gerencia variantes de preço e rastreia conversões
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface ABTestConfig {
  id: string;
  test_name: string;
  is_active: boolean;
  variant_a: Record<string, unknown>;
  variant_b: Record<string, unknown>;
  split_percentage: number; // % que vai para variante B
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ABTestAssignment {
  id: string;
  test_name: string;
  session_id: string;
  user_id: string | null;
  variant: 'A' | 'B';
  converted: boolean;
  created_at: string;
}

// Gerar ou recuperar session ID
function getSessionId(): string {
  let sessionId = sessionStorage.getItem('ab_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('ab_session_id', sessionId);
  }
  return sessionId;
}

// Hook para buscar todos os testes A/B (admin) - alias para compatibilidade
export function useABTestConfigs() {
  return useQuery({
    queryKey: ['ab-test-configs'],
    queryFn: async (): Promise<ABTestConfig[]> => {
      const { data, error } = await (supabase as any)
        .from('ab_test_configs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });
}

// Alias para compatibilidade com ABTestManagerCard
export const useABTests = useABTestConfigs;

// Hook para criar/atualizar teste A/B (admin)
export function useManageABTest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const createTest = useMutation({
    mutationFn: async (config: Omit<ABTestConfig, 'id' | 'created_by' | 'created_at' | 'updated_at'>) => {
      const { error } = await (supabase as any)
        .from('ab_test_configs')
        .insert({
          ...config,
          created_by: user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test-configs'] });
      toast({
        title: 'Teste A/B criado',
        description: 'O teste foi configurado com sucesso.',
      });
    },
  });

  const updateTest = useMutation({
    mutationFn: async ({ id, ...config }: Partial<ABTestConfig> & { id: string }) => {
      const { error } = await (supabase as any)
        .from('ab_test_configs')
        .update({
          ...config,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test-configs'] });
      toast({
        title: 'Teste atualizado',
        description: 'As alterações foram salvas.',
      });
    },
  });

  const toggleTest = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from('ab_test_configs')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test-configs'] });
    },
  });

  const deleteTest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('ab_test_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test-configs'] });
      toast({
        title: 'Teste removido',
        description: 'O teste A/B foi excluído.',
      });
    },
  });

  return {
    createTest: createTest.mutate,
    updateTest: updateTest.mutate,
    toggleTest: toggleTest.mutate,
    deleteTest: deleteTest.mutate,
    isLoading: createTest.isPending || updateTest.isPending,
  };
}

// Hook para criar teste A/B (compatibilidade)
export function useCreateABTest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: {
      name: string;
      description?: string;
      test_type: string;
      variant_a_value: string;
      variant_b_value: string;
      traffic_split: number;
    }) => {
      const { error } = await (supabase as any)
        .from('ab_test_configs')
        .insert({
          test_name: config.name,
          is_active: true,
          variant_a: { value: config.variant_a_value, type: config.test_type },
          variant_b: { value: config.variant_b_value, type: config.test_type },
          split_percentage: 100 - config.traffic_split,
          created_by: user?.id,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test-configs'] });
    },
  });
}

// Hook para atualizar teste A/B (compatibilidade)
export function useUpdateABTest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; is_active?: boolean }) => {
      const { error } = await (supabase as any)
        .from('ab_test_configs')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-test-configs'] });
    },
  });
}

// Hook para estatísticas agregadas de testes A/B
export function useABTestStats() {
  return useQuery({
    queryKey: ['ab-test-stats'],
    queryFn: async () => {
      // Buscar testes ativos
      const { data: configs, error: configError } = await (supabase as any)
        .from('ab_test_configs')
        .select('id, is_active');

      if (configError) throw configError;

      // Buscar total de assignments
      const { count, error: countError } = await (supabase as any)
        .from('ab_test_assignments')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;

      return {
        activeTests: (configs || []).filter((c: any) => c.is_active).length,
        totalTests: (configs || []).length,
        totalAssignments: count || 0,
      };
    },
  });
}

// Hook para determinar variante do usuário
export function useABTestVariant(testName: string) {
  const { user } = useAuth();
  const sessionId = useMemo(() => getSessionId(), []);

  // Buscar configuração do teste
  const { data: config } = useQuery({
    queryKey: ['ab-test-config', testName],
    queryFn: async (): Promise<ABTestConfig | null> => {
      const { data, error } = await (supabase as any)
        .from('ab_test_configs')
        .select('*')
        .eq('test_name', testName)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data || null;
    },
  });

  // Buscar ou criar assignment
  const { data: assignment, refetch } = useQuery({
    queryKey: ['ab-test-assignment', testName, sessionId],
    queryFn: async (): Promise<ABTestAssignment | null> => {
      if (!config) return null;

      // Tentar buscar assignment existente
      const { data: existing, error: fetchError } = await (supabase as any)
        .from('ab_test_assignments')
        .select('*')
        .eq('test_name', testName)
        .eq('session_id', sessionId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      if (existing) return existing;

      // Criar novo assignment
      const variant: 'A' | 'B' = Math.random() * 100 < config.split_percentage ? 'B' : 'A';
      
      const { data: newAssignment, error: insertError } = await (supabase as any)
        .from('ab_test_assignments')
        .insert({
          test_name: testName,
          session_id: sessionId,
          user_id: user?.id || null,
          variant,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      return newAssignment;
    },
    enabled: !!config,
  });

  // Marcar conversão
  const markConverted = useCallback(async () => {
    if (!assignment) return;

    await (supabase as any)
      .from('ab_test_assignments')
      .update({ converted: true })
      .eq('id', assignment.id);

    refetch();
  }, [assignment, refetch]);

  // Retornar dados da variante
  const variant = assignment?.variant || 'A';
  const variantData = useMemo(() => {
    if (!config) return null;
    return variant === 'B' ? config.variant_b : config.variant_a;
  }, [config, variant]);

  return {
    variant,
    variantData,
    isTestActive: !!config?.is_active,
    markConverted,
    isLoading: !config,
  };
}

// Hook para métricas de teste A/B (admin)
export function useABTestMetrics(testName: string) {
  return useQuery({
    queryKey: ['ab-test-metrics', testName],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('ab_test_assignments')
        .select('variant, converted')
        .eq('test_name', testName);

      if (error) throw error;

      const assignments = data || [];
      
      const variantA = assignments.filter((a: ABTestAssignment) => a.variant === 'A');
      const variantB = assignments.filter((a: ABTestAssignment) => a.variant === 'B');

      return {
        variantA: {
          total: variantA.length,
          converted: variantA.filter((a: ABTestAssignment) => a.converted).length,
          rate: variantA.length > 0 
            ? (variantA.filter((a: ABTestAssignment) => a.converted).length / variantA.length * 100).toFixed(1)
            : 0,
        },
        variantB: {
          total: variantB.length,
          converted: variantB.filter((a: ABTestAssignment) => a.converted).length,
          rate: variantB.length > 0 
            ? (variantB.filter((a: ABTestAssignment) => a.converted).length / variantB.length * 100).toFixed(1)
            : 0,
        },
        totalSamples: assignments.length,
      };
    },
    enabled: !!testName,
  });
}
