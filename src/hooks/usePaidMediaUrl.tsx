import { useQuery } from '@tanstack/react-query';
import { fetchPaidMediaUrl } from '@/lib/paidMedia';
import { useAuth } from './useAuth';

/**
 * Resolve uma signed URL temporária para mídia paga via edge function.
 * Só dispara quando o usuário tem acesso (comprador, dono ou admin).
 * Re-fetch automático a cada ~50s (TTL do signed URL é 60s).
 */
export function usePaidMediaUrl(postId: string | undefined, enabled: boolean) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['paid-media-url', postId, user?.id],
    queryFn: async () => {
      if (!postId) return { url: null as string | null, legacy: false, forbidden: false };
      const r = await fetchPaidMediaUrl(postId);
      return {
        url: r.url || null,
        legacy: !!r.legacy,
        forbidden: r.error === 'forbidden' || r.error === 'unauthorized',
      };
    },
    enabled: !!postId && !!user && enabled,
    staleTime: 50_000,
    refetchInterval: 50_000,
    retry: false,
  });
}
