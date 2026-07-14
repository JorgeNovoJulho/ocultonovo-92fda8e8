import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, Ban, Bell, BellOff, Clock, Flag, Gift, MoreVertical, Trash2 } from 'lucide-react';
import {
  isChatSoundMuted,
  setChatSoundMuted,
  isConversationMuted,
  setConversationMuted,
  getConversationMuteStorageKey,
  playTestSound,
} from '@/lib/messageSound';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ChatHeaderMenuProps {
  conversationId: string;
  profileId: string;
  userName: string;
  onReport: () => void;
  onArchive: () => void;
  onBlock: () => void;
  onClearConversation: () => void;
  onDeleteConversation: () => void;
  onSendGift?: () => void;
  timestampMode?: 'time' | 'datetime';
  onToggleTimestamp?: () => void;
  /** True quando o usuário atual já bloqueou o outro — vira "Desbloquear". */
  isBlockedByMe?: boolean;
}

export function ChatHeaderMenu({ conversationId, profileId, userName, onReport, onArchive, onBlock, onClearConversation, onDeleteConversation, onSendGift, timestampMode = 'datetime', onToggleTimestamp, isBlockedByMe = false }: ChatHeaderMenuProps) {
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [globalMuted, setGlobalMuted] = useState<boolean>(() => isChatSoundMuted());
  const [convMuted, setConvMuted] = useState<boolean>(() => isConversationMuted(conversationId));
  const navigate = useNavigate();

  useEffect(() => {
    setConvMuted(isConversationMuted(conversationId));
    const convKey = getConversationMuteStorageKey(conversationId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'oculto.chat.mute') setGlobalMuted(isChatSoundMuted());
      if (e.key === convKey) setConvMuted(isConversationMuted(conversationId));
    };
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent).detail as { conversationId?: string } | undefined;
      setGlobalMuted(isChatSoundMuted());
      if (!detail || detail.conversationId === conversationId) {
        setConvMuted(isConversationMuted(conversationId));
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('oculto:chat-mute-changed', onLocal as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('oculto:chat-mute-changed', onLocal as EventListener);
    };
  }, [conversationId]);

  const toggleConvMute = () => {
    const next = !convMuted;
    setConvMuted(next);
    setConversationMuted(conversationId, next);
    if (next) {
      toast.message('Conversa silenciada neste dispositivo');
    } else {
      toast.success('Avisos desta conversa reativados');
      if (!isChatSoundMuted()) playTestSound();
    }
  };

  const toggleGlobalMute = () => {
    const next = !globalMuted;
    setGlobalMuted(next);
    setChatSoundMuted(next);
    if (next) {
      toast.message('Som de todas as conversas silenciado neste dispositivo');
    } else {
      toast.success('Som das conversas reativado');
      playTestSound();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="min-h-[2.75rem] min-w-[2.75rem]" aria-label="Mais opções">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 z-50 bg-popover">
          <DropdownMenuItem onClick={() => navigate(`/creator/${profileId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2 rotate-180" />
            Ver Perfil
          </DropdownMenuItem>
          {onSendGift && (
            <DropdownMenuItem onClick={onSendGift} className="text-amber-400 focus:text-amber-300">
              <Gift className="h-4 w-4 mr-2" />
              Enviar Presente
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="h-4 w-4 mr-2" />
            Arquivar conversa
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowClearDialog(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar conversa
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={toggleConvMute}>
            {convMuted ? <BellOff className="h-4 w-4 mr-2 text-muted-foreground" /> : <Bell className="h-4 w-4 mr-2 text-primary" />}
            {convMuted ? 'Reativar som desta conversa' : 'Silenciar esta conversa'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleGlobalMute}>
            {globalMuted ? <BellOff className="h-4 w-4 mr-2 text-muted-foreground" /> : <Bell className="h-4 w-4 mr-2" />}
            {globalMuted ? 'Reativar som de todas as conversas' : 'Silenciar todas as conversas'}
          </DropdownMenuItem>
          {onToggleTimestamp && (
            <DropdownMenuItem onClick={onToggleTimestamp}>
              <Clock className="h-4 w-4 mr-2" />
              {timestampMode === 'time' ? 'Mostrar data + hora' : 'Mostrar só hora'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              if (isBlockedByMe) {
                // Desbloqueio é instantâneo (sem confirmação)
                onBlock();
              } else {
                setShowBlockDialog(true);
              }
            }}
            className={isBlockedByMe ? 'text-emerald-500 focus:text-emerald-400' : 'text-destructive focus:text-destructive'}
          >
            <Ban className="h-4 w-4 mr-2" />
            {isBlockedByMe ? 'Desbloquear usuário' : 'Bloquear usuário'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onReport} className="text-destructive focus:text-destructive">
            <Flag className="h-4 w-4 mr-2" />
            Denunciar usuário
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir conversa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear {userName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vocês não poderão mais trocar mensagens. Você pode desbloquear a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onBlock(); setShowBlockDialog(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens enviadas e recebidas serão apagadas para você e para {userName}. A conversa permanecerá aberta. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onClearConversation(); setShowClearDialog(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Limpar para ambos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá a conversa e todas as mídias enviadas para ambos os lados. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDeleteConversation(); setShowDeleteDialog(false); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir para todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
