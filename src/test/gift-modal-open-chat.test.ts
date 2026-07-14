import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Valida o fluxo "Abrir Chat" do GiftReceivedModal:
 *  - Resolve qualquer id (profile.id / user_id / auth.id) para auth.users.id
 *  - Cria a conversa via RPC `get_or_create_conversation` quando não existe
 *  - Retorna a MESMA conversa quando já existe (idempotente)
 *  - O id devolvido é o usado na rota /messages?c={id}
 */

const newConversationId = 'conv-NEW-1234';
const existingConversationId = 'conv-EXISTING-9999';

const supabaseMock = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('@/lib/supabaseExternal', () => ({ supabase: supabaseMock }));

const { getOrCreateConversationId } = await import('@/lib/conversationsApi');
const { resolveAuthUserIdFromAnyId } = await import('@/lib/chatIdentity');

beforeEach(() => {
  supabaseMock.from.mockReset();
  supabaseMock.rpc.mockReset();
});

function mockProfileLookup(authUserId: string | null) {
  supabaseMock.from.mockImplementation((table: string) => {
    if (table !== 'profiles') throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        or: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: authUserId ? { id: 'profile-xyz', user_id: authUserId } : null,
              error: null,
            }),
        }),
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
    };
  });
}

describe('GiftReceivedModal → Abrir Chat (fluxo mock)', () => {
  it('resolve profile.id → auth.users.id e cria conversa nova', async () => {
    const senderProfileId = 'profile-sender-1';
    const senderAuthId = 'auth-sender-1';
    const meAuthId = 'auth-me';

    mockProfileLookup(senderAuthId);
    supabaseMock.rpc.mockResolvedValueOnce({ data: newConversationId, error: null });

    const target = (await resolveAuthUserIdFromAnyId(senderProfileId)) || senderProfileId;
    expect(target).toBe(senderAuthId);

    const { id, error } = await getOrCreateConversationId(meAuthId, target);
    expect(error).toBeNull();
    expect(id).toBe(newConversationId);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_or_create_conversation', {
      p1: meAuthId,
      p2: senderAuthId,
    });

    // simula a rota usada pelo modal
    const route = `/messages?c=${id}`;
    expect(route).toBe(`/messages?c=${newConversationId}`);
  });

  it('é idempotente: retorna a mesma conversa quando já existe', async () => {
    mockProfileLookup('auth-sender-2');
    supabaseMock.rpc
      .mockResolvedValueOnce({ data: existingConversationId, error: null })
      .mockResolvedValueOnce({ data: existingConversationId, error: null });

    const a = await getOrCreateConversationId('auth-me', 'auth-sender-2');
    const b = await getOrCreateConversationId('auth-me', 'auth-sender-2');

    expect(a.id).toBe(existingConversationId);
    expect(b.id).toBe(existingConversationId);
    expect(a.id).toBe(b.id);
  });

  it('faz fallback para assinatura longa (p_user1_id/p_user2_id) se a curta não existir', async () => {
    mockProfileLookup('auth-sender-3');
    supabaseMock.rpc
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Could not find the function public.get_or_create_conversation(p1, p2) in the schema cache' },
      })
      .mockResolvedValueOnce({ data: newConversationId, error: null });

    const { id, error } = await getOrCreateConversationId('auth-me', 'auth-sender-3');
    expect(error).toBeNull();
    expect(id).toBe(newConversationId);
    expect(supabaseMock.rpc).toHaveBeenNthCalledWith(2, 'get_or_create_conversation', {
      p_user1_id: 'auth-me',
      p_user2_id: 'auth-sender-3',
    });
  });

  it('propaga erro quando o backend falha de verdade', async () => {
    mockProfileLookup('auth-sender-4');
    supabaseMock.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied' },
    });

    const { id, error } = await getOrCreateConversationId('auth-me', 'auth-sender-4');
    expect(id).toBeNull();
    expect(error?.message).toMatch(/permission denied/);
  });
});
