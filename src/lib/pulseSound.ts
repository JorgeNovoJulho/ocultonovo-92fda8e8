/**
 * Pulse sound — síntese leve via Web Audio API.
 * Zero download (não baixa MP3), zero memória além do AudioContext.
 * Som curto (≈220ms): dois tons brilhantes (fuchsia → amber) com decay.
 */
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx) {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
    }
    if (_ctx?.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  } catch {
    return null;
  }
}

export function playPulseChime(volume = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  gain.connect(ctx.destination);

  // Tom 1 — agudo brilhante
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(1320, now);
  o1.frequency.exponentialRampToValueAtTime(880, now + 0.2);
  o1.connect(gain);
  o1.start(now);
  o1.stop(now + 0.23);

  // Tom 2 — harmônico quente
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(1760, now);
  o2.frequency.exponentialRampToValueAtTime(1100, now + 0.18);
  const g2 = ctx.createGain();
  g2.gain.value = 0.35;
  o2.connect(g2);
  g2.connect(gain);
  o2.start(now);
  o2.stop(now + 0.2);
}

/** Premium chime — duas notas suaves descendentes, ~280ms */
export function playPremiumChime(volume = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  gain.connect(ctx.destination);
  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(987.77, now);              // B5
  o1.frequency.exponentialRampToValueAtTime(659.25, now + 0.26); // E5
  o1.connect(gain); o1.start(now); o1.stop(now + 0.29);
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(1318.51, now + 0.06);
  const g2 = ctx.createGain(); g2.gain.value = 0.25;
  o2.connect(g2); g2.connect(gain);
  o2.start(now + 0.06); o2.stop(now + 0.26);
}

/** Rare chime — arpejo etéreo curto (~360ms) */
export function playRareChime(volume = 0.2) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
  gain.connect(ctx.destination);
  const notes = [659.25, 987.77, 1318.51, 1760]; // E5 B5 E6 A6
  notes.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 === 0 ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f, now + i * 0.06);
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 1 : 0.55;
    o.connect(g); g.connect(gain);
    o.start(now + i * 0.06);
    o.stop(now + i * 0.06 + 0.18);
  });
}

export function playChimeByType(type: 'default'|'premium'|'rare'|'silent') {
  if (type === 'silent') return;
  if (type === 'rare') return playRareChime();
  if (type === 'premium') return playPremiumChime();
  return playPulseChime();
}

export function tryVibrate(pattern: number | number[] = [40, 20, 40]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { (navigator as any).vibrate(pattern); } catch { /* noop */ }
  }
}
