/**
 * useSocialCore — hook único da identidade social.
 * Substitui chamadas paralelas de useSocialScore + usePrestige + useTrustScore
 * em telas onde os 3 aparecem juntos. Cache compartilhado via React Query.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchSocialIdentity } from './socialCore.service';
import { SOCIAL_IDENTITY_QUERY_KEY, SOCIAL_CORE_STALE_TIME } from './socialCore.constants';
import type { SocialIdentityFull } from './socialCore.types';

export function useSocialCore(userId?: string | null) {
  const { user } = useAuth();
  const target = userId ?? user?.id ?? null;

  return useQuery<SocialIdentityFull | null>({
    queryKey: [SOCIAL_IDENTITY_QUERY_KEY, target],
    enabled: !!target,
    staleTime: SOCIAL_CORE_STALE_TIME,
    refetchOnWindowFocus: false,
    queryFn: () => fetchSocialIdentity(target),
  });
}

// Re-export para conveniência
export type { SocialIdentityFull } from './socialCore.types';
