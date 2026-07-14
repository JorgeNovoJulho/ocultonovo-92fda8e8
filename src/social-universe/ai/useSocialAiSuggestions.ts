/**
 * useSocialAiSuggestions — Prioridade 4
 * Recomendações sociais por regras. Respeita opt-out (cookies_personalization).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';

export interface SocialAiSuggestion {
  key: string;
  title: string;
  body: string;
  cta: string;
  route: string;
  reason: string;
  weight: number;
}

export function useSocialAiSuggestions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['social-ai-recommend', user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SocialAiSuggestion[]> => {
      const { data } = await (supabase as any).rpc('social_ai_recommend', { p_user: null });
      return Array.isArray(data) ? (data as SocialAiSuggestion[]) : [];
    },
  });
}

export async function trackSocialAi(rule: string, action: 'shown' | 'clicked' | 'dismissed') {
  try {
    await (supabase as any).rpc('social_ai_track', { p_rule: rule, p_action: action });
  } catch { /* silencioso */ }
}
