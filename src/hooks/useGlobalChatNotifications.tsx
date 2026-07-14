import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from '@/hooks/useAuth';
import { resolveChatIdentity, isSelfChatId, isChatBlockedBetween } from '@/lib/chatIdentity';
import { playNewMessageSound, isConversationMuted } from '@/lib/messageSound';
import { showNewMessageToast, formatSenderHandle } from '@/lib/newMessageToast';

/**
 * Listener global de novas mensagens — funciona em QUALQUER rota autenticada,
 * inclusive em mobile quando o chat está fechado. Garante que:
 *  - som de nova mensagem toca (respeitando mute/volume/conversa silenciada)
 *  - vibração dispara no mobile
 *  - toast (sonner top-center) aparece com CTA "Abrir" para ir à conversa
 *
 * Dedup é feito por id da mensagem em duas camadas independentes:
 *  - playNewMessageSound: `recentlyPlayedEventKeys`
 *  - showNewMessageToast: `recentlyShown` + id próprio do sonner
 * Assim, mesmo que o hook monte mais de uma vez (StrictMode/HMR/layout
 * aninhado) ou compartilhe canal com `useChat`, cada mensagem produz
 * exatamente um efeito sonoro e um toast.
 */
export function useGlobalChatNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const selfIdsRef = useRef<string[]>([]);
  const senderCacheRef = useRef<Map<string, { username?: string | null; name?: string | null; avatar_url?: string | null }>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const identity = await resolveChatIdentity(user.id);
        if (!cancelled) selfIdsRef.current = identity.selfIds.length ? identity.selfIds : [user.id];
      } catch {
        if (!cancelled) selfIdsRef.current = [user.id];
      }
    })();


    const unsub = subscribeTable('messages', (payload: any) => {
      const inserted = payload.new as {
        id?: string;
        conversation_id?: string;
        sender_id?: string;
        content?: string;
      };
      if (!inserted?.conversation_id || !inserted?.sender_id) return;

      // Ignora mensagens do próprio usuário (qualquer identidade vinculada).
      const selfIds = selfIdsRef.current.length ? selfIdsRef.current : [user.id];
      if (isSelfChatId(inserted.sender_id, selfIds)) return;

      // Mute por conversa silencia tudo (check síncrono).
      if (isConversationMuted(inserted.conversation_id)) return;

      // 🚀 Som dispara IMEDIATAMENTE — sem esperar checagem de bloqueio.
      // Se o usuário estiver bloqueado, o toast/notificação são suprimidos
      // depois em background; o áudio em si é inofensivo e instantâneo.
      playNewMessageSound(
        inserted.id ? `message:${String(inserted.id)}` : undefined,
        inserted.conversation_id,
      );

      // 🔔 Garante que a inbox (useChat) sincronize imediatamente — necessário
      // quando a conversa é NOVA (primeira mensagem) e ainda não existe no
      // estado local. Sem isso, o toast aparece mas a conversa não entra na lista.
      try {
        window.dispatchEvent(new CustomEvent('oculto:chat:force-refetch'));
      } catch { /* noop */ }

      // Enriquecimento + checagem de bloqueio em paralelo, sem segurar a UI.
      void (async () => {
        try {
          if (await isChatBlockedBetween(inserted.sender_id, user.id)) return;
        } catch { /* segue mostrando toast em caso de falha de check */ }

        // Busca @username do remetente (cache + fallback seguro, nunca nome real).
        let rawHandle = '';
        let avatarUrl: string | null = null;
        const cached = senderCacheRef.current.get(inserted.sender_id!);
        if (cached?.username) {
          rawHandle = `@${cached.username}`;
          avatarUrl = cached.avatar_url ?? null;
        } else {
          try {
            const { data: prof } = await (supabase as any)
              .from('v_public_profiles')
              .select('username, avatar_url')
              .eq('user_id', inserted.sender_id!)
              .maybeSingle();
            if (prof) {
              senderCacheRef.current.set(inserted.sender_id!, prof);
              if (prof.username) rawHandle = `@${prof.username}`;
              avatarUrl = prof.avatar_url ?? null;
            }
          } catch { /* noop */ }
        }

        const senderLabel = formatSenderHandle(rawHandle);
        const rawContent = (inserted.content || '').trim();
        const mediaPreview = rawContent
          || (String((payload.new as any)?.media_type || '').startsWith('video') ? '🎥 Vídeo enviado' : 'Nova mensagem');

        showNewMessageToast({
          key: `toast:${String(inserted.id)}`,
          senderName: senderLabel,
          avatarUrl,
          content: mediaPreview,
          conversationId: inserted.conversation_id!,
          onOpen: (id) => navigate(`/messages?c=${id}`),
        });
      })();
    }, { events: ['INSERT'] });

    return () => {
      cancelled = true;
      try { unsub(); } catch {}
      channelRef.current = null;
    };

  }, [user?.id, navigate]);
}

/** Wrapper para mount declarativo em ProtectedRoute. */
export function GlobalChatNotificationsMount() {
  useGlobalChatNotifications();
  return null;
}
