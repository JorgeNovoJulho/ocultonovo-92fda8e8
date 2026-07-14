/**
 * PerfectPairMatchModal — Fullscreen neon impact modal
 * Triggered on mutual match. Isolated component to prevent card stack re-renders.
 * Performance: fade/scale only — no confetti, no heavy GPU effects.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Radar, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useMatchNotification } from '@/hooks/useMatchNotification';
import type { PairMatch } from '@/hooks/usePerfectPair';

interface Props {
  match: PairMatch | null;
  currentUserAvatar?: string | null;
  currentUserName?: string;
  onDismiss: () => void;
}

export const PerfectPairMatchModal = memo(function PerfectPairMatchModal({
  match,
  currentUserAvatar,
  currentUserName,
  onDismiss,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const { playMatchAlert } = useMatchNotification();

  useEffect(() => {
    if (match) {
      const t = setTimeout(() => setVisible(true), 100);
      playMatchAlert();

      // Bloqueia fechamento por ESC (mantém apenas botões de ação)
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      window.addEventListener('keydown', onKey, true);

      // Trava o scroll do fundo enquanto o modal estiver aberto
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        clearTimeout(t);
        window.removeEventListener('keydown', onKey, true);
        document.body.style.overflow = prevOverflow;
      };
    } else {
      setVisible(false);
      setChatError(null);
    }
  }, [match, playMatchAlert]);


  /**
   * Navigate to chat — uses pre-created conversationId if available,
   * otherwise falls back to ?to= query so chat page creates it.
   * Never breaks navigation even if conversation creation failed.
   */
  const handleMessage = useCallback(async () => {
    if (!match) return;

    // If conversation was pre-created by DB trigger, navigate directly
    if (match.conversationId) {
      onDismiss();
      navigate(`/messages?conversation=${match.conversationId}`);
      return;
    }

    // Attempt to get/create conversation on-demand
    setChatLoading(true);
    setChatError(null);

    try {
      const targetAuthId = match.pairUserAuthId;

      if (targetAuthId) {
        // Try get_or_create_conversation RPC
        const { data: convId, error } = await supabase.rpc('get_or_create_conversation', {
          p_user1_id: user?.id || '',
          p_user2_id: targetAuthId,
        });

        if (!error && convId) {
          onDismiss();
          navigate(`/messages?conversation=${convId}`);
          return;
        }
      }

      // Ultimate fallback: navigate with target user id
      const targetId = match.pairUserAuthId || match.pairUserId;
      onDismiss();
      navigate(`/messages?to=${targetId}`);
    } catch {
      setChatError('Não foi possível abrir o chat. Tente novamente.');
    } finally {
      setChatLoading(false);
    }
  }, [match, onDismiss, navigate]);

  const handleViewProfile = useCallback(() => {
    if (!match) return;
    onDismiss();
    navigate(`/creator/${match.pairUserId}`);
  }, [match, onDismiss, navigate]);

  const handleContinue = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 280);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {match && visible && (
        <motion.div
          className="fixed inset-0 z-[800] flex flex-col items-center justify-center overflow-y-auto overscroll-contain"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            minHeight: '100dvh',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          // Não fecha ao clicar fora — apenas botões de ação fecham
          onClick={(e) => { e.stopPropagation(); }}
          onPointerDown={(e) => { e.stopPropagation(); }}
          onTouchStart={(e) => { e.stopPropagation(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="aura-match-title"
        >
          {/* Dark overlay (sem onClick — clique no fundo é ignorado) */}
          <div className="absolute inset-0 bg-black/90" aria-hidden="true" />

          {/* Subtle static glow — no animation to save GPU */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, hsl(var(--primary) / 0.12) 0%, hsl(var(--secondary) / 0.06) 45%, transparent 70%)',
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-4 sm:gap-5 px-4 sm:px-6 py-6 max-w-sm w-full mx-auto">

            {/* Overlapping avatars — escala responsiva para qualquer tela */}
            <motion.div
              className="flex items-center justify-center"
              initial={{ scale: 0.75, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.1 }}
            >
              {/* Current user */}
              <div className="relative z-10">
                <div className="rounded-full p-[3px] bg-gradient-to-br from-primary to-secondary">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 border-4 border-black">
                    <AvatarImage src={currentUserAvatar || undefined} alt={currentUserName} />
                    <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                      {currentUserName?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>

              {/* Match user — overlapping */}
              <div className="relative -ml-8 z-20">
                <div className="rounded-full p-[3px] bg-gradient-to-br from-secondary to-primary">
                  <Avatar className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 border-4 border-black">
                    <AvatarImage src={match.pairUserAvatar || undefined} alt={match.userName} />
                    <AvatarFallback className="bg-secondary/20 text-secondary text-2xl font-bold">
                      {match.userName?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </motion.div>

            {/* Title */}
            <motion.div
              className="text-center"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.22 }}
            >
              <h1
                id="aura-match-title"
                className="text-3xl sm:text-4xl md:text-5xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary"
                style={{
                  filter: 'drop-shadow(0 0 16px hsl(var(--primary) / 0.5))',
                }}
              >
                AURA MATCH
              </h1>
              <p className="text-white/60 text-sm mt-2">
                Você e{' '}
                <span className="text-white font-semibold">{match.userName}</span>{' '}
                se curtiram!
              </p>
            </motion.div>

            {/* Error feedback */}
            {chatError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-destructive text-xs text-center px-4 py-2 bg-destructive/10 rounded-lg border border-destructive/20 w-full"
              >
                {chatError}
              </motion.p>
            )}

            {/* Action buttons */}
            <motion.div
              className="flex flex-col gap-3 w-full mt-2"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.38 }}
            >
              {/* Primary: Send Message */}
              <Button
                onClick={chatError ? handleMessage : handleMessage}
                disabled={chatLoading}
                className="w-full h-14 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-bold text-base gap-3 transition-opacity"
                style={{ boxShadow: '0 0 20px hsl(var(--primary) / 0.25)' }}
              >
                {chatLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Abrindo chat…
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-5 w-5" />
                    {chatError ? 'Tentar novamente' : 'Enviar Mensagem'}
                  </>
                )}
              </Button>

              {/* View Profile */}
              <Button
                onClick={handleViewProfile}
                variant="outline"
                className="w-full h-12 border-primary/30 text-white hover:text-white hover:bg-primary/10 font-medium text-sm gap-2"
              >
                <User className="h-4 w-4" />
                Ver Perfil
              </Button>

              {/* Continue swiping — closes modal without resetting card stack */}
              <Button
                onClick={handleContinue}
                variant="ghost"
                className="w-full h-10 text-white/50 hover:text-white/70 hover:bg-white/5 font-medium text-xs gap-2"
              >
                <Radar className="h-4 w-4" />
                Continuar buscando auras
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
