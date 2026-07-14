/**
 * useDiscoveryActions — wrappers para os RPCs de "Explorar misteriosos(as)".
 *
 * - ignore(targetProfileId): some por 30 dias do carrossel
 * - approach(targetProfileId): registra interesse → cria match se recíproco
 * - sendGiftAutoreply(targetProfileId, amount): após presente XP enviado,
 *   posta mensagem contextual no chat (com cooldown de 6h por par).
 *
 * Lista de ignorados / likes outgoing também é exposta para o carrossel
 * filtrar/decorar cards.
 */
import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { triggerPush } from '@/lib/pushTrigger';
import { toast } from 'sonner';

export interface DiscoveryLikeRow {
  target_profile_id: string;
  status: 'pending' | 'matched' | 'cancelled';
  match_id: string | null;
}

export function useDiscoveryState() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const myProfileId = (profile as any)?.id as string | undefined;
  const qc = useQueryClient();

  const ignoresQuery = useQuery({
    queryKey: ['discovery-ignores', myProfileId],
    queryFn: async (): Promise<Set<string>> => {
      if (!myProfileId) return new Set();
      const { data } = await (supabase as any)
        .from('oculto_discovery_ignores')
        .select('target_profile_id, ignored_until')
        .eq('user_profile_id', myProfileId)
        .gt('ignored_until', new Date().toISOString())
        .limit(2000);
      return new Set((data || []).map((r: any) => r.target_profile_id));
    },
    enabled: !!user?.id && !!myProfileId,
    staleTime: 60_000,
  });

  const likesQuery = useQuery({
    queryKey: ['discovery-likes-out', myProfileId],
    queryFn: async (): Promise<Map<string, DiscoveryLikeRow>> => {
      if (!myProfileId) return new Map();
      const [likesRes, matchesRes] = await Promise.all([
        (supabase as any)
          .from('oculto_discovery_likes')
          .select('user_profile_id, target_profile_id, status, match_id, created_at')
          .or(`user_profile_id.eq.${myProfileId},target_profile_id.eq.${myProfileId}`)
          .limit(2000),
        (supabase as any)
          .from('looking_now_matches')
          .select('id, user1_id, user2_id, is_expired, updated_at, matched_at, created_at')
          .or(`user1_id.eq.${myProfileId},user2_id.eq.${myProfileId}`)
          .limit(2000),
      ]);
      if (likesRes?.error) {
        console.warn('[discovery-likes-out] likes query error:', likesRes.error?.message);
      }
      if (matchesRes?.error) {
        console.warn('[discovery-likes-out] matches query error:', matchesRes.error?.message);
      }
      const discoveryLikes = likesRes?.data ?? [];
      const lookingNowMatches = matchesRes?.data ?? [];

      const m = new Map<string, DiscoveryLikeRow>();

      // Prioriza linhas OUTGOING (eu aproximei alguém) — são as que controlam
      // o botão "Enviado/Match" no meu carrossel. Linhas incoming só viram
      // "matched" quando bate match real (vide bloco abaixo).
      const outgoing = (discoveryLikes || []).filter(
        (r: any) => r.user_profile_id === myProfileId,
      );
      const incoming = (discoveryLikes || []).filter(
        (r: any) => r.target_profile_id === myProfileId,
      );

      outgoing.forEach((r: any) => {
        const otherId = r.target_profile_id;
        if (!otherId) return;
        const prev = m.get(otherId);
        if (prev?.status === 'matched') return;
        m.set(otherId, {
          target_profile_id: otherId,
          status: r.status,
          match_id: r.match_id,
        });
      });

      // Linha incoming só conta como 'matched' (reciprocidade já registrada).
      // Nunca rebaixa para 'pending' o estado de um botão "Enviado".
      incoming.forEach((r: any) => {
        if (r.status !== 'matched') return;
        const otherId = r.user_profile_id;
        if (!otherId) return;
        m.set(otherId, {
          target_profile_id: otherId,
          status: 'matched',
          match_id: r.match_id,
        });
      });

      (lookingNowMatches || []).forEach((r: any) => {
        const otherId = r.user1_id === myProfileId ? r.user2_id : r.user1_id;
        if (!otherId) return;

        const incomingStatus: DiscoveryLikeRow['status'] = r.is_expired ? 'cancelled' : 'matched';
        const prev = m.get(otherId);

        if (prev?.status === 'matched' && incomingStatus !== 'matched') return;

        m.set(otherId, {
          target_profile_id: otherId,
          status: incomingStatus,
          match_id: r.id ?? prev?.match_id ?? null,
        });
      });

      return m;
    },
    enabled: !!user?.id && !!myProfileId,
    staleTime: 30_000,
    // Garante leitura fresca a cada montagem (ex.: pós-login),
    // evitando piscar "Aproximar" para um card já enviado.
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!myProfileId) return;

    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ['discovery-likes-out', myProfileId] });
      qc.invalidateQueries({ queryKey: ['discovery-ignores', myProfileId] });
    };

    const unsubs = [
      subscribeTable('oculto_discovery_likes', invalidate),
      subscribeTable('looking_now_matches', invalidate),
      subscribeTable('oculto_discovery_ignores', invalidate),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [myProfileId, qc]);


  return {
    ignored: ignoresQuery.data ?? new Set<string>(),
    likes: likesQuery.data ?? new Map<string, DiscoveryLikeRow>(),
    isLoading: ignoresQuery.isLoading || likesQuery.isLoading,
    likesLoaded: likesQuery.isFetched && !likesQuery.isLoading,
  };
}

