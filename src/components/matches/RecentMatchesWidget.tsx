import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Flame, ChevronRight, Crown, Sparkles, MessageCircle, Heart, UserX } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { getPublicHandle, getHandleInitial } from '@/lib/userHandle';
import { useMatches } from '@/hooks/useMatches';
import { usePairMatches, useUndoPairMatch } from '@/hooks/usePairMatches';
import { useChat } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useMemo } from 'react';


// Unified match shape for the widget
interface WidgetMatch {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  distanceKm: number | null;
  isPremium: boolean;
  isSuperMatch: boolean;
  isLookingNow: boolean;
  otherUserId: string;
  profileId: string; // profile table id for undo
  source: 'looking_now' | 'perfect_pair';
}

// Privacidade: nunca exibir o nome real. Sempre @username (helper central).
function displayHandle(m: { username: string | null; name?: string; profileId: string }) {
  return getPublicHandle({ username: m.username, name: m.name }, `user_${(m.profileId || '').slice(0, 6)}`);
}

export function RecentMatchesWidget() {
  const navigate = useNavigate();
  const { activeMatches, loading: loadingLookingNow } = useMatches();
  const isMasterAdmin = useIsMasterAdmin();
  // Perfect Pair só é exibido para o master admin.
  const { data: pairMatches, isLoading: loadingPair } = usePairMatches();

  const { getOrCreateConversation } = useChat();
  const { user } = useAuth();
  const undoMatch = useUndoPairMatch();

  const [undoTarget, setUndoTarget] = useState<WidgetMatch | null>(null);

  const loading = loadingLookingNow || (isMasterAdmin && loadingPair);


  // Merge both match sources into a single unified list
  const allMatches = useMemo<WidgetMatch[]>(() => {
    const result: WidgetMatch[] = [];

    // 1. Looking Now matches
    (activeMatches || []).forEach(m => {
      result.push({
        id: `ln_${m.id}`,
        name: m.other_user.name,
        username: (m.other_user as any).username ?? null,
        avatarUrl: m.other_user.avatar_url,
        distanceKm: m.distance_km,
        isPremium: m.other_user.plan_type !== 'free',
        isSuperMatch: m.is_super_match,
        isLookingNow: m.other_user.is_looking_now,
        otherUserId: m.other_user.id,
        profileId: m.other_user.id,
        source: 'looking_now',
      });
    });

    // 2. Perfect Pair matches — apenas para master admin (oculto para demais usuários).
    if (isMasterAdmin) {
      const existingUserIds = new Set(result.map(r => r.otherUserId));

      (pairMatches || []).forEach(m => {
        if (!existingUserIds.has(m.userId)) {
          existingUserIds.add(m.userId);
          result.push({
            id: `pp_${m.profileId}`,
            name: m.name,
            username: (m as any).username ?? null,
            avatarUrl: m.avatarUrl,
            distanceKm: null,
            isPremium: m.planType !== 'free',
            isSuperMatch: false,
            isLookingNow: false,
            otherUserId: m.userId,
            profileId: m.profileId,
            source: 'perfect_pair',
          });
        }
      });
    }


    // Sort: super matches first, then looking now
    return result.sort((a, b) => {
      if (a.isSuperMatch && !b.isSuperMatch) return -1;
      if (!a.isSuperMatch && b.isSuperMatch) return 1;
      if (a.source === 'looking_now' && b.source !== 'looking_now') return -1;
      if (a.source !== 'looking_now' && b.source === 'looking_now') return 1;
      return 0;
    });
  }, [activeMatches, pairMatches, isMasterAdmin]);

  const recentMatches = allMatches.slice(0, 3);
  const totalCount = allMatches.length;

  if (loading || totalCount === 0) return null;

  const handleChatClick = async (match: WidgetMatch) => {
    if (!user) return;
    try {
      const { conversation } = await getOrCreateConversation(match.otherUserId);
      if (conversation?.id) {
        navigate(`/messages?conversation=${conversation.id}`);
      }
    } catch (error) {
      console.error('Erro ao iniciar chat:', error);
    }
  };

  const handleConfirmUndo = () => {
    if (!undoTarget) return;
    undoMatch.mutate(undoTarget.profileId);
    setUndoTarget(null);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-4 mb-4 p-4 rounded-xl bg-card/50 border border-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-full bg-orange-500/20">
              <Flame className="h-4 w-4 text-orange-500" />
            </div>
            <h3 className="font-semibold text-foreground">Matches Ativos</h3>
            <Badge variant="secondary" className="bg-orange-500/20 text-orange-400 border-none text-xs">
              {totalCount}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/matches')}
            className="text-muted-foreground hover:text-foreground gap-1 text-sm"
          >
            Ver todos
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Matches Grid */}
        <div className="flex items-center gap-4">
          {recentMatches.map((match, index) => (
            <motion.div
              key={match.id}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="flex flex-col items-center gap-2 group"
            >
              {/* Avatar — opens profile */}
              <div
                className="relative cursor-pointer"
                onClick={() => navigate(`/creator/${match.profileId}`)}
              >
                <Avatar
                  className={cn(
                    "h-16 w-16 ring-2 transition-all group-hover:scale-105",
                    match.isSuperMatch
                      ? "ring-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                      : match.isLookingNow
                        ? "ring-orange-500/60"
                        : match.source === 'perfect_pair'
                          ? "ring-pink-500/60"
                          : "ring-yellow-400/40"
                  )}
                >
                  <AvatarImage src={match.avatarUrl || undefined} alt={displayHandle(match)} />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg">
                    {getHandleInitial({ username: match.username, name: match.name })}
                  </AvatarFallback>
                </Avatar>

                {/* Super Match Crown */}
                {match.isSuperMatch && (
                  <div className="absolute -top-2 -right-2 p-1 rounded-full bg-gradient-to-r from-yellow-500 to-amber-400 shadow-lg">
                    <Crown className="h-3 w-3 text-black" />
                  </div>
                )}

                {/* Looking Now indicator */}
                {match.isLookingNow && !match.isSuperMatch && (
                  <div className="absolute -top-1 -right-1 p-1 rounded-full bg-orange-500 animate-pulse">
                    <Flame className="h-3 w-3 text-white" />
                  </div>
                )}

                {/* Perfect Pair heart indicator */}
                {match.source === 'perfect_pair' && !match.isSuperMatch && !match.isLookingNow && (
                  <div className="absolute -top-1 -right-1 p-1 rounded-full bg-pink-500">
                    <Heart className="h-3 w-3 text-white fill-white" />
                  </div>
                )}
              </div>

              {/* Action buttons row */}
              <div className="flex items-center gap-1">
                <button
                  className="p-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChatClick(match);
                  }}
                  aria-label="Chat"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-primary" />
                </button>
                <button
                  className="p-1.5 rounded-full bg-destructive/10 hover:bg-destructive/20 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUndoTarget(match);
                  }}
                  aria-label="Desfazer match"
                >
                  <UserX className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>

              {/* Handle (sempre @username — nunca o nome real) & Distance */}
              <div className="text-center -mt-1">
                <p className="text-sm font-medium text-foreground truncate max-w-[88px]">
                  {displayHandle(match)}
                </p>
                {match.distanceKm == null ? (
                  isMasterAdmin
                    ? <p className="text-xs text-pink-400">Perfect Pair</p>
                    : <p className="text-xs text-muted-foreground">Match</p>
                ) : match.distanceKm <= 0 ? (
                  <p className="text-xs text-muted-foreground">Perto</p>
                ) : match.distanceKm < 1 ? (
                  <p className="text-xs text-muted-foreground">&lt;1 km</p>
                ) : (
                  <p className="text-xs text-muted-foreground">{Math.round(match.distanceKm)} km</p>
                )}

              </div>

              {/* Badge */}
              {match.isSuperMatch && (
                <Badge className="bg-gradient-to-r from-yellow-500 via-amber-400 to-orange-500 text-black text-[10px] px-1.5 py-0 border-none font-semibold">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                  VIP
                </Badge>
              )}
            </motion.div>
          ))}

          {/* View More Button */}
          {totalCount > 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              onClick={() => navigate('/matches')}
              className="flex flex-col items-center gap-2 cursor-pointer group"
            >
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center border border-border/50 group-hover:border-primary/50 transition-colors">
                <span className="text-sm font-semibold text-muted-foreground group-hover:text-foreground">
                  +{totalCount - 3}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">mais</p>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Undo Match Confirmation */}
      <AlertDialog open={!!undoTarget} onOpenChange={(v) => !v && setUndoTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer match?</AlertDialogTitle>
            <AlertDialogDescription>
              Você removerá {undoTarget ? displayHandle(undoTarget) : 'este usuário'} dos seus matches ativos. Para reconectar, será necessário um novo match entre ambos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={handleConfirmUndo}
            >
              Desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
