/**
 * PairMatchesList — Lista de matches mútuos do Perfect Pair
 * Layout de linhas com ações rápidas: Chat VIP, Bloquear, Excluir
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart, MessageCircle, Loader2, RefreshCw,
  Shield, Trash2, MoreHorizontal, Crown, MapPin, Clock, User
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { usePairMatches, useUndoPairMatch, useBlockPairMatch, type PairMatchRecord } from '@/hooks/usePairMatches';
import { PerfectPairMatchModal } from '@/components/perfect-pair/PerfectPairMatchModal';
import { useProfile } from '@/hooks/useProfile';
import { getOrCreateConversationId } from '@/lib/conversationsApi';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function PairMatchesList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: matches, isLoading, refetch } = usePairMatches();
  const undoMatch = useUndoPairMatch();
  const blockMatch = useBlockPairMatch();
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'block';
    profileId: string;
    userId: string;
    name: string;
  } | null>(null);
  const [loadingChat, setLoadingChat] = useState<string | null>(null);
  const [celebrationMatch, setCelebrationMatch] = useState<PairMatchRecord | null>(null);
  const seenMatchIdsRef = useRef<Set<string> | null>(null);

  // Detecta novos matches e dispara celebração visual
  useEffect(() => {
    if (!matches) return;
    const currentIds = new Set(matches.map((m) => m.profileId));

    // Primeiro carregamento — apenas registra os IDs sem celebrar
    if (seenMatchIdsRef.current === null) {
      seenMatchIdsRef.current = currentIds;
      return;
    }

    // Procura match recém-adicionado
    const newest = matches.find((m) => !seenMatchIdsRef.current!.has(m.profileId));
    if (newest) {
      setCelebrationMatch(newest);
    }
    seenMatchIdsRef.current = currentIds;
  }, [matches]);

  // Abre (ou cria) a conversa e navega para o chat
  const handleChatVip = async (m: { userId: string; profileId: string; name: string }) => {
    if (!user?.id) {
      toast.error('Sessão expirada. Faça login novamente.');
      return;
    }
    if (!m.userId) {
      toast.error('Não foi possível identificar o usuário do match.');
      console.error('[PairMatchesList] Match sem userId (auth uid):', m);
      return;
    }
    setLoadingChat(m.profileId);
    try {
      const { id: conversationId, error } = await getOrCreateConversationId(user.id, m.userId);
      if (error || !conversationId) {
        console.error('[PairMatchesList] get_or_create_conversation falhou:', error);
        throw new Error(error?.message || 'Falha ao criar conversa');
      }
      navigate('/messages', { state: { openConversationId: conversationId } });
    } catch (e: any) {
      console.error('[PairMatchesList] Erro Chat VIP:', e);
      toast.error(`Erro ao abrir conversa: ${e?.message || 'Tente novamente.'}`);
    } finally {
      setLoadingChat(null);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, profileId, userId } = confirmAction;
    if (type === 'delete') {
      await undoMatch.mutateAsync(profileId);
    } else if (type === 'block') {
      await blockMatch.mutateAsync({ profileId, blockedUserId: userId });
    }
    setConfirmAction(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!matches || matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Heart className="h-8 w-8 text-primary/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Nenhum match ainda</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Continue curtindo perfis para encontrar seus pares perfeitos!
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[480px] mx-auto px-3 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" fill="currentColor" />
          <span className="text-sm font-semibold text-foreground">
            {matches.length} match{matches.length !== 1 ? 'es' : ''}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>

      {/* Match Rows */}
      <AnimatePresence>
        {matches.map((m) => {
          const isSuperMatch = m.planType === 'vip';
          const timeAgo = formatDistanceToNow(new Date(m.matchedAt), {
            locale: ptBR,
            addSuffix: true,
          });

          return (
            <motion.div
              key={m.profileId}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "relative flex items-center gap-3 p-3 rounded-2xl border transition-colors",
                isSuperMatch
                  ? "bg-gradient-to-r from-[hsl(45,93%,47%)]/8 to-card border-[hsl(45,93%,47%)]/40"
                  : "bg-card border-border/50 hover:border-border"
              )}
            >
              {/* VIP glow ring */}
              {isSuperMatch && (
                <div className="absolute inset-0 rounded-2xl ring-1 ring-[hsl(45,93%,47%)]/30 pointer-events-none" />
              )}

              {/* Avatar — clica para abrir perfil completo */}
              <button
                className="shrink-0 relative"
                onClick={() => navigate(`/creator/${m.profileId}`)}
                title={`Ver perfil de @${m.username || 'misterioso'}`}
              >
                <Avatar className={cn(
                  "h-14 w-14 border-2",
                  isSuperMatch ? "border-[hsl(45,93%,47%)]" : "border-border"
                )}>
                  <AvatarImage src={m.avatarUrl || undefined} alt={m.username ? `@${m.username}` : 'misterioso'} className="object-cover" />
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {(m.username || 'U')[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                {isSuperMatch && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[hsl(45,93%,47%)] flex items-center justify-center border-2 border-card">
                    <Crown className="h-2.5 w-2.5 text-[hsl(0,0%,5%)]" />
                  </div>
                )}
              </button>

              {/* Info — clica para abrir perfil */}
              <button
                className="flex-1 min-w-0 text-left"
                onClick={() => navigate(`/creator/${m.profileId}`)}
              >
                {/* Name row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm text-foreground truncate">
                    {m.username ? `@${m.username}` : 'MISTERIOSO(A)'}
                  </span>
                  {isSuperMatch && (
                    <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/40 text-[9px] px-1.5 py-0 font-bold shrink-0">
                      <Crown className="h-2.5 w-2.5 mr-0.5" />
                      Super Match
                    </Badge>
                  )}
                </div>

                {/* Username */}
                {m.username && (
                  <p className="text-xs text-muted-foreground truncate">@{m.username}</p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo}
                  </span>
                  {m.sharedTags.length > 0 && (
                    <span className="flex items-center gap-0.5 text-primary/70">
                      <Heart className="h-2.5 w-2.5" fill="currentColor" />
                      {m.sharedTags.length} int. em comum
                    </span>
                  )}
                </div>

                {/* Shared tags pills */}
                {m.sharedTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.sharedTags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80 border border-primary/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Chat VIP Button */}
                <Button
                  size="sm"
                  onClick={() => handleChatVip(m)}
                  disabled={loadingChat === m.profileId}
                  className={cn(
                    "h-9 px-3 gap-1.5 font-bold text-xs rounded-xl shrink-0",
                    isSuperMatch
                      ? "bg-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,40%)] text-[hsl(0,0%,5%)]"
                      : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  )}
                >
                  {loadingChat === m.profileId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Chat VIP</span>
                </Button>

                {/* More options */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-9 w-9 rounded-xl hover:bg-muted shrink-0"
                     aria-label="Mais opções">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-50 w-44">
                    <DropdownMenuItem
                      onClick={() => navigate(`/creator/${m.profileId}`)}
                      className="gap-2"
                    >
                      <User className="h-4 w-4" />
                      Ver perfil
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setConfirmAction({ type: 'block', profileId: m.profileId, userId: m.userId, name: m.username ? `@${m.username}` : 'misterioso' })}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Shield className="h-4 w-4" />
                      Bloquear
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setConfirmAction({ type: 'delete', profileId: m.profileId, userId: m.userId, name: m.username ? `@${m.username}` : 'misterioso' })}
                      className="gap-2 text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir match
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Confirm Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'block' ? 'Bloquear usuário?' : 'Excluir match?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'block'
                ? `Você bloqueará ${confirmAction?.name} e removerá o match. Essa ação não pode ser desfeita.`
                : `Você removerá ${confirmAction?.name} dos seus matches. Será necessário curtir novamente para fazer match.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirmAction?.type === 'block' ? 'Bloquear' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Celebração visual ao receber novo match */}
      <PerfectPairMatchModal
        match={
          celebrationMatch
            ? {
                pairUserId: celebrationMatch.profileId,
                pairUserAuthId: celebrationMatch.userId,
                userName: celebrationMatch.name,
                pairUserAvatar: celebrationMatch.avatarUrl,
              }
            : null
        }
        currentUserAvatar={profile?.avatar_url}
        currentUserName={profile?.name}
        onDismiss={() => setCelebrationMatch(null)}
      />
    </div>
  );
}
