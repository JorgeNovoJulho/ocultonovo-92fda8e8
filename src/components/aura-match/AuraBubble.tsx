import { memo, useEffect, useRef, useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Zap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PairCard } from '@/hooks/usePerfectPair';
import { useBoostCountdown } from '@/hooks/useBoostCountdown';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { MICRO_REWARD_EVENT } from '@/lib/auraMicroReward';
import { getAuraBoost as getInteractionCount } from '@/lib/auraMemory';

export interface AuraPosition {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  hue: number;
}

interface Props {
  card: PairCard;
  pos: AuraPosition;
  score: number;
  tier: 'low' | 'medium' | 'high';
  onTap: (card: PairCard) => void;
  priority?: boolean;
  boosted?: boolean;
  boostExpiresAt?: string | null;
  /** V3-H — descoberta limitada: marca a aura como rara hoje */
  rare?: boolean;
  /** V3-C — ressonância: pulso sincronizado quando há sinergia forte */
  resonant?: boolean;
  /** Drag&drop: persiste posição customizada por bolha */
  onDragPosition?: (card: PairCard, xPct: number, yPct: number) => void;
}

// Countdown unificado é resolvido via `useBoostCountdown` dentro do componente
// para garantir tick e formatos (short/long) consistentes em card, bolha e tooltip.

const planColor = (plan: string) => {
  const p = (plan || '').toLowerCase();
  if (p.includes('vip')) return 'ring-yellow-400/70';
  if (p.includes('premium')) return 'ring-fuchsia-400/70';
  return 'ring-white/20';
};

// Hue por afinidade — verde reservado APENAS para afinidades >90%.
// Outras faixas escalam do menor para o maior: vermelho → laranja → amarelo.
//   0-30%   => vermelho (0)
//   31-60%  => laranja  (25)
//   61-90%  => amarelo  (50)
//   91-100% => verde    (135)
export function auraHue(_distanceKm: number | null | undefined, score: number): number {
  const s = Math.min(Math.max(score, 0), 100);
  if (s <= 30) return 0;
  if (s <= 60) return 25;
  if (s <= 90) return 50;
  return 135;
}

const emotionLabel = (s: number): string => {
  if (s <= 20) return 'Distância no escuro';
  if (s <= 40) return 'Provocação';
  if (s <= 60) return 'Tensão sutil';
  if (s <= 80) return 'Atração intensa';
  if (s <= 92) return 'Química proibida';
  return 'Magnetismo raro';
};

