/**
 * ShareToChatModal — Etapa 56 (Play → Chat / DM).
 *
 * Responsivo, scroll invisível, mostra todas as últimas conversas do usuário
 * logado e permite enviar para qualquer @ pelo input.
 *
 * Antes vivia dentro de PlayShareMenu.tsx — extraído para que o
 * SharePlayItemModal (focus modal) também possa reaproveitar.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Send, MessageCircle, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { getOrCreateConversationId } from '@/lib/conversationsApi';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';

interface Peer {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  itemId: string;
  url: string;
  title?: string | null;
  author?: string | null;
  /** Quando aberto sobre o focus modal, sobe o z-index. */
  abovePlayer?: boolean;
}

export function ShareToChatModal({
  open, onClose, itemId: _itemId, url, title, author, abovePlayer,
}: Props) {
  void _itemId;
  const { user } = useAuth();
  const [handle, setHandle] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [recent, setRecent] = useState<Peer[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Carrega TODAS as conversas recentes do usuário logado
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      setLoadingRecent(true);
      try {
        const { data: parts } = await (supabase as any)
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id)
          .limit(200);
        const convIds = Array.from(new Set((parts || []).map((p: any) => p.conversation_id)));
        if (convIds.length === 0) { if (!cancelled) setRecent([]); return; }

        const { data: peers } = await (supabase as any)
          .from('conversation_participants')
          .select('user_id, conversation_id')
          .in('conversation_id', convIds)
          .neq('user_id', user.id);

        const peerIds = Array.from(new Set((peers || []).map((p: any) => p.user_id)));
        if (peerIds.length === 0) { if (!cancelled) setRecent([]); return; }

        const { data: profs } = await (supabase as any)
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', peerIds);
        if (!cancelled) setRecent(((profs || []) as Peer[]));
      } catch {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, user?.id]);

  const sendTo = async (peerId: string) => {
    if (!user) return;
    setSending(true);
    try {
      const { id: conversationId, error: convErr } = await getOrCreateConversationId(user.id, peerId);
      if (convErr || !conversationId) throw convErr || new Error('Falha ao abrir conversa');

      const content = [
        note?.trim(),
        '🎬 OCULTO PLAY',
        title ? `“${title}”${author ? ` — @${author}` : ''}` : null,
        url,
      ].filter(Boolean).join('\n');

      const payload: any = {
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        receiver_id: peerId,
        media_url: null,
        media_type: 'play_item',
      };
      let { error } = await (supabase as any).from('messages').insert(payload);
      if (error && /receiver_id|media_type/i.test(error.message || '')) {
        const retry = await (supabase as any).from('messages').insert({
          conversation_id: conversationId, sender_id: user.id, content,
        });
        error = retry.error;
      }
      if (error) throw error;
      toast.success('Enviado!');
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar');
    } finally {
      setSending(false);
    }
  };

  const sendByHandle = async () => {
    const clean = handle.trim().replace(/^@/, '');
    if (!clean) { toast.error('Informe o @ do usuário'); return; }
    const { data: prof } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('username', clean)
      .maybeSingle();
    if (!prof?.id) { toast.error('Usuário não encontrado'); return; }
    await sendTo(prof.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="w-[95vw] max-w-md p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden"
        overlayClassName={abovePlayer ? '!z-[2147482099]' : undefined}
        style={abovePlayer ? { zIndex: 2147482100 } : undefined}
      >
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4 text-fuchsia-300" /> Enviar no Chat
          </DialogTitle>
        </DialogHeader>

        {/* Conteúdo rolável (scroll invisível) */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 pb-3 space-y-3 [-ms-overflow-style:none] [scrollbar-width:none]
                     [&::-webkit-scrollbar]:hidden"
        >
          <div>
            <Label className="text-xs">Mensagem (opcional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 240))}
              placeholder="Escreva algo junto do item…"
              className="mt-1 text-sm resize-none"
              rows={2}
            />
          </div>

          <div>
            <Label className="text-xs">Conversas recentes</Label>
            {loadingRecent ? (
              <div className="py-6 grid place-items-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : recent.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                Sem conversas recentes. Envie pelo @ abaixo.
              </p>
            ) : (
              <div
                className="mt-1 grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1
                           [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {recent.map((p) => {
                  const label = p.username || p.display_name || '—';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={sending}
                      onClick={() => sendTo(p.id)}
                      className="flex flex-col items-center gap-1 p-2 rounded-lg border border-border/40 hover:border-fuchsia-400/60 disabled:opacity-50 text-center min-w-0"
                    >
                      {p.avatar_url ? (
                        <img src={buildSupabaseImageThumb(p.avatar_url, { width: 80, quality: 70 }) ?? p.avatar_url} alt="" loading="lazy" decoding="async"
                             className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-muted grid place-items-center text-xs">
                          {(label || '?').slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span className="text-[10px] leading-tight break-all w-full line-clamp-2">
                        @{label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Ou enviar para um @</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder="@usuario"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="text-sm flex-1 min-w-0"
              />
              <Button onClick={sendByHandle} disabled={sending} size="sm" className="shrink-0">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border/60 shrink-0 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
