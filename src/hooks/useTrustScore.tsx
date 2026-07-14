import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface TrustScore {
  id: string;
  user_id: string;
  score: number;
  verification_points: number;
  profile_completion_points: number;
  activity_points: number;
  response_rate_points: number;
  report_penalty: number;
  last_calculated_at: string;
}

// Fetch user's trust score
export function useTrustScore(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;

  return useQuery({
    queryKey: ['trust-score', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return null;

      const { data, error } = await supabase
        .from('user_trust_scores')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (error) throw error;
      return data as TrustScore | null;
    },
    enabled: !!targetUserId,
  });
}

// Calculate and update trust score
export function useCalculateTrustScore() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // 1. Profile completion (0-25 points)
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url, bio, location_lat, is_verified')
        .eq('id', user.id)
        .single();

      const profileFields = [
        profile?.name,
        profile?.avatar_url,
        profile?.bio,
        profile?.location_lat,
      ];
      const profileCompletion = (profileFields.filter(Boolean).length / profileFields.length) * 25;

      // 2. Verification (0-30 points)
      const verificationPoints = profile?.is_verified ? 30 : 0;

      // 3. Activity (0-25 points) - based on recent logins/posts
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: postCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const activityPoints = Math.min(25, (postCount || 0) * 5);

      // 4. Response rate (0-20 points) - based on message response time
      // Simplified: assume good response rate for now
      const responseRatePoints = 15;

      // 5. Report penalty (0 to -50 points) - simplified for now
      const reportPenalty = 0;

      // Calculate total score
      const totalScore = Math.max(0, Math.min(100,
        Math.round(profileCompletion + verificationPoints + activityPoints + responseRatePoints - reportPenalty)
      ));

      // Upsert trust score
      const { data, error } = await supabase
        .from('user_trust_scores')
        .upsert({
          user_id: user.id,
          score: totalScore,
          verification_points: verificationPoints,
          profile_completion_points: Math.round(profileCompletion),
          activity_points: activityPoints,
          response_rate_points: responseRatePoints,
          report_penalty: reportPenalty,
          last_calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trust-score'] });
    },
    onError: () => {
      toast.error('Erro ao calcular score de confiança');
    },
  });
}

// Get trust score tier/label
export function getTrustTier(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excelente', color: 'text-green-500' };
  if (score >= 60) return { label: 'Bom', color: 'text-blue-500' };
  if (score >= 40) return { label: 'Regular', color: 'text-yellow-500' };
  if (score >= 20) return { label: 'Baixo', color: 'text-orange-500' };
  return { label: 'Crítico', color: 'text-red-500' };
}
