/**
 * Ultra-light FPS monitor — uses requestAnimationFrame only.
 * Cost: 1 callback per frame, no allocations in the hot path.
 *
 * Detects sustained performance drops and notifies a single subscriber
 * (the PerformanceContext) so it can downgrade quality automatically.
 *
 * Thresholds are configurable at runtime via setFpsThresholds() and
 * persisted in localStorage so admin/user tweaks survive reloads.
 */

export type FpsStatus = 'good' | 'degraded' | 'critical';

export interface FpsSample {
  fps: number;
  status: FpsStatus;
  averageFps: number;
  /** Tempo médio por frame em ms (1000/fps suavizado). Útil p/ histerese. */
  avgFrameTimeMs: number;
  drops: number; // # de janelas consecutivas em status != good
  /** # de janelas consecutivas em status 'good' (usado p/ desligar Modo Economia). */
  recoveries: number;
}

export interface FpsThresholds {
  /** abaixo deste fps → 'degraded' (entra em Modo Economia) */
  degradedFps: number;
  /** abaixo deste fps → 'critical' (qualidade mínima) */
  criticalFps: number;
  /** janelas ruins consecutivas antes de ativar Modo Economia */
  dropsBeforeDowngrade: number;
  /** acima deste fps por N janelas → libera p/ desligar Modo Economia (histerese) */
  recoveryFps: number;
  /** janelas boas consecutivas antes de desligar Modo Economia */
  recoveriesBeforeUpgrade: number;
  /** tempo médio por frame (ms) acima do qual também aciona downgrade */
  highFrameTimeMs: number;
  /** janela de amostragem em ms */
  sampleWindowMs: number;
}

type Listener = (s: FpsSample) => void;

const STORAGE_KEY = 'perf:thresholds:v1';

const DEFAULT_THRESHOLDS: FpsThresholds = {
  degradedFps: 40,
  criticalFps: 25,
  dropsBeforeDowngrade: 3,
  // Histerese: precisa estar bem acima do degradado por várias janelas
  // para sair do Modo Economia (evita "flapping" na borda 40fps).
  recoveryFps: 52,
  recoveriesBeforeUpgrade: 8,
  highFrameTimeMs: 32, // ~30fps p/ frame time médio
  sampleWindowMs: 1000,
};

function loadThresholds(): FpsThresholds {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_THRESHOLDS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    const parsed = JSON.parse(raw) as Partial<FpsThresholds>;
    return {
      degradedFps: Number(parsed.degradedFps) || DEFAULT_THRESHOLDS.degradedFps,
      criticalFps: Number(parsed.criticalFps) || DEFAULT_THRESHOLDS.criticalFps,
      dropsBeforeDowngrade:
        Number(parsed.dropsBeforeDowngrade) || DEFAULT_THRESHOLDS.dropsBeforeDowngrade,
      recoveryFps: Number(parsed.recoveryFps) || DEFAULT_THRESHOLDS.recoveryFps,
      recoveriesBeforeUpgrade:
        Number(parsed.recoveriesBeforeUpgrade) || DEFAULT_THRESHOLDS.recoveriesBeforeUpgrade,
      highFrameTimeMs: Number(parsed.highFrameTimeMs) || DEFAULT_THRESHOLDS.highFrameTimeMs,
      sampleWindowMs: Number(parsed.sampleWindowMs) || DEFAULT_THRESHOLDS.sampleWindowMs,
    };
  } catch {
    return { ...DEFAULT_THRESHOLDS };
  }
}

let thresholds: FpsThresholds = loadThresholds();

let rafId: number | null = null;
let lastTs = 0;
let frames = 0;
let windowStart = 0;
let consecutiveDrops = 0;
let consecutiveRecoveries = 0;
let rollingAvg = 60;
let rollingFrameTimeMs = 16.7;
const listeners = new Set<Listener>();

function classify(fps: number, frameTimeMs: number): FpsStatus {
  if (fps < thresholds.criticalFps || frameTimeMs > thresholds.highFrameTimeMs * 1.5) return 'critical';
  if (fps < thresholds.degradedFps || frameTimeMs > thresholds.highFrameTimeMs) return 'degraded';
  return 'good';
}

