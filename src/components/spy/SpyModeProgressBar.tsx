import { motion } from 'framer-motion';
import { Eye, AlertTriangle, Lock } from 'lucide-react';
import { useSpyModeStore } from '@/store/useSpyModeStore';

export function SpyModeProgressBar() {
  // Selectors atomizados — evita re-render desnecessário quando outros campos do store mudam.
  const viewedPosts = useSpyModeStore((s) => s.viewedPosts);
  const postsLimit = useSpyModeStore((s) => s.postsLimit);
  const isSpyMode = useSpyModeStore((s) => s.isSpyMode);

  if (!isSpyMode) return null;

  const progress = (viewedPosts / postsLimit) * 100;
  const isNearLimit = viewedPosts >= postsLimit - 5;
  const isAtLimit = viewedPosts >= postsLimit;

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`
        sticky top-0 z-40 px-4 py-2 
        ${isAtLimit 
          ? 'bg-destructive/20 border-b border-destructive/50' 
          : isNearLimit 
            ? 'bg-yellow-500/10 border-b border-yellow-500/30'
            : 'bg-card/80 backdrop-blur-sm border-b border-border/50'
        }
      `}
    >
      <div className="max-w-2xl mx-auto">
        {/* Linha superior com contador */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Eye className={`w-4 h-4 ${isAtLimit ? 'text-destructive' : 'text-primary'}`} />
            <span className="text-sm font-medium">
              {isAtLimit ? (
                <span className="text-destructive flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Limite atingido
                </span>
              ) : (
                <span className={isNearLimit ? 'text-yellow-500' : 'text-foreground'}>
                  Você viu <span className="font-bold text-primary">{viewedPosts}</span> de{' '}
                  <span className="font-bold">{postsLimit}</span> posts
                </span>
              )}
            </span>
          </div>
          
          {isNearLimit && !isAtLimit && (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="flex items-center gap-1 text-yellow-500 text-xs"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Restam apenas {postsLimit - viewedPosts}!</span>
            </motion.div>
          )}
        </div>

        {/* Barra de progresso */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              isAtLimit 
                ? 'bg-destructive animate-pulse' 
                : isNearLimit 
                  ? 'bg-yellow-500'
                  : 'bg-gradient-to-r from-primary to-accent'
            }`}
          />
        </div>

        {/* Mensagem de incentivo */}
        {isNearLimit && !isAtLimit && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-center text-muted-foreground mt-1"
          >
            Crie uma conta para ver conteúdo ilimitado! 🔓
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
