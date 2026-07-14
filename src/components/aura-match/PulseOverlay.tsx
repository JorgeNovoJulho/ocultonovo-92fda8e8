/**
 * PulseOverlay — efeito visual breve ao receber um Pulso de Aura.
 * Renderiza um glow fuchsia→amber + ripple expansivo no centro da tela,
 * com mini-cartão do remetente. Auto-some em ~2.4s.
 *
 * - Respeita prefers-reduced-motion (fade sem escala).
 * - Mostra ação "Responder" que chama respondPulse(pulseId).
 * - pointer-events: none no overlay; só o cartão é clicável.
 */
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { PulseEvent } from '@/hooks/useAuraPulses';

interface Props {
  pulse: PulseEvent | null;
  onClose: () => void;
  onRespond?: (pulseId: string) => void;
}

export function PulseOverlay({ pulse, onClose, onRespond }: Props) {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!pulse) return;
    // Overlay permanece visível por 15s para dar tempo do usuário responder.
    const t = setTimeout(onClose, 15000);
    return () => clearTimeout(t);
  }, [pulse, onClose]);

  const type = (pulse?.pulse_type || 'default') as 'default'|'premium'|'rare'|'silent';
  const color = pulse?.metadata?.color
    || (type === 'rare' ? '#FF3DE0' : type === 'premium' ? '#B57BFF' : '#D946EF');
  const label = type === 'rare'
    ? 'Pulso raro recebido'
    : type === 'premium'
    ? 'Pulso premium recebido'
    : 'Pulso de Aura';

  return (
    <AnimatePresence>
      {pulse && (
        <motion.div
          key={pulse.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
          style={{ willChange: 'opacity' }}
          aria-live="polite"
        >
          {!reduced && (
            <>
              {[0, 0.15, 0.3].map((d) => (
                <motion.div
                  key={d}
                  initial={{ scale: 0.4, opacity: 0.55 }}
                  animate={{ scale: type === 'rare' ? 4.5 : 4, opacity: 0 }}
                  transition={{ duration: type === 'rare' ? 1.4 : 1.2, delay: d, ease: 'easeOut' }}
                  className="absolute h-32 w-32 rounded-full border-2"
                  style={{ borderColor: color, willChange: 'transform, opacity' }}
                />
              ))}
            </>
          )}

          <motion.div
            initial={reduced ? { opacity: 0 } : { y: 10, opacity: 0, scale: 0.95 }}
            animate={reduced ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { y: 6, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22 }}
            className="pointer-events-auto relative flex items-center gap-3 rounded-2xl border bg-[#1a0830]/95 px-3 py-2.5 shadow-xl backdrop-blur"
            style={{
              borderColor: `${color}66`,
              boxShadow: `0 10px 30px ${color}40`,
            }}
          >
            <Avatar className="h-10 w-10 ring-2" style={{ boxShadow: `0 0 0 2px ${color}99` }}>
              <AvatarImage src={pulse.sender_avatar || undefined} alt="" />
              <AvatarFallback>
                {(pulse.sender_name || pulse.sender_username || '?').slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[11px] font-semibold" style={{ color }}>
                <Sparkles className="h-3 w-3" /> {label}
              </p>
              <p className="truncate text-[12px] text-foreground/90">
                {pulse.sender_username
                  ? `@${pulse.sender_username}`
                  : (pulse.sender_name || 'alguém')}{' '}
                <span className="text-foreground/60">quer sua atenção</span>
              </p>
            </div>
            {onRespond && (
              <button
                type="button"
                onClick={() => { onRespond(pulse.id); onClose(); }}
                className="ml-2 rounded-full px-3 py-1 text-[11px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                Responder
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
