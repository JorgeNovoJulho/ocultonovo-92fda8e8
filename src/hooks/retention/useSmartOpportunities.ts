/**
 * useSmartOpportunities — engine de oportunidades para a Central Aura IA.
 *
 * Lê APENAS dados reais já existentes no Supabase externo. Cada sinal só é
 * emitido quando há informação válida. Otimizado para mobile antigo: queries
 * paralelas, head:true para contagens, payloads enxutos, staleTime alto.
 *
 * Sinais cobertos:
 *  - Mensagens não respondidas (messages.is_read=false, recipient=me)
 *  - Contato dormente (>= 12 dias sem mensagem com alguém recente)
 *  - Pessoas compatíveis aguardando (profile_likes recebidos sem seen_at)
 *  - Postagem que pode interessar (post recente de quem você segue, não curtido)
 *  - Queda de alcance (likes recebidos nos últimos 7d vs 7d anteriores)
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';

export type OpportunitySeverity = 'info' | 'warn' | 'hot';
export type OpportunityKind =
  | 'unread_dms'
  | 'dormant_contact'
  | 'likes_waiting'
  | 'post_for_you'
  | 'reach_drop';

export interface Opportunity {
  id: string;
  kind: OpportunityKind;
  icon: string;
  title: string;
  body: string;
  href: string;
  severity: OpportunitySeverity;
  meta?: Record<string, unknown>;
}

const DORMANT_DAYS = 12;
const sb = supabase as any;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export function useSmartOpportunities() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const me = user?.id;
  const myProfileId = (profile as any)?.id;
  const qc = useQueryClient();

  // Realtime: ao receber/ler mensagem, invalida a query para girar o card dormente.
  useEffect(() => {
    if (!me) return;
    const ch = sb
      .channel(`smart-opps-${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        qc.invalidateQueries({ queryKey: ['retention', 'smart-opportunities', me] });
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [me, qc]);

  return useQuery<Opportunity[]>({
    queryKey: ['retention', 'smart-opportunities', me],
    enabled: !!me,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!me) return [];

      const [
        unreadDms,
        dormant,
        likesWaiting,
        postForYou,
        reach,
      ] = await Promise.all([
        // 1) DMs não lidas direcionadas a mim
        safe(async () => {
          // pega conversas das quais participo
          const { data: parts } = await sb
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', me)
            .limit(200);
          const cids = (parts ?? []).map((p: any) => p.conversation_id).filter(Boolean);
          if (cids.length === 0) return { count: 0, lastSenderId: null as string | null };
          const { data: msgs, count } = await sb
            .from('messages')
            .select('sender_id, created_at', { count: 'exact' })
            .in('conversation_id', cids)
            .neq('sender_id', me)
            .eq('is_read', false)
            .eq('deleted_for_everyone', false)
            .order('created_at', { ascending: false })
            .limit(1);
          return { count: count ?? 0, lastSenderId: msgs?.[0]?.sender_id ?? null };
        }, { count: 0, lastSenderId: null as string | null }),

        // 2) Contato dormente: várias conversas em que a última mensagem do outro
        //    está entre 12 e 60 dias atrás e eu ainda NÃO respondi depois disso.
        //    Sorteia uma diferente a cada execução (gira em tempo real).
        safe(async () => {
          const since = new Date(Date.now() - 60 * 86400_000).toISOString();
          const until = new Date(Date.now() - DORMANT_DAYS * 86400_000).toISOString();
          const { data: parts } = await sb
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', me)
            .limit(200);
          const cids = (parts ?? []).map((p: any) => p.conversation_id);
          if (cids.length === 0) return null;
          const { data } = await sb
            .from('messages')
            .select('sender_id, created_at, conversation_id')
            .in('conversation_id', cids)
            .neq('sender_id', me)
            .gte('created_at', since)
            .lte('created_at', until)
            .order('created_at', { ascending: false })
            .limit(30);
          const rows = (data ?? []) as any[];
          if (rows.length === 0) return null;
          // Mantém só a mais recente por conversa.
          const byConv = new Map<string, any>();
          for (const r of rows) {
            if (!byConv.has(r.conversation_id)) byConv.set(r.conversation_id, r);
          }
          const convIds = Array.from(byConv.keys());
          // Remove conversas onde eu já enviei algo APÓS a última mensagem do outro.
          const { data: mine } = await sb
            .from('messages')
            .select('conversation_id, created_at')
            .in('conversation_id', convIds)
            .eq('sender_id', me)
            .order('created_at', { ascending: false });
          const myLast = new Map<string, string>();
          for (const m of (mine ?? []) as any[]) {
            if (!myLast.has(m.conversation_id)) myLast.set(m.conversation_id, m.created_at);
          }
          const pending = Array.from(byConv.values()).filter((r: any) => {
            const ml = myLast.get(r.conversation_id);
            return !ml || new Date(ml).getTime() < new Date(r.created_at).getTime();
          });
          if (pending.length === 0) return null;
          // Sorteia uma — gira a cada refetch.
          const pick = pending[Math.floor(Math.random() * pending.length)];
          const days = Math.floor((Date.now() - new Date(pick.created_at).getTime()) / 86400_000);
          const { data: prof } = await sb
            .from('profiles')
            .select('username, name, display_name')
            .eq('user_id', pick.sender_id)
            .maybeSingle();
          const handle = (prof as any)?.username
            ? `@${(prof as any).username}`
            : ((prof as any)?.display_name || (prof as any)?.name || null);
          return {
            senderId: pick.sender_id as string,
            conversationId: pick.conversation_id as string,
            days,
            handle,
          };
        }, null as null | { senderId: string; conversationId: string; days: number; handle: string | null }),


        // 3) Curtidas de perfil recebidas e ainda não vistas
        safe(async () => {
          if (!myProfileId) return 0;
          const { count } = await sb
            .from('profile_likes')
            .select('id', { count: 'exact', head: true })
            .eq('liked_id', myProfileId)
            .eq('is_ghost', false)
            .is('seen_at', null);
          return count ?? 0;
        }, 0),

        // 4) Postagem recente (24h) de alguém que sigo e que ainda não curti
        safe(async () => {
          const { data: f } = await sb
            .from('follows')
            .select('following_id')
            .eq('follower_id', me)
            .limit(100);
          const ids = (f ?? []).map((r: any) => r.following_id);
          if (ids.length === 0) return null;
          const since = new Date(Date.now() - 24 * 3600_000).toISOString();
          const { data: posts } = await sb
            .from('posts')
            .select('id, author_id, created_at, is_seed')
            .in('author_id', ids)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(20);
          const candidates = (posts ?? []).filter((p: any) => !p.is_seed);
          if (candidates.length === 0) return null;
          // remove os que já curti
          const pids = candidates.map((p: any) => p.id);
          const { data: liked } = await sb
            .from('post_likes')
            .select('post_id')
            .eq('user_id', me)
            .in('post_id', pids);
          const likedSet = new Set((liked ?? []).map((r: any) => r.post_id));
          const fresh = candidates.find((p: any) => !likedSet.has(p.id));
          return fresh ? { postId: fresh.id as string, authorId: fresh.author_id as string } : null;
        }, null as null | { postId: string; authorId: string }),

        // 5) Queda de alcance: likes recebidos em meus posts, 7d atuais vs 7d anteriores
        safe(async () => {
          if (!myProfileId) return null;
          const now = Date.now();
          const d7 = new Date(now - 7 * 86400_000).toISOString();
          const d14 = new Date(now - 14 * 86400_000).toISOString();
          const { data: myPosts } = await sb
            .from('posts')
            .select('id, created_at')
            .eq('author_id', myProfileId)
            .gte('created_at', d14)
            .limit(200);
          const ids = (myPosts ?? []).map((p: any) => p.id);
          if (ids.length === 0) return null;
          const [{ count: curr = 0 } = { count: 0 }, { count: prev = 0 } = { count: 0 }] = await Promise.all([
            sb.from('post_likes').select('id', { count: 'exact', head: true })
              .in('post_id', ids).gte('created_at', d7).eq('is_seed', false),
            sb.from('post_likes').select('id', { count: 'exact', head: true })
              .in('post_id', ids).gte('created_at', d14).lt('created_at', d7).eq('is_seed', false),
          ]);
          const c = curr ?? 0, p = prev ?? 0;
          if (p < 5 || c >= p) return null; // só alerta quando há base e houve queda real
          const dropPct = Math.round(((p - c) / p) * 100);
          if (dropPct < 25) return null;
          return { curr: c, prev: p, dropPct };
        }, null as null | { curr: number; prev: number; dropPct: number }),
      ]);

      const out: Opportunity[] = [];

      if (unreadDms.count > 0) {
        out.push({
          id: 'unread_dms',
          kind: 'unread_dms',
          icon: '💬',
          title: `${unreadDms.count} mensage${unreadDms.count === 1 ? 'm' : 'ns'} aguardando`,
          body: 'Você tem conversas com respostas pendentes.',
          href: '/messages',
          severity: unreadDms.count >= 5 ? 'hot' : 'warn',
          meta: { count: unreadDms.count },
        });
      }

      if (dormant) {
        const who = dormant.handle ? ` com ${dormant.handle}` : '';
        out.push({
          id: `dormant_${dormant.senderId}`,
          kind: 'dormant_contact',
          icon: '🕯️',
          title: `Você não fala${who} há ${dormant.days} dias`,
          body: 'Reabra a conversa antes que o vínculo esfrie.',
          href: `/messages?c=${dormant.conversationId}`,
          severity: dormant.days >= 21 ? 'warn' : 'info',
          meta: dormant,
        });
      }


      if (likesWaiting > 0) {
        out.push({
          id: 'likes_waiting',
          kind: 'likes_waiting',
          icon: '✨',
          title: `${likesWaiting} ${likesWaiting === 1 ? 'pessoa compatível aguarda' : 'pessoas compatíveis aguardam'}`,
          body: 'Demonstraram interesse no seu perfil e ainda não foram vistas.',
          href: '/likes-received',
          severity: likesWaiting >= 5 ? 'hot' : 'warn',
          meta: { count: likesWaiting },
        });
      }

      if (postForYou) {
        out.push({
          id: `post_${postForYou.postId}`,
          kind: 'post_for_you',
          icon: '📌',
          title: 'Uma publicação que pode te interessar',
          body: 'Conteúdo recente de alguém que você segue — você ainda não viu.',
          href: `/post/${postForYou.postId}`,
          severity: 'info',
          meta: postForYou,
        });
      }

      if (reach) {
        out.push({
          id: 'reach_drop',
          kind: 'reach_drop',
          icon: '📉',
          title: `Seu alcance caiu ${reach.dropPct}% esta semana`,
          body: `Curtidas: ${reach.curr} vs ${reach.prev} nos 7 dias anteriores. Poste algo novo.`,
          href: '/create',
          severity: reach.dropPct >= 50 ? 'hot' : 'warn',
          meta: reach,
        });
      }

      return out;
    },
  });
}
