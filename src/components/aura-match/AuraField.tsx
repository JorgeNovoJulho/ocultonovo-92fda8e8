import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuraBubble, type AuraPosition } from './AuraBubble';
import { AuraEventsTicker } from './AuraEventsTicker';
import type { PairCard } from '@/hooks/usePerfectPair';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { AuraEventState } from '@/lib/auraEvents';
import { useActiveBoostUserIds } from '@/hooks/useAuraBoost';
import { useResonance } from '@/hooks/useResonance';
import { getDailyCycle } from '@/lib/auraDailyCycle';
import { levelVisual } from '@/lib/auraLevelStyle';
import { fireAuraMicroReward } from '@/lib/auraMicroReward';
import { AURA_FIELD_DEFAULT_ZOOM, AURA_FIELD_MAX_ZOOM, AURA_FIELD_MIN_ZOOM, useAuraFieldStore } from '@/store/useAuraFieldStore';

interface Props {
  cards: PairCard[];
  scores: Record<string, number>;
  tier: 'low' | 'medium' | 'high';
  onTap: (card: PairCard, info?: { resonant: boolean; rare?: boolean }) => void;
  selfAvatarUrl?: string | null;
  selfName?: string | null;
  /** Etapa 13 — aura própria diferenciada por plano */
  selfPlan?: string | null;
  /** V3-A — aura própria intensifica conforme nível */
  selfLevel?: number;
  /** Bloco A — evento ativo (paleta/glow dinâmico) */
  event?: AuraEventState;
  /** V3-H — id da aura "rara" do dia */
  rareCardId?: string | null;
  /** Perfis prioritários devem ficar sempre visíveis no campo */
  priorityCardIds?: string[];
  /** Disparado quando novas auras entram em ressonância (delta count). */
  onResonanceDetected?: (newCount: number) => void;
  /** Callback opcional para atualizar as bolhas em tempo real (refetch do feed). */
  onRefresh?: () => void | Promise<unknown>;
  /** Randomizar: troca o conjunto de bolhas (priorizando auras verdes). */
  onRandomize?: () => void | Promise<unknown>;
  /** Quantos randomize ainda restam hoje (mostra contagem no botão). */
  randomizeRemaining?: number;
}