export function useDiscoveryActions() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();
  const myProfileId = (profile as any)?.id as string | undefined;

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['discovery-ignores', myProfileId] });
    qc.invalidateQueries({ queryKey: ['discovery-likes-out', myProfileId] });
    qc.invalidateQueries({ queryKey: ['new-real-users-carousel-v3'] });
    qc.invalidateQueries({ queryKey: ['discovery-matches', myProfileId] });
    qc.invalidateQueries({ queryKey: ['looking-now-matches'] });
  }, [qc, myProfileId]);

  const ignoreMutation = useMutation({
    mutationFn: async (targetProfileId: string) => {
      const { data, error } = await (supabase as any).rpc('discovery_ignore_user', {
        p_target_profile_id: targetProfileId,
        p_days: 15,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.ok) throw new Error(row?.reason || 'fail');
      return row;
    },
    onSuccess: () => invalidate(),
  });

  const approachMutation = useMutation({
    mutationFn: async (targetProfileId: string) => {
      const { data, error } = await (supabase as any).rpc('discovery_approach_user', {
        p_target_profile_id: targetProfileId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.ok) throw new Error(row?.reason || 'fail');
      const result = row as { ok: boolean; reason: string; matched: boolean; match_id: string | null };

      // Match recíproco em "Explorar novos misteriosos(as)" → dispara push para ambos.
      // Fire-and-forget; nunca bloqueia a UI.
      if (result.matched) {
        try {
          const [{ data: meProfile }, { data: targetProfile }] = await Promise.all([
            myProfileId
              ? (supabase as any)
                  .from('profiles')
                  .select('user_id, name, username')
                  .eq('id', myProfileId)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            (supabase as any)
              .from('profiles')
              .select('user_id, name, username')
              .eq('id', targetProfileId)
              .maybeSingle(),
          ]);

          const meAuthId = (meProfile as any)?.user_id ?? user?.id ?? null;
          const targetAuthId = (targetProfile as any)?.user_id ?? null;
          const meName =
            (meProfile as any)?.name || (meProfile as any)?.username || 'Alguém misterioso';
          const targetName =
            (targetProfile as any)?.name ||
            (targetProfile as any)?.username ||
            'Alguém misterioso';

          if (targetAuthId) {
            triggerPush({
              user_id: targetAuthId,
              title: 'Novo mistério revelado ✨',
              body: `Você e ${meName} se aproximaram. Abra o chat e diga oi!`,
              url: '/messages',
              type: 'discovery_match',
              tag: `discovery-match:${meAuthId ?? targetProfileId}`,
              requireInteraction: true,
            });
          }
          if (meAuthId) {
            triggerPush({
              user_id: meAuthId,
              title: 'Match misterioso 💫',
              body: `Você e ${targetName} se aproximaram. Abra o chat e diga oi!`,
              url: '/messages',
              type: 'discovery_match',
              tag: `discovery-match:${targetAuthId ?? targetProfileId}`,
              requireInteraction: true,
            });
          }
        } catch {
          /* push é best-effort */
        }
      }

      return result;
    },
    onSuccess: () => invalidate(),
  });

  const giftAutoreplyMutation = useMutation({
    mutationFn: async (vars: { targetProfileId: string; amount: number; message?: string }) => {
      const { data, error } = await (supabase as any).rpc('discovery_send_gift_autoreply', {
        p_target_profile_id: vars.targetProfileId,
        p_amount: vars.amount,
        p_message: vars.message ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.ok) {
        // cooldown não é erro fatal — silencia
        if (row?.reason === 'cooldown') return row;
        throw new Error(row?.reason || 'fail');
      }
      return row as { ok: boolean; reason: string; conversation_id: string | null; message_id: string | null };
    },
  });

  return useMemo(() => ({
    ignore: (id: string) => ignoreMutation.mutateAsync(id),
    approach: (id: string) => approachMutation.mutateAsync(id),
    sendGiftAutoreply: (targetProfileId: string, amount: number, message?: string) =>
      giftAutoreplyMutation.mutateAsync({ targetProfileId, amount, message }),
    ignoring: ignoreMutation.isPending,
    approaching: approachMutation.isPending,
    sendingAutoreply: giftAutoreplyMutation.isPending,
    canAct: !!user?.id && !!myProfileId,
  }), [ignoreMutation, approachMutation, giftAutoreplyMutation, user?.id, myProfileId]);
}

export function mapDiscoveryErrorMessage(error: unknown) {
  const raw = String((error as any)?.message || '').toLowerCase();

  if (!raw) return 'Falha ao aproximar.';
  if (raw.includes('blocked')) return 'Não é possível aproximar deste perfil.';
  if (raw.includes('invalid_target')) return 'Este perfil não está disponível para aproximação.';
  if (raw.includes('auth_required')) return 'Entre novamente para concluir a aproximação.';
  if (raw.includes('violates row-level security') || raw.includes('permission denied')) {
    return 'A aproximação foi bloqueada pelas permissões do banco.';
  }
  if (raw.includes('column') || raw.includes('relation') || raw.includes('function')) {
    return 'A função de aproximação no banco está desatualizada.';
  }
  return 'Falha ao aproximar.';
}
