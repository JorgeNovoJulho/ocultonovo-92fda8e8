import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { Message } from './useChat';
import { toast } from 'sonner';
import { resolveChatIdentity, resolveProfileByAnyId, isSelfChatId, resolveConversationPeerId, isChatBlockedBetween } from '@/lib/chatIdentity';
import { playNewMessageSound } from '@/lib/messageSound';
import { triggerPush } from '@/lib/pushTrigger';
import { useBlockedContacts } from './useBlockedContacts';

const MESSAGES_PAGE_SIZE = 30;

const sortMessagesByTimestamp = (items: Message[]) =>
  [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

const trimMessageForType = (content: string, mediaType?: string | null) =>
  mediaType === 'sticker'
    ? (content || '').replace(/^\uFEFF+/, '').trim()
    : (content || '').trim();

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  // IMPORTANTE: useBlockedContacts deve ser chamado no topo (Rules of Hooks)
  const { data: blockedList } = useBlockedContacts();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'error'>('connected');
  const connectionStatusRef = useRef<'connected' | 'reconnecting' | 'error'>('connected');
  useEffect(() => { connectionStatusRef.current = connectionStatus; }, [connectionStatus]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const blockedSenderIdsRef = useRef<Set<string>>(new Set());
  const selfIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (user?.id) resolveChatIdentity(user.id).then(id => { selfIdsRef.current = id.selfIds; });
  }, [user?.id]);

  const isChatBlockedWith = useCallback(async (otherId?: string | null) => {
    if (!otherId) return false;
    if (blockedSenderIdsRef.current.has(otherId)) return true;
    return isChatBlockedBetween(otherId, user?.id);
  }, [user?.id]);

  const fetchMessages = useCallback(async (offset = 0) => {
    if (!conversationId || !user) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const isInitial = offset === 0;
      if (!isInitial) setLoadingMore(true);

      // 🚀 SELECT e identity ROLAM EM PARALELO — sem isso o histórico
      // esperava 1 roundtrip extra (resolveChatIdentity) antes de buscar
      // as mensagens, atrasando a abertura da conversa.
      const selectPromise = supabase
        .from('messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          is_read,
          created_at,
          media_url,
          media_type,
          is_locked,
          unlock_price,
          unlocked_by,
          story_reply_id,
          deleted_for_everyone,
          deleted_by
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + MESSAGES_PAGE_SIZE - 1);

      const identityPromise = resolveChatIdentity(user.id);

      const [{ data, error }, selfIdentity] = await Promise.all([selectPromise, identityPromise]);
      const selfIds = selfIdentity.selfIds.length > 0 ? selfIdentity.selfIds : [user.id];

      if (error) throw error;

      // Check if there are more messages
      setHasMore((data?.length || 0) >= MESSAGES_PAGE_SIZE);

      // Fetch story data for messages that are replies to stories
      const messagesWithStoryReply = (data || []).filter(m => m.story_reply_id);
      let storyMap = new Map<string, any>();

      if (messagesWithStoryReply.length > 0) {
        const storyIds = [...new Set(messagesWithStoryReply.map(m => m.story_reply_id))];
        const { data: stories } = await (supabase as any)
          .from('posts')
          .select('id, media_url, content_text, created_at, user_id')
          .in('id', storyIds);

        const storyAuthorIds = [...new Set((stories || []).map((story: any) => story.user_id).filter(Boolean))];
        const storyAuthors = new Map<string, any>();
        if (storyAuthorIds.length > 0) {
          const [byUserId, byId] = await Promise.all([
            (supabase as any).from('v_public_profiles').select('id, user_id, name, username, avatar_url').in('user_id', storyAuthorIds),
            (supabase as any).from('v_public_profiles').select('id, user_id, name, username, avatar_url').in('id', storyAuthorIds),
          ]);
          [...(byUserId.data || []), ...(byId.data || [])].forEach((profile: any) => {
            if (profile?.user_id) storyAuthors.set(profile.user_id, profile);
            if (profile?.id) storyAuthors.set(profile.id, profile);
          });
        }

        if (stories) {
          stories.forEach((story: any) => {
            storyMap.set(story.id, {
              id: story.id,
              media_url: story.media_url,
              content_text: story.content_text,
              created_at: story.created_at,
              author: storyAuthors.get(story.user_id) || null,
            });
          });
        }
      }

      const formattedMessages: Message[] = (data || []).reverse().map(msg => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        sender_id: msg.sender_id,
        content: msg.content,
        is_read: msg.is_read,
        created_at: msg.created_at,
        media_url: msg.media_url,
        media_type: msg.media_type,
        is_locked: msg.is_locked,
        unlock_price: msg.unlock_price,
        unlocked_by: msg.unlocked_by as string[] | undefined,
        story_reply_id: msg.story_reply_id,
        story: msg.story_reply_id ? storyMap.get(msg.story_reply_id) : undefined,
        deleted_for_everyone: (msg as any).deleted_for_everyone || false,
        deleted_by: (msg as any).deleted_by as string[] || [],
        sender: undefined,
      }));

      // 1) RENDER IMEDIATO: monta a UI sem esperar enriquecimento de perfis.
      //    Como o bubble usa avatar do header como fallback, o usuário vê
      //    mensagens em <100ms; perfis chegam logo depois.
      if (isInitial) {
        setMessages(sortMessagesByTimestamp(formattedMessages));
      } else {
        setMessages(prev => sortMessagesByTimestamp([...formattedMessages, ...prev]));
      }
      setLoading(false);
      setLoadingMore(false);

      // 2) Enrich em background — UMA query com in() para todos os senders
      //    (em vez de N queries paralelas com resolveProfileByAnyId).
      const senderIds = Array.from(new Set(formattedMessages.map(msg => msg.sender_id).filter(Boolean)));
      if (senderIds.length > 0) {
        const senderMap = new Map<string, { id: string; user_id: string; name: string; avatar_url: string | null }>();
        try {
          const [byUserId, byId] = await Promise.all([
            (supabase as any).from('v_public_profiles').select('id, user_id, name, avatar_url').in('user_id', senderIds),
            (supabase as any).from('v_public_profiles').select('id, user_id, name, avatar_url').in('id', senderIds),
          ]);
          const indexProfile = (p: any) => {
            if (!p) return;
            const mapped = { id: p.id, user_id: p.user_id, name: p.name, avatar_url: p.avatar_url };
            if (p.user_id) senderMap.set(p.user_id, mapped);
            if (p.id) senderMap.set(p.id, mapped);
          };
          (byUserId.data || []).forEach(indexProfile);
          (byId.data || []).forEach(indexProfile);
        } catch { /* noop — render imediato já foi feito */ }

        setMessages(prev => prev.map(msg => {
          const senderProfile = senderMap.get(msg.sender_id);
          let next = msg;
          if (senderProfile && !msg.sender) {
            next = { ...next, sender: { id: senderProfile.id, name: senderProfile.name, avatar_url: senderProfile.avatar_url } };
          }
          if (isSelfChatId(msg.sender_id, selfIds)) {
            next = { ...next, sender_id: selfIdentity.profileId || user.id };
          }
          return next;
        }));
      }
    } catch (error) {
      console.error('[Messages] Fetch error:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversationId, user]);


  // Load more (older messages)
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    fetchMessages(messages.length);
  }, [fetchMessages, messages.length, loadingMore, hasMore]);

  useEffect(() => {
    fetchMessages();

    if (!conversationId) return;

    // Migrado para realtimeBus — canal único compartilhado em `messages`.
    // Filtragem por conversation_id é feita no handler (substitui filter server-side).
    const unsubInsert = subscribeTable('messages', (payload: any) => {
      const newMsg = payload.new as Message;
      if (!newMsg || newMsg.conversation_id !== conversationId) return;
      if (blockedSenderIdsRef.current.has(newMsg.sender_id)) return;
      const fromSelfSync = isSelfChatId(newMsg.sender_id, selfIdsRef.current.length > 0 ? selfIdsRef.current : [user.id]);

      const provisional: Message = {
        ...newMsg,
        _status: 'delivered',
      } as Message;

      const applyToState = (msg: Message) => {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) {
            return sortMessagesByTimestamp(prev.map(m => m.id === msg.id
              ? { ...m, ...msg, _status: m._status === 'read' ? 'read' : (msg._status || 'delivered') }
              : m));
          }
          const optimisticIdx = prev.findIndex(m =>
            (m._tempId || m.id.startsWith('temp-')) &&
            m.sender_id === msg.sender_id &&
            m.content === msg.content &&
            Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 60_000
          );
          if (optimisticIdx >= 0) {
            const next = [...prev];
            next[optimisticIdx] = { ...msg, _tempId: prev[optimisticIdx]._tempId };
            return sortMessagesByTimestamp(next);
          }
          return sortMessagesByTimestamp([...prev, msg]);
        });
      };

      // 🚀 INSTANT: bolha + som SÍNCRONOS — sem esperar isChatBlockedWith.
      applyToState(provisional);
      if (!fromSelfSync) {
        playNewMessageSound(newMsg.id ? `message:${newMsg.id}` : undefined, conversationId);
      }

      // Bloqueio + enriquecimento de perfil em background.
      void (async () => {
        try {
          if (!fromSelfSync && await isChatBlockedWith(newMsg.sender_id)) {
            // Bloqueada após render: remove da lista.
            setMessages(prev => prev.filter(m => m.id !== newMsg.id));
            return;
          }
        } catch { /* mantém render se check falhar */ }

        try {
          const selfIdentity = await resolveChatIdentity(user.id);
          const fromSelf = isSelfChatId(newMsg.sender_id, selfIdsRef.current.length > 0 ? selfIdsRef.current : [user.id]);

          const profile = await resolveProfileByAnyId<{ id: string; name: string; avatar_url: string | null }>(
            newMsg.sender_id,
            'id, name, avatar_url',
          );

          const enriched: Message = {
            ...newMsg,
            sender: profile as { id: string; name: string; avatar_url: string | null } | undefined,
            sender_id: fromSelf ? (selfIdentity.profileId || user.id) : newMsg.sender_id,
            _status: 'delivered',
          };

          applyToState(enriched);
        } catch {
          /* render provisional já foi feito */
        }
      })();
    }, { events: ['INSERT'] });

    const unsubUpdate = subscribeTable('messages', (payload: any) => {
      const updated = payload.new as any;
      if (!updated || updated.conversation_id !== conversationId) return;
      setMessages(prev => sortMessagesByTimestamp(prev.map(msg =>
        msg.id === updated.id
          ? {
              ...msg,
              is_read: updated.is_read ?? msg.is_read,
              _status: updated.is_read ? 'read' : (msg._status === 'sending' ? 'delivered' : msg._status),
              deleted_for_everyone: updated.deleted_for_everyone,
              deleted_by: updated.deleted_by
            }
          : msg
      )));
    }, { events: ['UPDATE'] });

    const unsubDelete = subscribeTable('messages', (payload: any) => {
      const deleted = payload.old as any;
      if (!deleted) return;
      // conversation_id pode não vir em DELETE — filtra por id local.
      setMessages(prev => prev.filter(msg => msg.id !== deleted.id));
    }, { events: ['DELETE'] });

    // Canal compartilhado é estável — assume conectado.
    setConnectionStatus('connected');
    channelRef.current = null;

    // Visibility/focus: só refaz fetch se a aba ficou >30s oculta
    // (evita refetch desnecessário ao alternar abas no desktop, que
    // congela a UI por ~300ms enquanto o servidor responde).
    let lastHiddenAt = 0;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAt = Date.now();
        return;
      }
      if (document.visibilityState === 'visible' && lastHiddenAt && Date.now() - lastHiddenAt > 30_000) {
        lastHiddenAt = 0;
        void fetchMessages();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);


    // Safety-net polling reduzido — bus é estável, mas mantemos rede flaky em mobile.
    const pollInterval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (connectionStatusRef.current !== 'connected') {
        void fetchMessages();
      }
    }, 8000);

    return () => {
      unsubInsert();
      unsubUpdate();
      unsubDelete();
      channelRef.current = null;
      if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null; }
      document.removeEventListener('visibilitychange', onVisibility);
      // window 'focus' não é mais usado — visibilitychange já cobre o caso real
      clearInterval(pollInterval);
    };
  }, [conversationId, fetchMessages, isChatBlockedWith, user?.id]);

  // Optimistic send: inserts message locally + persists to DB.
  // Returns the temp id so caller can correlate.
  const sendOptimisticMessage = useCallback(async (
    content: string,
    mediaUrl?: string,
    mediaType?: string,
    receiverId?: string,
    options?: { tempId?: string; uploadProgress?: number; uploadLabel?: string; deferInsert?: boolean }
  ): Promise<{ error: Error | null; tempId?: string }> => {
    if (!conversationId || !user) return { error: new Error('Not authenticated') };
    const trimmed = trimMessageForType(content, mediaType);
    if (!trimmed && !mediaUrl) return { error: new Error('Empty message') };

    // 🚀 INSTANT UI: bolha aparece SINCRONAMENTE, antes de qualquer await.
    // Resoluções (identity/peer/block) acontecem em paralelo, em background.
    const tempId = options?.tempId || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticSenderId = user.id; // selfIds inclui user.id; basta para isSelfChatId
    const optimistic: Message = {
      id: tempId,
      _tempId: tempId,
      conversation_id: conversationId,
      sender_id: optimisticSenderId,
      content: trimmed,
      is_read: false,
      created_at: new Date().toISOString(),
      media_url: mediaUrl ?? null,
      media_type: mediaType ?? null,
      _status: 'sending',
      _uploadProgress: options?.uploadProgress,
      _uploadLabel: options?.uploadLabel,
    } as Message;
    // Append direto (mensagem otimista SEMPRE é a mais recente — evita
    // sort O(n log n) na lista inteira a cada envio em conversas grandes).
    setMessages(prev => [...prev, optimistic]);

    if (options?.deferInsert) {
      return { error: null, tempId };
    }

    // Identidade + peer em paralelo (cache hit em geral → ~0ms)
    const selfIdentity = await resolveChatIdentity(user.id);
    const senderId = selfIdentity.profileId || user.id;
    const resolvedReceiverId = receiverId || await resolveConversationPeerId(conversationId, selfIdentity.selfIds);
    if (await isChatBlockedWith(resolvedReceiverId)) {
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, _status: 'error' } : m));
      return { error: new Error('chat_blocked'), tempId };
    }
    if (senderId !== optimisticSenderId) {
      setMessages(prev => prev.map(m => m._tempId === tempId ? { ...m, sender_id: senderId } : m));
    }

    const hasChatBlock = false;

    try {
      const basePayload: any = {
        conversation_id: conversationId,
        sender_id: senderId,
        content: trimmed,
        ...(mediaUrl ? { media_url: mediaUrl } : {}),
        ...(mediaType ? { media_type: mediaType } : {}),
      };

      // Tenta com receiver_id (alguns esquemas externos exigem); se falhar, tenta sem.
      // Auto-retry com backoff curto (0ms → 600ms → 1500ms) para sobreviver a
      // perda transitória de rede/realtime sem precisar do botão "tentar de novo".
      const attemptInsert = async () => {
        let { data, error } = await supabase
          .from('messages')
          .insert(resolvedReceiverId ? { ...basePayload, receiver_id: resolvedReceiverId } : basePayload)
          .select('id, created_at')
          .single();
        if (error && /receiver_id/i.test(error.message || '') && resolvedReceiverId) {
          const retry = await supabase
            .from('messages')
            .insert(basePayload)
            .select('id, created_at')
            .single();
          data = retry.data;
          error = retry.error;
        }
        return { data, error };
      };

      let lastError: any = null;
      let data: any = null;
      const delays = [0, 600, 1500];
      for (let i = 0; i < delays.length; i++) {
        if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]));
        const res = await attemptInsert();
        if (!res.error && res.data) { data = res.data; lastError = null; break; }
        lastError = res.error;
        // Não retentar se for erro lógico (validação, rls, duplicate, etc).
        const msg = String(lastError?.message || '').toLowerCase();
        const isTransient = /network|fetch|timeout|temporar|connection|503|gateway|abort/i.test(msg) || !navigator.onLine;
        if (!isTransient) break;
      }
      if (lastError && !data) throw lastError;

      setMessages(prev => sortMessagesByTimestamp(prev.map(m =>
        m._tempId === tempId
          ? { ...m, id: data!.id, created_at: data!.created_at, _status: 'sent' }
          : m
      )));

      // Push notification para o destinatário (best-effort)
      if (!hasChatBlock && resolvedReceiverId && resolvedReceiverId !== senderId) {
        const preview = trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
        triggerPush({
          user_id: resolvedReceiverId,
          sender_id: senderId,
          title: 'Nova mensagem',
          body: preview || 'Você recebeu uma nova mensagem',
          url: `/messages?c=${conversationId}`,
          type: 'new_message',
          tag: `msg:${conversationId}`,
        });
      }
      try {
        const { progressAuraQuest } = await import('@/lib/auraQuests');
        void progressAuraQuest('send_3_dms', 1, { bypassLock: true, reason: 'mensagem enviada no chat' });
      } catch {}
      return { error: null, tempId };
    } catch (err: any) {
      console.error('[Messages] Optimistic send error:', err?.message || err, err);
      setMessages(prev => prev.map(m =>
        m._tempId === tempId ? { ...m, _status: 'error' } : m
      ));
      return { error: err instanceof Error ? err : new Error(err?.message || 'Falha ao enviar'), tempId };
    }

  }, [conversationId, user, isChatBlockedWith]);

  const updateOptimisticMessage = useCallback((tempId: string, patch: Partial<Message>) => {
    setMessages(prev => sortMessagesByTimestamp(prev.map(m =>
      m._tempId === tempId || m.id === tempId ? { ...m, ...patch } : m
    )));
  }, []);

  const removeOptimisticMessage = useCallback((tempId: string) => {
    setMessages(prev => prev.filter(m => m._tempId !== tempId && m.id !== tempId));
  }, []);

  const finalizeOptimisticMessage = useCallback(async (tempId: string, content: string, mediaUrl: string, mediaType?: string, receiverId?: string) => {
    if (!conversationId || !user) return { error: new Error('Not authenticated') };
    const selfIdentity = await resolveChatIdentity(user.id);
    const senderId = selfIdentity.profileId || user.id;
    const resolvedReceiverId = receiverId || await resolveConversationPeerId(conversationId, selfIdentity.selfIds);
    try {
      if (await isChatBlockedWith(resolvedReceiverId)) {
        throw new Error('chat_blocked');
      }
      const hasChatBlock = false;
      const payload: any = { conversation_id: conversationId, sender_id: senderId, content: trimMessageForType(content, mediaType), media_url: mediaUrl, media_type: mediaType };
      let { data, error } = await supabase.from('messages').insert(resolvedReceiverId ? { ...payload, receiver_id: resolvedReceiverId } : payload).select('id, created_at').single();
      if (error && /receiver_id/i.test(error.message || '') && resolvedReceiverId) {
        const retry = await supabase.from('messages').insert(payload).select('id, created_at').single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      setMessages(prev => sortMessagesByTimestamp(prev.map(m => m._tempId === tempId || m.id === tempId ? { ...m, id: data!.id, created_at: data!.created_at, media_url: mediaUrl, media_type: mediaType, _status: 'sent', _uploadProgress: undefined, _uploadLabel: undefined } : m)));
      if (!hasChatBlock && resolvedReceiverId && resolvedReceiverId !== senderId) {
        const label = mediaType?.startsWith('image') ? '📷 Foto' : mediaType?.startsWith('video') ? '🎥 Vídeo' : mediaType?.startsWith('audio') ? '🎙️ Áudio' : '📎 Anexo';
        triggerPush({
          user_id: resolvedReceiverId,
          sender_id: senderId,
          title: 'Nova mensagem',
          body: (content || '').trim() || label,
          url: `/messages?c=${conversationId}`,
          type: 'new_message',
          tag: `msg:${conversationId}`,
        });
      }
      try {
        const { progressAuraQuest } = await import('@/lib/auraQuests');
        void progressAuraQuest('send_3_dms', 1, { bypassLock: true, reason: 'mensagem enviada no chat' });
      } catch {}
      return { error: null };
    } catch (err: any) {
      setMessages(prev => prev.map(m => m._tempId === tempId || m.id === tempId ? { ...m, _status: 'error', _uploadLabel: 'Falha no envio' } : m));
      return { error: err instanceof Error ? err : new Error(err?.message || 'Falha ao enviar') };
    }
  }, [conversationId, user, isChatBlockedWith]);


  // Delete one or more messages for me or for everyone
  const deleteMessages = useCallback(async (messageIds: string[], forEveryone: boolean): Promise<{ error: Error | null }> => {
    if (!user) return { error: new Error('Not authenticated') };
    const ids = [...new Set(messageIds)].filter(Boolean);
    if (ids.length === 0) return { error: null };

    try {
      const selfIdentity = await resolveChatIdentity(user.id);
      const selfIds = selfIdentity.selfIds.length > 0 ? selfIdentity.selfIds : [user.id];

      if (forEveryone) {
        const targetMessages = messages.filter(m => ids.includes(m.id) && isSelfChatId(m.sender_id, selfIds));
        const ownIds = targetMessages.map(m => m.id);
        if (ownIds.length === 0) throw new Error('Nenhuma mensagem enviada por você foi selecionada');

        const { error } = await supabase
          .from('messages')
          .update({ deleted_for_everyone: true } as any)
          .in('id', ownIds)
          .in('sender_id', selfIds);

        if (error) throw error;

        for (const msg of targetMessages) {
          if (!msg?.media_url) continue;
          try {
            const url = new URL(msg.media_url);
            const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/chat-media\/(.+)/);
            if (pathMatch?.[1]) {
              await supabase.storage.from('chat-media').remove([decodeURIComponent(pathMatch[1])]);
            }
          } catch (e) {
            console.warn('[Messages] Failed to remove media file:', e);
          }
        }
        
        setMessages(prev => prev.map(msg =>
          ownIds.includes(msg.id) ? { ...msg, deleted_for_everyone: true, media_url: null, content: '' } : msg
        ));
      } else {
        const updates = ids.map((id) => {
          const msg = messages.find(m => m.id === id);
          const currentDeletedBy = msg?.deleted_by || [];
          const newDeletedBy = currentDeletedBy.includes(user.id) ? currentDeletedBy : [...currentDeletedBy, user.id];
          return supabase
            .from('messages')
            .update({ deleted_by: newDeletedBy } as any)
            .eq('id', id);
        });

        const results = await Promise.all(updates);
        const failed = results.find(result => result.error);
        if (failed?.error) throw failed.error;

        setMessages(prev => prev.map(msg =>
          ids.includes(msg.id)
            ? { ...msg, deleted_by: [...new Set([...(msg.deleted_by || []), user.id])], media_url: null, content: '' }
            : msg
        ));
      }

      toast.success(forEveryone ? `${ids.length} mensagem(ns) apagada(s) para todos` : `${ids.length} mensagem(ns) apagada(s) para mim`);
      return { error: null };
    } catch (error) {
      console.error('[Messages] Delete error:', error);
      toast.error(forEveryone ? 'Erro ao apagar para todos' : 'Erro ao apagar para mim');
      return { error: error instanceof Error ? error : new Error('Erro ao apagar mensagem') };
    }
  }, [user, messages]);

  const deleteMessage = useCallback((messageId: string, forEveryone: boolean) => {
    return deleteMessages([messageId], forEveryone);
  }, [deleteMessages]);

  // Bloqueio bidirecional client-side: esconde mensagens cujo remetente
  // foi bloqueado por mim. Garante efeito imediato (independente da RLS).
  const blockedSenderIds = useMemo(() => {
    const set = new Set<string>();
    (blockedList || []).forEach((b) => {
      if (b.block_type !== 'blocked') return;
      if (b.blocked_user_id) set.add(b.blocked_user_id);
      if (b.blocked_user?.user_id) set.add(b.blocked_user.user_id);
    });
    return set;
  }, [blockedList]);

  useEffect(() => {
    blockedSenderIdsRef.current = blockedSenderIds;
  }, [blockedSenderIds]);


  const visibleMessages = useMemo(() => {
    if (blockedSenderIds.size === 0) return messages;
    return messages.filter((m) => !blockedSenderIds.has(m.sender_id));
  }, [messages, blockedSenderIds]);

  return { messages: visibleMessages, loading, loadingMore, hasMore, loadMore, connectionStatus, refetch: fetchMessages, deleteMessage, deleteMessages, sendOptimisticMessage, updateOptimisticMessage, removeOptimisticMessage, finalizeOptimisticMessage };
}
