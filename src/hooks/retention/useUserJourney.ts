/**
 * useUserJourney — Bloco 2 "Sua Jornada".
 *
 * Compõe dados JÁ EXISTENTES (sem duplicar nenhum sistema):
 *   - useAuraProgress  → xp, level
 *   - useAuraStreak    → current_streak
 *   - useMyProfileStats→ followers, posts, views (= curtidas/visitas)
 *   - useProfile       → created_at (dias na plataforma)
 *   - oculto_community_members → quantidade de comunidades em que participa
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useAuraProgress } from '@/hooks/useAuraProgress';
import { useAuraStreak } from '@/hooks/useAuraStreak';
import { useMyProfileStats } from '@/hooks/useMyProfileStats';

export interface UserJourneyData {
  daysOnOculto: number;
  communitiesJoined: number;
  totalLikesReceived: number;
  totalFollowers: number;
  totalPosts: number;
  auraLevel: number;
  auraXp: number;
  streakDays: number;
  /** Pequena narrativa em frases curtas. */
  story: string[];
}

export function useUserJourney(): UserJourneyData | null {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { progress } = useAuraProgress(false);
  const { status: streak } = useAuraStreak();
  const { data: stats } = useMyProfileStats(profile?.id);

  const { data: communitiesJoined = 0 } = useQuery({
    queryKey: ['retention', 'journey', 'communities-count', user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      try {
        const { count } = await (supabase as any)
          .from('oculto_community_members')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id);
        return count ?? 0;
      } catch {
        return 0;
      }
    },
  });

  // useAuraProgress retorna { progress, ... } — usamos o objeto direto.
  const auraLevel = (progress as any)?.level ?? 1;
  const auraXp = (progress as any)?.xp ?? 0;
  const streakDays = streak?.current_streak ?? 0;

  if (!user?.id) return null;

  const createdAt = (profile as any)?.created_at;
  const daysOnOculto = createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
    : 0;

  const totalFollowers = stats?.totalFollowers ?? 0;
  const totalPosts = stats?.totalPosts ?? 0;
  const totalLikesReceived = stats?.totalViews ?? 0; // proxy: visitas recebidas

  const story: string[] = [];
  if (daysOnOculto > 0) story.push(`Você está no Oculto há ${daysOnOculto} dia${daysOnOculto === 1 ? '' : 's'}.`);
  if (communitiesJoined > 0) story.push(`Participa de ${communitiesJoined} comunidade${communitiesJoined === 1 ? '' : 's'}.`);
  if (totalLikesReceived > 0) story.push(`Recebeu ${totalLikesReceived} interaç${totalLikesReceived === 1 ? 'ão' : 'ões'} no perfil.`);
  if (totalFollowers > 0) story.push(`Tem ${totalFollowers} seguidor${totalFollowers === 1 ? '' : 'es'}.`);
  if (auraLevel > 1) story.push(`Sua Aura está no nível ${auraLevel}.`);
  if (streakDays > 1) story.push(`Sequência atual: ${streakDays} dias 🔥.`);
  if (story.length === 0) story.push('Sua jornada começa agora — explore comunidades, eventos e o Aura Match.');

  return {
    daysOnOculto,
    communitiesJoined,
    totalLikesReceived,
    totalFollowers,
    totalPosts,
    auraLevel,
    auraXp,
    streakDays,
    story,
  };
}