// Etapa 13 — Estilo da aura própria do usuário por plano
function selfAuraStyle(plan?: string | null) {
  const p = (plan || '').toLowerCase();
  if (p.includes('vip')) {
    return {
      bg: 'radial-gradient(circle at 30% 30%, hsla(45, 100%, 70%, 0.85), hsla(35, 100%, 45%, 0.15) 70%)',
      shadow: '0 0 48px hsla(45, 100%, 65%, 0.7), 0 0 18px hsla(45, 100%, 70%, 0.9)',
      ring: 'ring-amber-300',
      label: 'VIP',
      labelColor: 'text-amber-300',
    };
  }
  if (p.includes('premium')) {
    return {
      bg: 'radial-gradient(circle at 30% 30%, hsla(280, 95%, 75%, 0.75), hsla(260, 90%, 40%, 0.1) 70%)',
      shadow: '0 0 42px hsla(280, 95%, 65%, 0.6)',
      ring: 'ring-fuchsia-300',
      label: 'Premium',
      labelColor: 'text-fuchsia-300',
    };
  }
  return {
    bg: 'radial-gradient(circle at 30% 30%, hsla(300, 95%, 70%, 0.55), hsla(260, 90%, 40%, 0.05) 70%)',
    shadow: '0 0 30px hsla(300, 95%, 65%, 0.45)',
    ring: 'ring-fuchsia-300/80',
    label: 'Você',
    labelColor: 'text-foreground',
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Posição inicial em coordenadas polares (anéis concêntricos) — depois passa
// por uma fase de RELAXAMENTO que afasta bolhas sobrepostas. Resultado: nunca
// empilha, distribui de forma equilibrada e mantém o ponto de partida estável.
function seedPosition(card: PairCard, idx: number, priorityRank = -1): AuraPosition {
  const h = hash(card.id || String(idx));
  if (priorityRank >= 0) {
    const priorityAnchors = [
      { x: 28, y: 31 },
      { x: 72, y: 31 },
      { x: 24, y: 66 },
      { x: 76, y: 66 },
    ];
    const anchor = priorityAnchors[priorityRank % priorityAnchors.length];
    const jitterX = (((h >> 4) % 5) - 2) * 0.7;
    const jitterY = (((h >> 7) % 5) - 2) * 0.7;
    const size = Math.max(72, 80 - Math.min(priorityRank, 3) * 2 + ((h >> 5) % 6));
    return {
      x: anchor.x + jitterX,
      y: anchor.y + jitterY,
      size,
      delay: ((h >> 7) % 20) / 10,
      duration: 5.4 + ((h >> 9) % 20) / 10,
      hue: (h >> 11) % 360,
    };
  }

  // Anéis: distribuição polar como ponto de partida.
  let ring = 0;
  let acc = 0;
  let perRing = 10;
  while (acc + perRing <= idx) {
    acc += perRing;
    ring += 1;
    perRing = Math.min(28, 10 + ring * 6);
  }
  const posInRing = idx - acc;
  const angleStep = (Math.PI * 2) / Math.max(perRing, 1);
  // Offset por anel para evitar alinhamento radial entre anéis vizinhos.
  const ringPhase = ring * (Math.PI / 7);
  const angle = posInRing * angleStep + ringPhase + ((h % 100) / 100) * angleStep * 0.4;
  const baseRadius = 16 + ring * 11;
  const radius = Math.min(44, baseRadius + ((h >> 3) % 4) - 1.5);
  const ellipseX = 0.94 - Math.min(0.22, ring * 0.032);
  const ellipseY = 0.74 - Math.min(0.14, ring * 0.02);
  const size = Math.max(54, 70 - ring * 2 + ((h >> 5) % 8));
  return {
    x: 50 + Math.cos(angle) * radius * ellipseX,
    y: 50 + Math.sin(angle) * radius * ellipseY,
    size,
    delay: ((h >> 7) % 30) / 10,
    duration: 5 + ((h >> 9) % 30) / 10,
    hue: (h >> 11) % 360,
  };
}

// Relaxamento: empurra bolhas sobrepostas até não haver mais colisões.
// Determinístico, sem RAF — roda 1 vez no useMemo.
// Custo: ~O(n²) por iteração × ~8 iterações; OK até ~80 bolhas.
function relaxPositions(
  positions: AuraPosition[],
  fieldW = 100,
  fieldH = 100,
  fieldHeightPx = 600,
): AuraPosition[] {
  if (positions.length <= 1) return positions;
  const pts = positions.map((p) => ({ ...p }));
  // Converte tamanho em px → raio em "% do campo" (campo ≈ 600px de altura).
  const radiusPct = (size: number) => (size / 2 / fieldHeightPx) * 100 * 1.55; // +55% de folga p/ evitar bolhas amontoadas/sobrepostas
  // Centro reservado para o "Você" (~88px) — também com folga maior.
  const selfR = radiusPct(96) * 1.15;
  const iterations = 14;
  const margin = 6; // não cola na borda

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const ra = radiusPct(a.size);

      // 1. Empurra do centro (self)
      const dxC = a.x - 50;
      const dyC = a.y - 50;
      const dC = Math.hypot(dxC, dyC) || 0.01;
      const minC = ra + selfR;
      if (dC < minC) {
        const push = (minC - dC) * 0.5;
        a.x += (dxC / dC) * push;
        a.y += (dyC / dC) * push;
        moved = true;
      }

      // 2. Empurra de cada outra bolha
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const rb = radiusPct(b.size);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const min = ra + rb;
        if (d < min) {
          const push = (min - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          moved = true;
        }
      }

      // 3. Mantém dentro do campo (com margem)
      const r = ra;
      if (a.x < margin + r) a.x = margin + r;
      if (a.x > fieldW - margin - r) a.x = fieldW - margin - r;
      if (a.y < margin + r) a.y = margin + r;
      if (a.y > fieldH - margin - r) a.y = fieldH - margin - r;
    }
    if (!moved) break;
  }
  return pts;
}

