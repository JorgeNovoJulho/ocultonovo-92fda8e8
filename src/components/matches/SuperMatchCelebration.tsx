import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Crown, Sparkles, MessageCircle, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SuperMatchBadge } from './SuperMatchBadge';
import { logger } from '@/lib/logger';

interface SuperMatchCelebrationProps {
  show: boolean;
  matchedUserName: string;
  matchedUserAvatar?: string;
  onDismiss: () => void;
  onStartChat: () => void;
  onViewProfile: () => void;
}

export function SuperMatchCelebration({
  show,
  matchedUserName,
  matchedUserAvatar,
  onDismiss,
  onStartChat,
  onViewProfile,
}: SuperMatchCelebrationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);

      // Confetti dourado customizado
      const goldColors = ['#EAB308', '#F59E0B', '#D97706', '#FBBF24', '#FCD34D'];

      // Explosão inicial
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: goldColors,
      });

      // Rajadas laterais
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: goldColors,
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: goldColors,
        });
      }, 250);

      // Explosão central maior
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.5 },
          colors: goldColors,
          shapes: ['circle', 'square'],
          scalar: 1.2,
        });
      }, 500);

      // Som de celebração especial (Web Audio)
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const playNote = (frequency: number, startTime: number, duration: number) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = frequency;
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.3, startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
          
          oscillator.start(startTime);
          oscillator.stop(startTime + duration);
        };

        const now = audioContext.currentTime;
        // Fanfarra VIP
        playNote(523.25, now, 0.15);        // C5
        playNote(659.25, now + 0.15, 0.15); // E5
        playNote(783.99, now + 0.3, 0.15);  // G5
        playNote(1046.5, now + 0.45, 0.4);  // C6
      } catch (e) {
        logger.log('Audio não suportado');
      }

      // Vibração intensa
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 200]);
      }
    }
  }, [show]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss();
  };

  const handleStartChat = () => {
    setVisible(false);
    onStartChat();
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Card className="relative overflow-hidden bg-gradient-to-br from-yellow-500/15 via-amber-500/10 to-orange-500/15 border-yellow-400/50 shadow-[0_0_60px_rgba(234,179,8,0.4)]">
            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 p-1 rounded-full bg-black/20 hover:bg-black/40 transition-colors z-10"
            >
              <X className="h-5 w-5 text-white/70" />
            </button>

            <CardContent className="p-8 text-center relative">
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 via-transparent to-amber-500/5 animate-pulse" />

              {/* Crown Icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', delay: 0.2 }}
                className="relative mx-auto mb-6"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 flex items-center justify-center shadow-[0_0_40px_rgba(234,179,8,0.5)]">
                  <Crown className="h-12 w-12 text-black" />
                </div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -top-2 -right-2"
                >
                  <Sparkles className="h-8 w-8 text-yellow-400" />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                  className="absolute -bottom-1 -left-2"
                >
                  <Sparkles className="h-6 w-6 text-amber-400" />
                </motion.div>
              </motion.div>

              {/* Badge */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="mb-4"
              >
                <SuperMatchBadge size="lg" />
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-2xl font-bold text-foreground mb-2"
              >
                Conexão Exclusiva VIP! 👑
              </motion.h2>

              {/* Description */}
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-muted-foreground mb-6 max-w-sm mx-auto"
              >
                Você e <span className="text-yellow-400 font-semibold">{matchedUserName}</span> são 
                membros VIP buscando agora! Esta é uma conexão premium exclusiva.
              </motion.p>

              {/* Action Buttons */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex flex-col sm:flex-row gap-3 justify-center"
              >
                <Button
                  variant="outline"
                  onClick={onViewProfile}
                  className="gap-2 border-yellow-400/50 hover:bg-yellow-400/10"
                >
                  <User className="h-4 w-4" />
                  Ver Perfil
                </Button>
                <Button
                  onClick={handleStartChat}
                  className="gap-2 bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 hover:from-yellow-600 hover:via-amber-600 hover:to-orange-600 text-black font-semibold shadow-lg shadow-yellow-500/30"
                >
                  <MessageCircle className="h-4 w-4" />
                  Iniciar Chat VIP
                </Button>
              </motion.div>

              {/* Decorative sparkles */}
              <div className="absolute top-4 left-4 text-yellow-400/30">✨</div>
              <div className="absolute bottom-4 right-4 text-amber-400/30">✨</div>
              <div className="absolute top-1/2 left-2 text-orange-400/20">⭐</div>
              <div className="absolute top-1/3 right-2 text-yellow-400/20">⭐</div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