function loop(ts: number) {
  if (!windowStart) windowStart = ts;
  frames++;
  lastTs = ts;

  const elapsed = ts - windowStart;
  if (elapsed >= thresholds.sampleWindowMs) {
    const fps = Math.round((frames * 1000) / elapsed);
    rollingAvg = Math.round(rollingAvg * 0.7 + fps * 0.3);
    const frameTime = elapsed / Math.max(1, frames);
    rollingFrameTimeMs = rollingFrameTimeMs * 0.7 + frameTime * 0.3;
    const status = classify(fps, rollingFrameTimeMs);

    if (status !== 'good') {
      consecutiveDrops++;
      consecutiveRecoveries = 0;
    } else {
      consecutiveDrops = 0;
      // Histerese: só conta como recuperação quando bem acima do limiar
      if (fps >= thresholds.recoveryFps && rollingFrameTimeMs <= thresholds.highFrameTimeMs * 0.7) {
        consecutiveRecoveries++;
      } else {
        consecutiveRecoveries = 0;
      }
    }

    const sample: FpsSample = {
      fps,
      averageFps: rollingAvg,
      avgFrameTimeMs: Math.round(rollingFrameTimeMs * 10) / 10,
      status,
      drops: consecutiveDrops,
      recoveries: consecutiveRecoveries,
    };

    for (const l of listeners) l(sample);

    frames = 0;
    windowStart = ts;
  }

  rafId = requestAnimationFrame(loop);
}

export function startFpsMonitor() {
  if (rafId !== null) return;
  // Skip on tabs not visible — rAF would already throttle, but be explicit
  if (typeof document !== 'undefined' && document.hidden) return;
  windowStart = 0;
  frames = 0;
  rafId = requestAnimationFrame(loop);
}

export function stopFpsMonitor() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function subscribeFps(l: Listener): () => void {
  listeners.add(l);
  if (listeners.size === 1) startFpsMonitor();
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) stopFpsMonitor();
  };
}

export function getFpsThresholds(): FpsThresholds {
  return { ...thresholds };
}

export function setFpsThresholds(patch: Partial<FpsThresholds>): FpsThresholds {
  const next: FpsThresholds = {
    degradedFps: Math.max(1, Number(patch.degradedFps ?? thresholds.degradedFps)),
    criticalFps: Math.max(1, Number(patch.criticalFps ?? thresholds.criticalFps)),
    dropsBeforeDowngrade: Math.max(
      1,
      Math.floor(Number(patch.dropsBeforeDowngrade ?? thresholds.dropsBeforeDowngrade)),
    ),
    recoveryFps: Math.max(1, Number(patch.recoveryFps ?? thresholds.recoveryFps)),
    recoveriesBeforeUpgrade: Math.max(
      1,
      Math.floor(Number(patch.recoveriesBeforeUpgrade ?? thresholds.recoveriesBeforeUpgrade)),
    ),
    highFrameTimeMs: Math.max(8, Number(patch.highFrameTimeMs ?? thresholds.highFrameTimeMs)),
    sampleWindowMs: Math.max(250, Math.floor(Number(patch.sampleWindowMs ?? thresholds.sampleWindowMs))),
  };
  // Histerese: recoveryFps deve ser estritamente maior que degradedFps
  if (next.recoveryFps <= next.degradedFps) next.recoveryFps = next.degradedFps + 8;
  // Sanity: critical must be <= degraded
  if (next.criticalFps > next.degradedFps) next.criticalFps = next.degradedFps;
  thresholds = next;
  try {
    localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return { ...next };
}

export function resetFpsThresholds(): FpsThresholds {
  try {
    localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  thresholds = { ...DEFAULT_THRESHOLDS };
  return { ...thresholds };
}

export const DEFAULT_FPS_THRESHOLDS = DEFAULT_THRESHOLDS;

// Auto pause/resume on visibility change to save battery
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFpsMonitor();
    else if (listeners.size > 0) startFpsMonitor();
  });
}
