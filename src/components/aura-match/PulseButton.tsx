/**
 * PulseButton — botão "Pulso de Aura" (slim, elegante, mobile-first).
 *
 * - Tap rápido envia 'default'. Long-press (450ms) abre o popover de tipos.
 * - Após enviar com sucesso: mostra estado "Enviado ✓" com contagem regressiva
 *   e fica desabilitado até o cooldown local terminar.
 */
import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles, Sparkle, Star, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { PulseType } from '@/hooks/useAuraPulses';

interface Props {
  /** Deve retornar Promise<boolean>: true se o pulso foi aceito pelo servidor. */
  onClick: (type: PulseType) => boolean | Promise<boolean> | void;
  disabled?: boolean;
  className?: string;
  /** Cooldown visual após envio bem-sucedido (ms). Default 6000. */
  cooldownMs?: number;
}

const LONGPRESS_MS = 450;
const DEFAULT_COOLDOWN = 15_000;

export const PulseButton = memo(function PulseButton({
  onClick, disabled, className, cooldownMs = DEFAULT_COOLDOWN,
}: Props) {
  const [open, setOpen] = useState(false);
  const [sentUntil, setSentUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inCooldown = sentUntil > Date.now();

  useEffect(() => {
    if (!inCooldown) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((sentUntil - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [sentUntil, inCooldown]);

  const fire = useCallback(async (type: PulseType) => {
    const r = onClick(type);
    const ok = r instanceof Promise ? await r : (r !== false);
    if (ok) setSentUntil(Date.now() + cooldownMs);
  }, [onClick, cooldownMs]);

  const start = () => {
    if (inCooldown || disabled) return;
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setOpen(true);
    }, LONGPRESS_MS);
  };
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const tap = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    cancel();
    if (longPressed.current || inCooldown || disabled) return;
    void fire('default');
  };

  const isDisabled = disabled || inCooldown;

  return (
    <Popover open={open} onOpenChange={(v) => !inCooldown && setOpen(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={isDisabled}
          onClick={tap}
          onMouseDown={start}
          onMouseUp={cancel}
          onMouseLeave={cancel}
          onTouchStart={start}
          onTouchEnd={cancel}
          onContextMenu={(e) => { e.preventDefault(); if (!inCooldown) setOpen(true); }}
          title={inCooldown ? `Aguarde ${remaining}s` : 'Pulso de Aura — toque ou segure para escolher o tipo'}
          aria-label="Enviar Pulso de Aura"
          className={cn(
            'group relative inline-flex items-center gap-1 rounded-full px-2.5 py-[2px]',
            'text-[10.5px] font-medium tracking-wide leading-none h-[22px]',
            'border transition-all duration-300 backdrop-blur-sm',
            'disabled:cursor-not-allowed',
            !inCooldown && [
              'border-amber-300/30 bg-gradient-to-r from-amber-400/[0.08] via-fuchsia-400/[0.06] to-pink-400/[0.08]',
              'text-white shadow-[0_0_0_1px_rgba(212,175,55,0.08),0_0_12px_-4px_rgba(212,175,55,0.35)]',
              'hover:border-amber-300/60 hover:text-white hover:shadow-[0_0_0_1px_rgba(212,175,55,0.18),0_0_18px_-3px_rgba(244,114,182,0.45)]',
              'active:scale-[0.96]',
            ],
            inCooldown && [
              'border-emerald-300/40 bg-emerald-500/10 text-emerald-200',
              'shadow-[0_0_0_1px_rgba(16,185,129,0.15)]',
            ],
            className,
          )}
        >
          {inCooldown ? (
            <>
              <Check className="h-3 w-3" strokeWidth={2.5} />
              <span>Enviado</span>
              {remaining > 0 && (
                <span className="text-[9px] tabular-nums opacity-70 ml-0.5">{remaining}s</span>
              )}
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 transition-transform duration-500 group-hover:rotate-12" />
              <span>Pulso</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        className="w-44 border-border/60 bg-background/95 p-1.5 shadow-lg"
      >
        <PulseOption
          icon={<Sparkles className="h-3.5 w-3.5 text-amber-300" />}
          label="Pulso comum"
          hint="grátis · todos"
          onClick={() => { setOpen(false); void fire('default'); }}
        />
        <PulseOption
          icon={<Sparkle className="h-3.5 w-3.5 text-fuchsia-300" />}
          label="Pulso Premium"
          hint="Premium/VIP"
          color="fuchsia"
          onClick={() => { setOpen(false); void fire('premium'); }}
        />
        <PulseOption
          icon={<Star className="h-3.5 w-3.5 text-pink-300" />}
          label="Pulso Raro"
          hint="VIP · alto prestígio"
          color="pink"
          onClick={() => { setOpen(false); void fire('rare'); }}
        />
      </PopoverContent>
    </Popover>
  );
});

function PulseOption({
  icon, label, hint, onClick, color,
}: { icon: React.ReactNode; label: string; hint: string; onClick: () => void; color?: 'fuchsia'|'pink' }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-background/60',
        color === 'fuchsia' && 'hover:bg-fuchsia-500/10',
        color === 'pink' && 'hover:bg-pink-500/10',
      )}
    >
      {icon}
      <span className="flex-1 font-medium">{label}</span>
      <span className="text-[9px] text-muted-foreground">{hint}</span>
    </button>
  );
}
