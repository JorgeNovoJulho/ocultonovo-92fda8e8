import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Sparkles, Radar, History, Loader2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDiscoveryMatches } from '@/hooks/useDiscoveryMatches';
import { useRadarMatches } from '@/hooks/useRadarMatches';
import { useViewedMatches } from '@/hooks/useViewedMatches';
import { MatchCard } from '@/components/matches/MatchCard';
import { MatchFilters } from '@/components/matches/MatchFilters';
import { SuperMatchCelebration } from '@/components/matches/SuperMatchCelebration';
import { useMatchFilters } from '@/hooks/useMatchFilters';
import { useChat } from '@/hooks/useChat';
import { toast } from '@/hooks/use-toast';

export default function MatchesPage() {
  const navigate = useNavigate();
  const { activeMatches, expiredMatches, loading } = useDiscoveryMatches();
  const { matches: radarMatches, loading: loadingRadar } = useRadarMatches();
  const { markAllViewed } = useViewedMatches(activeMatches.map(m => m.id));
  const { getOrCreateConversation } = useChat();
  const { filters, setFilters, filterMatches, hasActiveFilters } = useMatchFilters();
  const [startingChat, setStartingChat] = useState<string | null>(null);

  // markChatStarted não existe mais nesse fluxo (Explorar misteriosos),
  // mantemos noop local para preservar a UX após abrir conversa.
  const markChatStarted = (_id: string) => {};


  // Mark all active matches as viewed when this page opens
  useEffect(() => {
    if (!loading && activeMatches.length > 0) {
      markAllViewed();
    }
  }, [loading, activeMatches.length, markAllViewed]);

  // Super Match celebration state
  const [superMatchCelebration, setSuperMatchCelebration] = useState<{
    show: boolean;
    matchedUserName: string;
    matchedUserAvatar?: string;
    matchProfileId: string;
  } | null>(null);

  // Apply filters
  const filteredActiveMatches = filterMatches(activeMatches);
  const filteredExpiredMatches = filterMatches(expiredMatches);
  const filteredRadarMatches = filterMatches(radarMatches);

  // Count super matches
  const superMatchCount = activeMatches.filter(m => m.is_super_match).length;

  const handleStartChat = async (matchId: string, otherUserId: string) => {
    try {
      setStartingChat(matchId);
      const { conversation } = await getOrCreateConversation(otherUserId);
      
      if (conversation?.id) {
        markChatStarted(matchId);
        // Navigate to inbox with conversation selected
        navigate('/messages', { state: { openConversationId: conversation.id } });
      }
    } catch (error) {
      toast({
        title: 'Erro ao iniciar chat',
        description: 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setStartingChat(null);
    }
  };

  return (
    <div className="min-h-dvh pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/30">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-gradient-to-br from-orange-500/20 to-yellow-500/20 border border-orange-500/30">
                <Flame className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                  Meus Matches
                  {activeMatches.length > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-sm font-medium"
                    >
                      <Sparkles className="h-3 w-3" />
                      {activeMatches.length}
                    </motion.span>
                  )}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Explorar novos misteriosos(as)
                </p>

              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Super Match Badge */}
              {superMatchCount > 0 && (
                <Badge className="bg-gradient-to-r from-yellow-500 via-amber-400 to-orange-500 text-black font-bold px-3 py-1 gap-1 shadow-lg shadow-yellow-500/25">
                  <Crown className="h-4 w-4" />
                  {superMatchCount} VIP
                </Badge>
              )}

              <Button
                variant="outline"
                onClick={() => navigate('/radar')}
                className="gap-2"
              >
                <Radar className="h-4 w-4" />
                Ir ao Radar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-3xl mx-auto space-y-4">
        {/* Filters only for Radar tab */}
        <MatchFilters
          filters={filters}
          onFiltersChange={setFilters}
          totalCount={activeMatches.length}
          filteredCount={filteredActiveMatches.length}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6 bg-card/50">
              <TabsTrigger value="active" className="gap-2 data-[state=active]:bg-orange-500/20">
                <Flame className="h-4 w-4" />
                Matches ({filteredActiveMatches.length})
              </TabsTrigger>
              <TabsTrigger value="radar" className="gap-2 data-[state=active]:bg-primary/20">
                <Radar className="h-4 w-4" />
                Radar ({filteredRadarMatches.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2 data-[state=active]:bg-muted">
                <History className="h-4 w-4" />
                Histórico ({filteredExpiredMatches.length})
              </TabsTrigger>
            </TabsList>


            <TabsContent value="active">
              <AnimatePresence mode="popLayout">
                {filteredActiveMatches.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-16 px-4"
                  >
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-500/10 to-yellow-500/10 flex items-center justify-center border border-orange-500/20">
                      <Flame className="h-10 w-10 text-orange-500/50" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {hasActiveFilters ? 'Nenhum match com estes filtros' : 'Nenhum match ativo'}
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      {hasActiveFilters 
                        ? 'Tente ajustar os filtros para ver mais resultados.'
                        : 'Ative o "Buscando Agora" no Radar para encontrar pessoas próximas que também estão buscando.'}
                    </p>
                    {!hasActiveFilters && (
                      <Button 
                        onClick={() => navigate('/radar')}
                        className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white gap-2"
                      >
                        <Radar className="h-4 w-4" />
                        Abrir Radar
                      </Button>
                    )}
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {filteredActiveMatches.map((match, index) => (
                      <motion.div
                        key={match.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <MatchCard
                          match={match}
                          onStartChat={() => handleStartChat(match.id, match.other_user.id)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </TabsContent>

            <TabsContent value="radar">
              <AnimatePresence mode="popLayout">
                {loadingRadar ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredRadarMatches.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-16 px-4"
                  >
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center border border-primary/20">
                      <Radar className="h-10 w-10 text-primary/60" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      Nenhum match pelo Radar ainda
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                      Toque no botão de sorte no Radar para encontrar perfis dentro do seu raio. Os matches gerados ali aparecem aqui.
                    </p>
                    <Button
                      onClick={() => navigate('/radar')}
                      className="bg-gradient-to-r from-primary to-secondary text-white gap-2"
                    >
                      <Radar className="h-4 w-4" />
                      Abrir Radar
                    </Button>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {filteredRadarMatches.map((match, index) => (
                      <motion.div
                        key={match.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <MatchCard
                          match={match}
                          onStartChat={() => handleStartChat(match.id, match.other_user.id)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </TabsContent>


            <TabsContent value="history">
              <AnimatePresence mode="popLayout">
                {filteredExpiredMatches.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-16 px-4"
                  >
                    <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/30 flex items-center justify-center border border-border/30">
                      <History className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {hasActiveFilters ? 'Nenhum match no histórico com estes filtros' : 'Sem histórico'}
                    </h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                      {hasActiveFilters 
                        ? 'Tente ajustar os filtros para ver mais resultados.'
                        : 'Seus matches expirados aparecerão aqui.'}
                    </p>
                  </motion.div>
                ) : (
                  <div className="space-y-3">
                    {filteredExpiredMatches.map((match, index) => (
                      <motion.div
                        key={match.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <MatchCard
                          match={match}
                          onStartChat={() => handleStartChat(match.id, match.other_user.id)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Super Match Celebration Modal */}
      {superMatchCelebration?.show && (
        <SuperMatchCelebration
          show={true}
          matchedUserName={superMatchCelebration.matchedUserName}
          matchedUserAvatar={superMatchCelebration.matchedUserAvatar}
          onDismiss={() => setSuperMatchCelebration(null)}
          onStartChat={() => {
            const match = activeMatches.find(m => m.other_user.id === superMatchCelebration.matchProfileId);
            if (match) handleStartChat(match.id, match.other_user.id);
            setSuperMatchCelebration(null);
          }}
          onViewProfile={() => {
            navigate(`/creator/${superMatchCelebration.matchProfileId}`);
            setSuperMatchCelebration(null);
          }}
        />
      )}
    </div>
  );
}
