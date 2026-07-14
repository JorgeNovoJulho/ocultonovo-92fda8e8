import { motion } from 'framer-motion';
import { Lock, Plus, Eye, Sparkles } from 'lucide-react';
import { useSpyModeStore } from '@/store/useSpyModeStore';

interface SpyModeStoriesBarProps {
  onStoryClick: () => void;
}

export function SpyModeStoriesBar({ onStoryClick }: SpyModeStoriesBarProps) {
  const isSpyMode = useSpyModeStore((s) => s.isSpyMode);

  if (!isSpyMode) return null;

  // Stories simulados com blur
  const mockStories = [
    { id: 1, hasNew: true, color: 'from-pink-500 to-orange-400' },
    { id: 2, hasNew: true, color: 'from-purple-500 to-pink-500' },
    { id: 3, hasNew: false, color: 'from-blue-500 to-purple-500' },
    { id: 4, hasNew: true, color: 'from-green-400 to-blue-500' },
    { id: 5, hasNew: false, color: 'from-yellow-400 to-red-500' },
  ];

  return (
    <div className="bg-card/50 backdrop-blur-sm border-b border-border/50 py-4 px-4 overflow-x-auto">
      <div className="flex gap-4 min-w-max">
        {/* Criar Story - Bloqueado */}
        <motion.button
          onClick={onStoryClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-col items-center gap-1 relative"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center border-2 border-dashed border-primary/50 relative">
            <Plus className="w-6 h-6 text-primary/70" />
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
              <Lock className="w-4 h-4 text-white" />
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Seu Story</span>
        </motion.button>

        {/* Stories com blur */}
        {mockStories.map((story) => (
          <motion.button
            key={story.id}
            onClick={onStoryClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex flex-col items-center gap-1 relative group"
          >
            {/* Ring de gradient pulsante se tem novo */}
            <div className={`
              w-[70px] h-[70px] rounded-full p-[3px] 
              bg-gradient-to-br ${story.color}
              ${story.hasNew ? 'animate-pulse' : 'opacity-50'}
            `}>
              <div className="w-full h-full rounded-full bg-background p-0.5">
                {/* Avatar com blur forte */}
                <div className="w-full h-full rounded-full bg-gradient-to-br from-muted to-muted-foreground/30 blur-[10px] relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
                </div>
              </div>
            </div>

            {/* Overlay de bloqueio */}
            <div className="absolute inset-0 flex items-center justify-center rounded-full">
              <motion.div
                initial={{ opacity: 0.6 }}
                animate={{ opacity: [0.6, 0.9, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="bg-black/50 rounded-full p-2"
              >
                <Eye className="w-4 h-4 text-white/80" />
              </motion.div>
            </div>

            {/* Nome borrado */}
            <span className="text-xs text-muted-foreground blur-[4px] select-none">
              @usuario
            </span>

            {/* Badge de novo se houver */}
            {story.hasNew && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1"
              >
                <Sparkles className="w-4 h-4 text-primary" />
              </motion.div>
            )}
          </motion.button>
        ))}

        {/* Indicador de "mais stories" */}
        <motion.div
          onClick={onStoryClick}
          whileHover={{ scale: 1.05 }}
          className="flex flex-col items-center gap-1 cursor-pointer"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-muted/50 to-muted flex items-center justify-center border border-border">
            <span className="text-lg font-bold text-muted-foreground">+12</span>
          </div>
          <span className="text-xs text-primary">Ver todos</span>
        </motion.div>
      </div>
    </div>
  );
}
