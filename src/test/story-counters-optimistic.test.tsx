/**
 * Garantia de comportamento dos contadores de story:
 *  - bump otimista imediato (UX em todos os dispositivos)
 *  - troca like ↔ dislike decrementa o oposto
 *  - rollback se a mutação falhar
 *
 * Foca na lógica de cache do React Query usada por useLikeStory/useDislikeStory.
 * Não chama Supabase real — simula o efeito (sucesso/erro) das mutações.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

// Mocks ANTES do import dos hooks
vi.mock('@/lib/supabaseExternal', () => {
  const ok = { error: null, data: null };
  const chain = () => ({
    select: () => chain(),
    eq: () => chain(),
    insert: vi.fn().mockResolvedValue(ok),
    delete: () => ({ eq: () => ({ eq: vi.fn().mockResolvedValue(ok) }) }),
    maybeSingle: vi.fn().mockResolvedValue(ok),
    single: vi.fn().mockResolvedValue({ data: { id: 'profile-1' }, error: null }),
  });
  return {
    supabase: {
      from: vi.fn(() => chain()),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLikeStory, useDislikeStory } from '@/hooks/useStoryLikes';

const STORY_ID = 'story-abc';

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={qc}>{children}</QueryClientProvider> as any;
}

describe('story counters — optimistic updates', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['story-like-count', STORY_ID], 5);
    qc.setQueryData(['story-dislike-count', STORY_ID], 2);
    qc.setQueryData(['story-like-status', STORY_ID, 'user-1'], false);
    qc.setQueryData(['story-dislike-status', STORY_ID, 'user-1'], false);
  });

  it('like: bump otimista do contador (5 → 6) instantaneamente', async () => {
    const { result } = renderHook(() => useLikeStory(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      result.current.mutate({ storyId: STORY_ID, isLiked: false });
    });
    // logo após o mutate, antes do refetch terminar, o cache já reflete +1
    await waitFor(() => {
      expect(qc.getQueryData(['story-like-count', STORY_ID])).toBeGreaterThanOrEqual(6);
    });
  });

  it('dislike depois de like: decrementa likes e incrementa dislikes', async () => {
    qc.setQueryData(['story-like-status', STORY_ID, 'user-1'], true);
    const { result } = renderHook(() => useDislikeStory(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      result.current.mutate({ storyId: STORY_ID, isDisliked: false });
    });
    await waitFor(() => {
      expect(qc.getQueryData(['story-dislike-count', STORY_ID])).toBe(3);
      expect(qc.getQueryData(['story-like-count', STORY_ID])).toBe(4);
    });
  });

  it('rollback: se mutationFn falhar, contador volta ao valor anterior', async () => {
    const { supabase } = await import('@/lib/supabaseExternal');
    // força erro no insert
    (supabase as any).from = vi.fn(() => ({
      select: () => ({ eq: () => ({ single: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }) }) }),
      delete: () => ({ eq: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }),
      insert: vi.fn().mockResolvedValue({ error: { message: 'boom' } }),
    }));

    const { result } = renderHook(() => useLikeStory(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      try {
        await result.current.mutateAsync({ storyId: STORY_ID, isLiked: false });
      } catch { /* esperado */ }
    });
    // contador deve ter voltado ao valor anterior (5)
    await waitFor(() => {
      expect(qc.getQueryData(['story-like-count', STORY_ID])).toBe(5);
    });
  });
});
