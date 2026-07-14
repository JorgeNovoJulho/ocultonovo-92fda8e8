/**
 * FeedModeSyncIndicator
 * Badge flutuante que aparece quando o modo do feed é sincronizado
 * em tempo real entre dispositivos. Respeita a preferência do usuário
 * (useFeedSyncIndicatorPref) — pode ser desativado nas configurações.
 * Some sozinho após ~3.5s com fade+slide suave.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Sparkles, Flame } from 'lucide-react';
import { useFeedExperienceMode } from '@/hooks/useFeedExperienceMode';
import { useFeedSyncIndicatorPref } from '@/hooks/useFeedSyncIndicatorPref';

const VISIBLE_MS = 3500;

export default function FeedModeSyncIndicator() {
  const { justSyncedAt, isAdultOnly } = useFeedExperienceMode();
  const { enabled } = useFeedSyncIndicatorPref();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || !justSyncedAt) return;
    // Respeita o tempo restante (caso o badge tenha sido restaurado do localStorage após reload).
    const elapsed = Date.now() - justSyncedAt;
    const remaining = VISIBLE_MS - elapsed;
    if (remaining <= 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(t);
  }, [justSyncedAt, enabled]);

  if (!enabled) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="feed-sync-indicator"
          initial={{ opacity: 0, y: -16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.6 }}
          className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[80] pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-full border border-primary/30 bg-background/85 px-3.5 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
            <span>Modo sincronizado</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
              {isAdultOnly ? <Flame className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {isAdultOnly ? '+18' : 'Completo'}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