// Auto-fit: define um zoom alvo para o campo caber todas as bolhas
// confortavelmente. Mais bolhas → zoom menor; menos bolhas → zoom maior.
function computeAutoZoom(count: number): number {
  if (count <= 0) return AURA_FIELD_DEFAULT_ZOOM;
  // Curva suave entre 1.40 (poucas) e 0.55 (muitas).
  // Calibrado: 3 → ~1.30, 8 → ~1.05, 15 → ~0.90, 25 → ~0.75, 40 → ~0.62.
  const target = 1.55 - Math.log2(count + 2) * 0.20;
  return Math.max(AURA_FIELD_MIN_ZOOM, Math.min(AURA_FIELD_MAX_ZOOM, +target.toFixed(2)));
}

export function AuraField({ cards, scores, tier, onTap, selfAvatarUrl, selfName, selfPlan, selfLevel = 1, event, rareCardId = null, priorityCardIds = [], onResonanceDetected, onRefresh, onRandomize, randomizeRemaining }: Props) {
  const selfStyle = selfAuraStyle(selfPlan);
  const selfLvlVisual = levelVisual(selfLevel);
  const boostedIds = useActiveBoostUserIds();
  const resonantIds = useResonance(cards, scores);
  const priorityIdSet = useMemo(() => new Set(priorityCardIds.filter(Boolean)), [priorityCardIds]);
  const positions = useMemo(
    () => {
      let priorityRank = 0;
      const seeded = cards.map((c, i) => {
        const isPriority = priorityIdSet.has(c.id);
        const rank = isPriority ? priorityRank++ : -1;
        return seedPosition(c, i, rank);
      });
      // Fase de relaxamento: garante zero sobreposição e distribuição igualitária.
      return relaxPositions(seeded);
    },
    [cards, priorityIdSet]
  );

  // V3-G — ciclo diário (manhã/tarde/noite/madrugada). Reavalia 60s.
  const [cycle, setCycle] = useState(() => getDailyCycle());
  useEffect(() => {
    const id = window.setInterval(() => setCycle(getDailyCycle()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const zoom = useAuraFieldStore((state) => state.zoom);
  const panX = useAuraFieldStore((state) => state.panX);
  const panY = useAuraFieldStore((state) => state.panY);
  const setZoom = useAuraFieldStore((state) => state.setZoom);
  const setPan = useAuraFieldStore((state) => state.setPan);
  const resetView = useAuraFieldStore((state) => state.resetView);
  const bubbleOverrides = useAuraFieldStore((state) => state.bubbleOverrides);
  const setBubbleOverride = useAuraFieldStore((state) => state.setBubbleOverride);
  const resetBubbleOverrides = useAuraFieldStore((state) => state.resetBubbleOverrides);
  const zoomIn = () => { userZoomedRef.current = true; setZoom(+(zoom + 0.12).toFixed(2)); };
  const zoomOut = () => { userZoomedRef.current = true; setZoom(+(zoom - 0.12).toFixed(2)); };
  const zoomReset = () => { userZoomedRef.current = false; setZoom(computeAutoZoom(cards.length)); };

  // ── Auto-fit: ajusta zoom automaticamente conforme a quantidade de bolhas.
  // Respeita override manual: se o usuário usou +/− no field, paramos de
  // sobrescrever (até ele clicar em "Resetar zoom").
  const userZoomedRef = useRef(false);
  const lastAutoCountRef = useRef<number>(-1);
  useEffect(() => {
    if (userZoomedRef.current) return;
    if (lastAutoCountRef.current === cards.length) return;
    lastAutoCountRef.current = cards.length;
    const target = computeAutoZoom(cards.length);
    // Só aplica se a diferença for relevante (evita micro-jitter visual)
    if (Math.abs(target - zoom) > 0.04) setZoom(target);
  }, [cards.length, zoom, setZoom]);

  // ── Refresh manual: dispara onRefresh do parent (refetch das bolhas) ──
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); }
    finally { window.setTimeout(() => setRefreshing(false), 400); }
  };

  // Pan + pinch gestures (mouse drag, single-touch drag, two-finger pinch)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: 'idle' | 'pan' | 'pinch';
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    pinchStartDist: number;
    pinchStartZoom: number;
    moved: boolean;
    pointers: Map<number, { x: number; y: number }>;
  }>({
    mode: 'idle',
    startX: 0, startY: 0, startPanX: 0, startPanY: 0,
    pinchStartDist: 0, pinchStartZoom: zoom,
    moved: false,
    pointers: new Map(),
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ds = dragStateRef.current;
    const distOf = () => {
      const pts = Array.from(ds.pointers.values());
      if (pts.length < 2) return 0;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      return Math.hypot(dx, dy);
    };

    const onPointerDown = (e: PointerEvent) => {
      // Ignora gestos iniciados em controles (botões de zoom/recenter, chips, etc.)
      const targetEl = e.target as HTMLElement | null;
      if (targetEl && targetEl.closest('[data-aura-no-pan="true"]')) {
        return;
      }
      ds.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch {}
      if (ds.pointers.size === 2) {
        ds.mode = 'pinch';
        ds.pinchStartDist = distOf() || 1;
        ds.pinchStartZoom = useAuraFieldStore.getState().zoom;
      } else if (ds.pointers.size === 1) {
        ds.mode = 'pan';
        ds.startX = e.clientX;
        ds.startY = e.clientY;
        const st = useAuraFieldStore.getState();
        ds.startPanX = st.panX;
        ds.startPanY = st.panY;
        ds.moved = false;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!ds.pointers.has(e.pointerId)) return;
      ds.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ds.mode === 'pinch' && ds.pointers.size >= 2) {
        const d = distOf();
        if (d > 0 && ds.pinchStartDist > 0) {
          const next = ds.pinchStartZoom * (d / ds.pinchStartDist);
          setZoom(+next.toFixed(3));
        }
      } else if (ds.mode === 'pan') {
        const dx = e.clientX - ds.startX;
        const dy = e.clientY - ds.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          ds.moved = true;
          if (!dragging) setDragging(true);
        }
        if (ds.moved) {
          setPan(ds.startPanX + dx, ds.startPanY + dy);
          e.preventDefault();
        }
      }
    };
    const endPointer = (e: PointerEvent) => {
      ds.pointers.delete(e.pointerId);
      try { el.releasePointerCapture(e.pointerId); } catch {}
      if (ds.pointers.size < 2 && ds.mode === 'pinch') {
        ds.mode = ds.pointers.size === 1 ? 'pan' : 'idle';
        const remaining = Array.from(ds.pointers.values())[0];
        if (remaining) {
          ds.startX = remaining.x;
          ds.startY = remaining.y;
          const st = useAuraFieldStore.getState();
          ds.startPanX = st.panX;
          ds.startPanY = st.panY;
        }
      }
      if (ds.pointers.size === 0) {
        ds.mode = 'idle';
        if (dragging) setDragging(false);
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('pointerleave', endPointer);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endPointer);
      el.removeEventListener('pointercancel', endPointer);
      el.removeEventListener('pointerleave', endPointer);
    };
  }, [setZoom, setPan, dragging]);

  // V3-C — micro-recompensa + toast quando novas auras entram em ressonância.
  // Throttle: máx 1 toast por sessão a cada 25s; cita até 3 nomes.
  const knownResonantRef = useRef<Set<string>>(new Set());
  const lastToastAtRef = useRef<number>(0);
  useEffect(() => {
    if (resonantIds.size === 0) return;
    const fresh: string[] = [];
    resonantIds.forEach((id) => {
      if (!knownResonantRef.current.has(id)) {
        knownResonantRef.current.add(id);
        fresh.push(id);
      }
    });
    if (fresh.length === 0) return;
    fresh.forEach((id) => fireAuraMicroReward(id, 'echo'));
    try { onResonanceDetected?.(fresh.length); } catch {}
    const now = Date.now();
    if (now - lastToastAtRef.current > 25_000) {
      lastToastAtRef.current = now;
      // Privacidade: SEMPRE usar @username, nunca nome real.
      const handles = fresh
        .map((id) => {
          const c = cards.find((cc) => cc.id === id);
          const u = (c?.username || '').toString().trim().replace(/^@+/, '');
          return u ? `@${u}` : null;
        })
        .filter(Boolean)
        .slice(0, 3) as string[];
      const label = handles.length
        ? `Ressonância com ${handles.join(', ')}${fresh.length > handles.length ? ` e +${fresh.length - handles.length}` : ''}`
        : `Nova ressonância detectada (${fresh.length})`;
      toast(label, {
        description: 'Score, tags e interações alinharam — toque a bolha para ver detalhes.',
        duration: 3500,
      });
    }
  }, [resonantIds, cards]);

  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (tier !== 'high') return;
    const handler = (e: DeviceOrientationEvent) => {
      const x = Math.max(-10, Math.min(10, (e.gamma ?? 0) / 4));
      const y = Math.max(-10, Math.min(10, (e.beta ?? 0) / 8));
      setTilt({ x, y });
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [tier]);

  // Bloco A + V3-G — paleta dinâmica combinando evento + ciclo diário
  const noturno = event?.kind === 'noturno';
  const ambientHueA = noturno ? 270 : cycle.hueA;
  const ambientHueB = noturno ? 240 : cycle.hueB;
  const ambientHueC = noturno ? 290 : cycle.hueC;
  const fieldBg = (noturno || cycle.kind === 'madrugada')
    ? 'bg-gradient-to-br from-[#080224] via-[#0c0535] to-[#03000d]'
    : 'bg-gradient-to-br from-[#0b0420] via-[#120a2e] to-[#070114]';

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl border border-white/5 ${fieldBg} ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ height: 'min(72vh, 620px)', contain: 'strict', touchAction: 'none', userSelect: 'none' }}
      aria-label="Campo de auras (arraste para mover, pinça para zoom)"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            `radial-gradient(ellipse at 20% 30%, hsla(${ambientHueA}, 70%, 30%, 0.45), transparent 55%), radial-gradient(ellipse at 80% 70%, hsla(${ambientHueB}, 70%, 30%, 0.40), transparent 55%)`,
        }}
      />

      {/* Universo vivo: orbs ambientes (CSS-only, GPU) */}
      {tier !== 'low' && (
        <>
          <div
            className="pointer-events-none absolute -left-[10%] top-[10%] h-[55%] w-[55%] rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle, hsla(${ambientHueA + 15}, 90%, 55%, ${event?.kind === 'pico' ? 0.30 : 0.22}), transparent 70%)`,
              animation: 'aura-drift-a 18s ease-in-out infinite, aura-shimmer 7s ease-in-out infinite',
              willChange: 'transform, opacity',
            }}
          />
          <div
            className="pointer-events-none absolute -right-[12%] bottom-[8%] h-[60%] w-[60%] rounded-full blur-2xl"
            style={{
              background: `radial-gradient(circle, hsla(${ambientHueB + 5}, 90%, 55%, ${event?.kind === 'pico' ? 0.28 : 0.20}), transparent 70%)`,
              animation: 'aura-drift-b 22s ease-in-out infinite, aura-shimmer 9s ease-in-out infinite',
              willChange: 'transform, opacity',
            }}
          />
          <div
            className="pointer-events-none absolute left-[35%] top-[40%] h-[35%] w-[35%] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, hsla(${ambientHueC}, 95%, 60%, 0.14), transparent 70%)`,
              animation: 'aura-drift-a 26s ease-in-out infinite reverse',
              willChange: 'transform',
            }}
          />
        </>
      )}
      <div
        data-aura-field-stage
        className="absolute inset-0"
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) ${tier === 'high' ? `translate3d(${tilt.x}px, ${tilt.y}px, 0) ` : ''}scale(${zoom})`,
          transformOrigin: '50% 50%',
          transition: dragging ? 'none' : 'transform 220ms ease-out',
          willChange: 'transform',
        }}
      >
        {/* Logged-in user always at center */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          aria-label="Você"
        >
          <div className="relative h-[88px] w-[88px]">
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: selfStyle.bg,
                boxShadow: tier !== 'low'
                  ? `${selfStyle.shadow}, 0 0 ${Math.round(20 * selfLvlVisual.glow)}px hsla(300, 95%, 65%, ${0.25 * selfLvlVisual.glow})`
                  : selfStyle.shadow,
                animation: tier !== 'low' ? `aura-pulse ${selfLvlVisual.pulseSpeed}s ease-in-out infinite` : undefined,
              }}
            />
            {/* V3-A — anel extra para níveis altos */}
            {selfLvlVisual.ringClass && (
              <span className={`pointer-events-none absolute -inset-1 rounded-full ring-2 ${selfLvlVisual.ringClass}`} />
            )}
            <Avatar className={`absolute inset-[14%] h-auto w-auto ring-2 ${selfStyle.ring}`}>
              <AvatarImage src={selfAvatarUrl || undefined} alt={selfName || 'Você'} />
              <AvatarFallback className="bg-background text-xs">
                {selfName?.slice(0, 1) || 'V'}
              </AvatarFallback>
            </Avatar>
            <span
              className={`absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm ${selfStyle.labelColor}`}
            >
              {selfStyle.label}
            </span>
            {/* V3-A — chip de nível */}
            {selfLevel >= 2 && (
              <span
                className={`absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold backdrop-blur-sm ${selfLvlVisual.labelColor}`}
              >
                Nv {selfLevel} · {selfLvlVisual.label}
              </span>
            )}
          </div>
        </div>

        {cards.map((c, i) => {
          const override = bubbleOverrides[c.id];
          const finalPos = override ? { ...positions[i], x: override.x, y: override.y } : positions[i];
          return (
            <AuraBubble
              key={c.id}
              card={c}
              pos={finalPos}
              score={scores[c.id] ?? 50}
              tier={tier}
              onTap={(card) => onTap(card, { resonant: resonantIds.has(card.id), rare: rareCardId === card.id })}
              priority={priorityIdSet.has(c.id)}
              boosted={boostedIds.has(c.id)}
              boostExpiresAt={boostedIds.expiresAt(c.id)}
              rare={rareCardId === c.id}
              resonant={resonantIds.has(c.id)}
              onDragPosition={(card, x, y) => setBubbleOverride(card.id, x, y)}
            />
          );
        })}
      </div>

      {/* Botão para resetar posições customizadas das bolhas (memória) */}
      {Object.keys(bubbleOverrides).length > 0 && (
        <button
          type="button"
          data-aura-no-pan="true"
          onClick={() => { resetBubbleOverrides(); toast.success('Posições das auras restauradas'); }}
          className="absolute top-2 left-2 z-30 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-sm hover:bg-black/75 transition-colors"
          aria-label="Resetar posições das auras"
        >
          ↺ Restaurar posições ({Object.keys(bubbleOverrides).length})
        </button>
      )}

      {/* Dica visual permanente sobre arrasto das bolhas */}
      <div
        data-aura-no-pan="true"
        className="pointer-events-none absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full border border-fuchsia-300/25 bg-black/55 px-2 py-0.5 text-[10px] font-medium text-fuchsia-100/85 backdrop-blur-sm"
        aria-label="Dica: segure e arraste para reposicionar as bolhas"
      >
        <span aria-hidden>✋</span>
        <span>Segure e arraste a bolha para reposicionar</span>
      </div>

      {/* Top-right cluster: randomizar + refresh + ciclo diário */}
      <div className="absolute right-2 top-2 z-20 flex items-center gap-1.5">
        {onRandomize && (
          <button
            type="button"
            data-aura-no-pan="true"
            onClick={() => { void onRandomize(); }}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={randomizeRemaining !== undefined && randomizeRemaining <= 0}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 text-[11px] font-semibold text-emerald-100 backdrop-blur-sm transition hover:bg-emerald-500/30 active:scale-95 disabled:opacity-50"
            aria-label={`Randomizar bolhas — prioriza auras verdes${randomizeRemaining !== undefined ? ` (${randomizeRemaining} restantes hoje)` : ''}`}
            title={randomizeRemaining !== undefined && randomizeRemaining <= 0 ? 'Limite diário atingido — volte amanhã' : 'Randomizar: 20 bolhas novas (auras verdes primeiro)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16 3h5v5" />
              <path d="M4 20 21 3" />
              <path d="M21 16v5h-5" />
              <path d="m15 15 6 6" />
              <path d="M4 4l5 5" />
            </svg>
            Randomizar{randomizeRemaining !== undefined ? ` (${randomizeRemaining})` : ''}
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            data-aura-no-pan="true"
            onClick={handleRefresh}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={refreshing}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-fuchsia-300/30 bg-black/60 px-2.5 text-[11px] font-semibold text-fuchsia-100 backdrop-blur-sm transition hover:bg-black/80 active:scale-95 disabled:opacity-60"
            aria-label="Atualizar bolhas em tempo real"
            title="Atualizar bolhas"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
              className={refreshing ? 'animate-spin' : ''}
              aria-hidden
            >
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M3 21v-5h5" />
            </svg>
            {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
        <div
          data-aura-no-pan="true"
          className="pointer-events-none flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2 py-0.5 text-[10px] backdrop-blur-sm"
          aria-label={`Ciclo diário: ${cycle.name}`}
        >
          <span aria-hidden>{cycle.emoji}</span>
          <span className="font-semibold" style={{ color: `hsl(${cycle.hueA}, 80%, 75%)` }}>
            {cycle.name}
          </span>
        </div>
      </div>

      {/* Zoom + recenter controls — pinch & arraste no mobile */}
      <div
        data-aura-no-pan="true"
        className="absolute bottom-2 right-2 z-20 flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-1.5 py-1 backdrop-blur-sm"
        style={{ touchAction: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Diminuir zoom"
          className="grid h-8 w-8 place-items-center rounded-full text-base font-bold text-white/85 transition hover:bg-white/10 active:scale-95"
        >
          −
        </button>
        <button
          type="button"
          onClick={zoomReset}
          aria-label="Resetar zoom para padrão"
          title="Resetar zoom"
          className="min-w-[44px] rounded-full px-1.5 text-[10px] font-semibold text-white/70 transition hover:bg-white/10"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Aumentar zoom"
          className="grid h-8 w-8 place-items-center rounded-full text-base font-bold text-white/85 transition hover:bg-white/10 active:scale-95"
        >
          +
        </button>
        <span className="mx-0.5 h-4 w-px bg-white/15" aria-hidden />
        <button
          type="button"
          onClick={() => resetView()}
          aria-label="Recentralizar quadro"
          title="Recentralizar"
          className="grid h-8 w-8 place-items-center rounded-full text-white/85 transition hover:bg-white/10 active:scale-95"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-11 right-3 z-10 text-[9px] text-white/45">
        {Math.round(AURA_FIELD_MIN_ZOOM * 100)}% · padrão {Math.round(AURA_FIELD_DEFAULT_ZOOM * 100)}% · {Math.round(AURA_FIELD_MAX_ZOOM * 100)}%
      </div>

      {/* Etapa 11 — eventos sociais flutuantes */}
      <AuraEventsTicker
        auraCount={cards.length}
        highAffinityCount={cards.filter((c) => (scores[c.id] ?? 0) >= 75).length}
        tier={tier}
      />
    </div>
  );
}
