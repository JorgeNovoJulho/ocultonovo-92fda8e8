import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isChatSoundMuted,
  setChatSoundMuted,
  playTestSound,
  isConversationMuted,
  setConversationMuted,
  getConversationMuteStorageKey,
} from '@/lib/messageSound';
import { toast } from 'sonner';

/**
 * Botão compacto de aviso sonoro de mensagens.
 *
 * - Sem `conversationId`: alterna mute GLOBAL do dispositivo.
 * - Com `conversationId`: alterna mute APENAS daquela conversa neste dispositivo.
 *   (continua respeitando o mute global se este estiver ativo).
 *
 * Interações:
 * - Clique: alterna mute/unmute (toca som ao reativar quando global).
 * - Shift+clique ou duplo-clique: apenas testa o som.
 */
export function ChatSoundIconButton({
  className = '',
  conversationId,
}: {
  className?: string;
  conversationId?: string;
}) {
  const isPerConversation = !!conversationId;

  const readMuted = () =>
    isPerConversation
      ? isConversationMuted(conversationId)
      : isChatSoundMuted();

  const [muted, setMuted] = useState<boolean>(() => readMuted());
  const clickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setMuted(readMuted());
    const watchKey = isPerConversation
      ? getConversationMuteStorageKey(conversationId!)
      : 'oculto.chat.mute';

    const onStorage = (e: StorageEvent) => {
      if (e.key === watchKey) setMuted(readMuted());
    };
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent).detail as { conversationId?: string } | undefined;
      if (!isPerConversation || !detail || detail.conversationId === conversationId) {
        setMuted(readMuted());
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('oculto:chat-mute-changed', onLocal as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('oculto:chat-mute-changed', onLocal as EventListener);
      if (clickTimeoutRef.current) window.clearTimeout(clickTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, isPerConversation]);

  const toggleMutedState = () => {
    const next = !muted;
    setMuted(next);
    if (isPerConversation) {
      setConversationMuted(conversationId!, next);
      if (next) {
        toast.message('Conversa silenciada neste dispositivo');
      } else {
        toast.success('Avisos desta conversa reativados');
        if (!isChatSoundMuted()) playTestSound();
      }
    } else {
      setChatSoundMuted(next);
      if (next) {
        toast.message('Aviso sonoro silenciado neste dispositivo');
      } else {
        toast.success('Aviso sonoro ativado');
        playTestSound();
      }
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) { playTestSound(); return; }
    if (clickTimeoutRef.current) window.clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = window.setTimeout(() => {
      toggleMutedState();
      clickTimeoutRef.current = null;
    }, 220);
  };

  const handleDoubleClick = () => {
    if (clickTimeoutRef.current) {
      window.clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    playTestSound();
  };

  const titleOn = isPerConversation
    ? 'Avisos desta conversa ativos — clique para silenciar (duplo-clique testa)'
    : 'Aviso sonoro ativado neste dispositivo — clique para silenciar (duplo-clique testa)';
  const titleOff = isPerConversation
    ? 'Conversa silenciada neste dispositivo — clique para reativar'
    : 'Aviso sonoro silenciado neste dispositivo — clique para ativar';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-9 w-9 ${className}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      title={muted ? titleOff : titleOn}
      aria-label={muted
        ? (isPerConversation ? 'Reativar avisos desta conversa' : 'Ativar aviso sonoro')
        : (isPerConversation ? 'Silenciar avisos desta conversa' : 'Silenciar aviso sonoro')}
      aria-pressed={!muted}
    >
      {muted
        ? <BellOff className="h-4 w-4 text-muted-foreground" />
        : <Bell className={`h-4 w-4 ${isPerConversation ? 'text-primary' : 'text-primary'}`} />}
    </Button>
  );
}

export default ChatSoundIconButton;