const AuraBubbleComp = ({ card, pos, score, tier, onTap, priority = false, boosted = false, boostExpiresAt = null, rare = false, resonant = false, onDragPosition }: Props) => {
  const reducedMotion = usePrefersReducedMotion();
  const animate = tier !== 'low' && !reducedMotion;
  const showShadow = tier !== 'low';
  const boostCountdown = useBoostCountdown(boosted ? boostExpiresAt : null);
  const hue = auraHue(card.distance_km, score);
  const sharedTags = (card.shared_tags || []).slice(0, 6);
  const emotion = emotionLabel(score);
  // Mistério: low affinity bubbles are slightly hidden until tap
  const mystery = score < 35;

  // Etapa 8 — micro-recompensa visual (shockwave) ao tocar
  const [tapKey, setTapKey] = useState(0);
  const tapTimerRef = useRef<number | null>(null);

  // V3-I — micro-reward externo (visit/like/energy)
  const [microKey, setMicroKey] = useState(0);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      if (detail.targetId !== card.id) return;
      setMicroKey((k) => k + 1);
      window.setTimeout(() => setMicroKey(0), 700);
    };
    window.addEventListener(MICRO_REWARD_EVENT, handler);
    return () => window.removeEventListener(MICRO_REWARD_EVENT, handler);
  }, [card.id]);

  // Quick-card (controlled tooltip) — abre por single-tap ou long-press
  const [quickOpen, setQuickOpen] = useState(false);
  const quickTimerRef = useRef<number | null>(null);
  const lastClickRef = useRef<number>(0);
  const longPressRef = useRef<number | null>(null);
  const longPressedRef = useRef<boolean>(false);

  // Drag & drop com memória de posição.
  // Comportamento por dispositivo:
  //  - Mouse (desktop): SÓ inicia drag depois de mover >6px com o botão pressionado.
  //    Hover puro nunca dispara arrasto. Click rápido → quick card. Double-click → modal.
  //  - Touch/Pen:       arma o arrasto após 220ms segurando (long-press). Long-press sem
  //    mover ainda assim entra no modo arrastar (UX consistente com "segure e arraste").
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    armed: boolean;
    startX: number;
    startY: number;
    moved: boolean;
    stage?: HTMLElement | null;
    armTimer?: number | null;
    pointerType?: string;
  }>({ active: false, armed: false, startX: 0, startY: 0, moved: false });
  const [dragging, setDragging] = useState(false);
  const [pressed, setPressed] = useState(false);
  const suppressClickRef = useRef(false);

  const openQuick = (durationMs = 2400) => {
    setQuickOpen(true);
    if (quickTimerRef.current) window.clearTimeout(quickTimerRef.current);
    quickTimerRef.current = window.setTimeout(() => setQuickOpen(false), durationMs);
  };

  const triggerOpenModal = () => {
    if (animate) {
      setTapKey((k) => k + 1);
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = window.setTimeout(() => setTapKey(0), 700);
    }
    setQuickOpen(false);
    onTap(card);
  };

  const handlePress = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (longPressedRef.current) { longPressedRef.current = false; return; }
    const now = Date.now();
    const isDouble = now - lastClickRef.current < 320;
    lastClickRef.current = now;
    if (isDouble) {
      lastClickRef.current = 0;
      triggerOpenModal();
    } else {
      openQuick();
    }
  };

  const updateDragPosition = (clientX: number, clientY: number) => {
    const stage = dragRef.current.stage;
    if (!stage || !onDragPosition) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    onDragPosition(card, x, y);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Ignora botões do mouse que não sejam o esquerdo
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressedRef.current = false;
    const stage = buttonRef.current?.closest('[data-aura-field-stage]') as HTMLElement | null;
    dragRef.current = {
      active: false,
      armed: false,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      stage,
      armTimer: null,
      pointerType: e.pointerType,
    };
    setPressed(true);

    // Apenas touch/pen "arma" o arrasto por tempo (long-press 220ms).
    // No mouse, o drag só inicia ao MOVER (>6px) — evita drag fantasma no hover/click.
    if (e.pointerType !== 'mouse') {
      dragRef.current.armTimer = window.setTimeout(() => {
        dragRef.current.armed = true;
        if (!dragRef.current.active && onDragPosition) {
          setDragging(true);
        }
      }, 220);
      // Long-press preview (apenas toque) — só dispara se não estiver arrastando
      longPressRef.current = window.setTimeout(() => {
        if (!dragRef.current.active) {
          longPressedRef.current = true;
          openQuick(3500);
        }
      }, 450);
    }
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.startX && !d.startY) return; // sem pointerdown registrado
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const dist = Math.hypot(dx, dy);
    if (!d.active) {
      // Threshold: mouse precisa de movimento real (>6px) para iniciar drag;
      // touch pode iniciar por movimento OU por long-press armado.
      const canStart = d.pointerType === 'mouse' ? dist > 6 : (d.armed || dist > 6);
      if (onDragPosition && canStart) {
        d.active = true;
        d.moved = true;
        setDragging(true);
        if (longPressRef.current) { window.clearTimeout(longPressRef.current); longPressRef.current = null; }
        longPressedRef.current = false;
        setQuickOpen(false);
      }
    }
    if (d.active) {
      e.preventDefault();
      e.stopPropagation();
      updateDragPosition(e.clientX, e.clientY);
    }
  };

  const cancelLongPress = (e?: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.armTimer) { window.clearTimeout(d.armTimer); d.armTimer = null; }
    if (longPressRef.current) { window.clearTimeout(longPressRef.current); longPressRef.current = null; }
    if (d.active) {
      if (e) updateDragPosition(e.clientX, e.clientY);
      suppressClickRef.current = true;
      d.active = false;
      setDragging(false);
    } else if (dragging) {
      setDragging(false);
    }
    setPressed(false);
    // limpa pos start para evitar moves órfãos
    dragRef.current.startX = 0;
    dragRef.current.startY = 0;
  };

  // Hit-area mínima 64×64 garantida
  const safeSize = Math.max(pos.size, 64);

  const bubble = (
    <button
      type="button"
      ref={buttonRef}
      data-aura-no-pan="true"
      onClick={handlePress}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); triggerOpenModal(); }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      className={cn(
        'absolute -translate-x-1/2 -translate-y-1/2 select-none focus:outline-none transition-transform',
        dragging ? 'cursor-grabbing scale-110' : pressed ? 'cursor-grab active:scale-95' : 'cursor-pointer',
      )}
      style={{
        left: `${pos.x}%`,
        top: `${pos.y}%`,
        width: safeSize,
        height: safeSize,
        zIndex: dragging ? 50 : (priority ? 7 : 3),
        animation: dragging ? 'none' : (animate
          ? `aura-emerge 600ms ease-out ${pos.delay * 0.4}s both, aura-float ${pos.duration}s ease-in-out ${pos.delay}s infinite`
          : `aura-emerge 400ms ease-out both`),
        willChange: animate || dragging ? 'transform, opacity, left, top' : undefined,
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
        opacity: mystery ? 0.78 : 1,
        filter: dragging ? 'drop-shadow(0 0 12px hsla(280,90%,65%,0.7))' : undefined,
      }}
      aria-label={`Aura de @${card.username || 'usuario'} — ${emotion}${resonant ? ' · em ressonância com você' : ''}${rare ? ' · aura rara do dia' : ''} — segure e arraste para reposicionar`}
    >
      {/* V3-H — anel iridescente para "Aura Rara" do dia */}
      {rare && (
        <span
          className="pointer-events-none absolute -inset-1 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, hsla(45,100%,65%,0.7), hsla(280,90%,70%,0.5), hsla(180,90%,60%,0.5), hsla(45,100%,65%,0.7))',
            WebkitMask: 'radial-gradient(circle, transparent 60%, #000 62%)',
            mask: 'radial-gradient(circle, transparent 60%, #000 62%)',
            animation: animate ? 'aura-pulse 3.5s ease-in-out infinite' : undefined,
          }}
        />
      )}
      {/* V3-C — anel de ressonância (sincronizado com o pulso global) */}
      {resonant && !rare && (
        <span
          className="pointer-events-none absolute -inset-0.5 rounded-full"
          style={{
            border: `1.5px solid hsla(${hue + 10}, 95%, 70%, 0.55)`,
            boxShadow: showShadow ? `0 0 14px hsla(${hue + 10}, 95%, 65%, 0.45)` : undefined,
            animation: animate ? 'aura-pulse 4s ease-in-out infinite' : undefined,
          }}
          aria-hidden="true"
        />
      )}
      {/* Etapa 8 — shockwave de toque (CSS, vida curta) */}
      {tapKey > 0 && (
        <span
          key={tapKey}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            border: `2px solid hsla(${hue}, 90%, 65%, 0.85)`,
            animation: 'aura-shockwave 600ms ease-out forwards',
            willChange: 'transform, opacity',
          }}
        />
      )}
      {/* V3-I — micro-recompensa visual externa (alguém viu/curtiu/aproximou) */}
      {microKey > 0 && (
        <span
          key={`m-${microKey}`}
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            border: `2px solid hsla(${hue + 20}, 90%, 70%, 0.7)`,
            animation: 'aura-shockwave 700ms ease-out forwards',
          }}
        />
      )}
      {/* V3-H — label "Aura Rara" topo */}
        {rare && (
          <span className="aura-bubble-tag aura-bubble-tag--rare pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-[8px] font-black shadow-sm">
          <Sparkles className="mr-0.5 inline h-2 w-2" aria-hidden="true" />
          AURA RARA
        </span>
      )}
      {/* V3-C — rótulo "Ressonância" (apenas se NÃO for rara para evitar empilhar) */}
        {resonant && !rare && (
        <span
            className="aura-bubble-tag aura-bubble-tag--resonant pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-[8px] font-black shadow-sm"
          aria-hidden="true"
        >
          <Sparkles className="mr-0.5 inline h-2 w-2" aria-hidden="true" />
          RESSONÂNCIA
        </span>
      )}
      {/* Etapa 5 — personalidade: glow proporcional ao score; brilho extra para VIP/Premium */}
      {(() => {
        const isVip = (card.plan_type || '').toLowerCase().includes('vip');
        const isPrem = (card.plan_type || '').toLowerCase().includes('premium');
        const intensity = mystery ? 0.4 : Math.min(0.95, 0.45 + score / 220);
        const glowSize = mystery ? 16 : Math.round(20 + score * 0.35);
        const planBoost = isVip ? 1.35 : isPrem ? 1.15 : 1;
        return (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 30% 30%, hsla(${hue}, 90%, 65%, ${intensity}), hsla(${hue + 30}, 80%, 35%, 0.05) 70%)`,
              boxShadow: showShadow
                ? `0 0 ${Math.round(glowSize * planBoost)}px hsla(${hue}, 90%, 60%, ${intensity * planBoost})`
                : undefined,
              animation: animate
                ? `aura-pulse ${Math.max(2.5, pos.duration * 1.4 - score / 30)}s ease-in-out ${pos.delay}s infinite`
                : undefined,
            }}
          />
        );
      })()}
      <span className={cn(
        'pointer-events-none absolute inset-[14%] rounded-full ring-2',
        planColor(card.plan_type),
        boosted && 'ring-fuchsia-300 ring-offset-2 ring-offset-background',
        boosted && animate && 'animate-pulse',
      )}>
        {/* Halo premium extra para usuários com Aura Boost ativo */}
        {boosted && (
          <span className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-fuchsia-400/80" />
        )}
        <Avatar className="h-full w-full">
          <AvatarImage
            src={card.avatar_url || undefined}
            alt={`@${card.username || 'usuario'}`}
            loading="lazy"
            decoding="async"
            style={mystery ? { filter: 'blur(4px) saturate(1.2)' } : undefined}
          />
          <AvatarFallback className="bg-background text-xs">
            {(card.username?.[0] || '?').toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </span>
      {boosted && (() => {
        const short = boostCountdown.label;
        const long = boostCountdown.longLabel;
        const tip = `Aura Boost ativo${!boostCountdown.expired ? ` · termina em ${long}` : ''}. Esta aura aparece em destaque para todos durante 1h, dobrando as chances de encontro.`;
        return (
          <span title={tip} aria-label={tip} className="pointer-events-auto absolute -top-1 -right-1 z-10">
            <Badge className="gap-0.5 bg-fuchsia-500/90 px-1.5 py-0 text-[9px] font-bold text-white hover:bg-fuchsia-500/90">
              <Zap className="h-2.5 w-2.5" aria-hidden="true" /> Boost
              {!boostCountdown.expired && (
                <span className="ml-1 tabular-nums opacity-90">{short}</span>
              )}
            </Badge>
          </span>
        );
      })()}
      <span
        className="aura-bubble-tag aura-bubble-tag--emotion pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 text-[10px] font-black shadow-sm"
        style={{ ['--bubble-accent' as string]: `hsl(${hue} 96% 78%)`, ['--bubble-accent-border' as string]: `hsla(${hue}, 90%, 60%, 0.55)` }}
      >
        {emotion}
      </span>
    </button>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={quickOpen || undefined} onOpenChange={(o) => { if (!o) setQuickOpen(false); }}>
        <TooltipTrigger asChild>{bubble}</TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent
            side="top"
            sideOffset={8}
            collisionPadding={12}
            avoidCollisions
            className="aura-bubble-popup z-[60] max-w-[240px] rounded-xl border px-3 py-2.5 text-xs shadow-xl"
            style={{
              background: 'linear-gradient(160deg, hsl(272 38% 14%) 0%, hsl(258 42% 9%) 100%)',
              borderColor: 'hsl(0 0% 100% / 0.14)',
              color: 'hsl(0 0% 100%)',
            }}
          >
            <div className="font-semibold text-white">@{card.username || 'usuario'}</div>
            <div className="text-[11px]" style={{ color: 'hsl(0 0% 100% / 0.78)' }}>
              {card.distance_km != null ? `${card.distance_km} km` : 'Distância indisponível'}
              {card.city ? ` · ${card.city}` : ''}
            </div>
            {/* Affinity score bar */}
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'hsl(0 0% 100% / 0.14)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${score}%`,
                    backgroundColor: `hsl(${hue}, 90%, 60%)`,
                  }}
                />
              </div>
              <span className="min-w-[2.5rem] text-right text-[11px] font-bold" style={{ color: `hsl(${hue}, 95%, 78%)` }}>
                {score}%
              </span>
            </div>
            <div className="mt-0.5 text-[10px]" style={{ color: 'hsl(0 0% 100% / 0.7)' }}>
              Afinidade
            </div>
            {boosted && (
              <div className="mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: 'hsl(322 90% 60% / 0.22)', border: '1px solid hsl(322 90% 70% / 0.5)', color: 'hsl(322 100% 92%)' }}>
                <Zap className="h-3 w-3" aria-hidden="true" />
                <span className="font-semibold">Aura Boost</span>
                {boostExpiresAt && !boostCountdown.expired && <span style={{ color: 'hsl(322 100% 88% / 0.85)' }}>· termina em {boostCountdown.longLabel}</span>}
              </div>
            )}
            {resonant && (() => {
              const interactions = getInteractionCount(card.id);
              return (
                <div className="mt-1.5 rounded-md px-1.5 py-1 text-[10px]" style={{ background: 'hsl(322 90% 60% / 0.18)', border: '1px solid hsl(322 90% 70% / 0.45)', color: 'hsl(322 100% 94%)' }}>
                  <div className="flex items-center gap-1 font-semibold">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Em ressonância
                  </div>
                  <div className="mt-0.5 leading-snug" style={{ color: 'hsl(322 100% 90% / 0.92)' }}>
                    Score {score}% · {sharedTags.length} tag{sharedTags.length === 1 ? '' : 's'} em comum · {interactions} interaç{interactions === 1 ? 'ão' : 'ões'}
                  </div>
                </div>
              );
            })()}
            {sharedTags.length > 0 ? (
              <div className="mt-2">
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
                  Em comum
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {sharedTags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: 'hsl(322 90% 60% / 0.28)', color: 'hsl(322 100% 94%)', border: '1px solid hsl(322 90% 70% / 0.4)' }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-1 text-[10px]" style={{ color: 'hsl(0 0% 100% / 0.65)' }}>Sem tags em comum</div>
            )}
            <div className="mt-2 text-center text-[10px] font-semibold" style={{ color: 'hsl(322 100% 88%)' }}>
              Toque 2× para abrir o perfil completo
            </div>
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
    </TooltipProvider>
  );
};

export const AuraBubble = memo(AuraBubbleComp);
