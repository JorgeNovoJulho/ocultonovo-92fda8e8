import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from '@/hooks/use-toast';

export interface CreatorGoal {
  id: string;
  creator_id: string;
  title: string;
  target_amount: number;
  current_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GoalContribution {
  id: string;
  goal_id: string;
  contributor_id: string;
  amount: number;
  message: string | null;
  is_anonymous: boolean;
  created_at: string;
}

// Get active goal for the current creator
export function useMyCreatorGoal() {
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['my-creator-goal', profile?.id],
    queryFn: async (): Promise<CreatorGoal | null> => {
      if (!profile?.id) return null;

      const { data, error } = await (supabase as any)
        .from('creator_goals')
        .select('*')
        .eq('creator_id', profile.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching creator goal:', error);
        return null;
      }

      return data;
    },
    enabled: !!profile?.id,
  });
}

// Get active goal for a specific creator (for profile display)
export function useCreatorGoal(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-goal', creatorId],
    queryFn: async (): Promise<CreatorGoal | null> => {
      if (!creatorId) return null;

      const { data, error } = await (supabase as any)
        .from('creator_goals')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching creator goal:', error);
        return null;
      }

      return data;
    },
    enabled: !!creatorId,
  });
}

// Create or update creator goal
export function useUpsertCreatorGoal() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goal: { title: string; target_amount: number }) => {
      if (!profile?.id) throw new Error('Profile not found');

      // First, deactivate any existing active goals
      await (supabase as any)
        .from('creator_goals')
        .update({ is_active: false })
        .eq('creator_id', profile.id)
        .eq('is_active', true);

      // Create new goal
      const { data, error } = await (supabase as any)
        .from('creator_goals')
        .insert({
          creator_id: profile.id,
          title: goal.title,
          target_amount: goal.target_amount,
          current_amount: 0,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-creator-goal'] });
      queryClient.invalidateQueries({ queryKey: ['creator-goal'] });
      toast({
        title: 'Meta criada!',
        description: 'Sua nova meta está visível no seu perfil.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar meta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Update goal amount (for contributions)
export function useUpdateGoalAmount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ goalId, amountToAdd }: { goalId: string; amountToAdd: number }) => {
      // Get current amount
      const { data: goal, error: fetchError } = await (supabase as any)
        .from('creator_goals')
        .select('current_amount')
        .eq('id', goalId)
        .single();

      if (fetchError) throw fetchError;

      // Update with new amount
      const { error } = await (supabase as any)
        .from('creator_goals')
        .update({ 
          current_amount: Number(goal.current_amount) + amountToAdd,
          updated_at: new Date().toISOString(),
        })
        .eq('id', goalId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-creator-goal'] });
      queryClient.invalidateQueries({ queryKey: ['creator-goal'] });
    },
  });
}

// Contribute to a goal
export function useContributeToGoal() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const updateGoalAmount = useUpdateGoalAmount();

  return useMutation({
    mutationFn: async (contribution: { 
      goal_id: string; 
      amount: number; 
      message?: string;
      is_anonymous?: boolean;
    }) => {
      if (!profile?.id) throw new Error('Profile not found');

      // Create contribution record
      const { data, error } = await (supabase as any)
        .from('goal_contributions')
        .insert({
          goal_id: contribution.goal_id,
          contributor_id: profile.id,
          amount: contribution.amount,
          message: contribution.message || null,
          is_anonymous: contribution.is_anonymous || false,
        })
        .select()
        .single();

      if (error) throw error;

      // Update goal amount
      await updateGoalAmount.mutateAsync({
        goalId: contribution.goal_id,
        amountToAdd: contribution.amount,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-goal'] });
      queryClient.invalidateQueries({ queryKey: ['my-creator-goal'] });
      toast({
        title: 'Contribuição enviada!',
        description: 'Obrigado por apoiar este criador.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao contribuir',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Deactivate goal
export function useDeactivateGoal() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goalId: string) => {
      if (!profile?.id) throw new Error('Profile not found');

      const { error } = await (supabase as any)
        .from('creator_goals')
        .update({ is_active: false })
        .eq('id', goalId)
        .eq('creator_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-creator-goal'] });
      queryClient.invalidateQueries({ queryKey: ['creator-goal'] });
      toast({
        title: 'Meta desativada',
        description: 'A meta não será mais exibida no seu perfil.',
      });
    },
  });
}
