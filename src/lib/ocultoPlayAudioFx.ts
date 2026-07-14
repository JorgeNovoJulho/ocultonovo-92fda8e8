/**
 * ocultoPlayAudioFx — Volume, mute e equalização (10 presets) compartilhados
 * para TODOS os players de áudio do Oculto Play.
 *
 * - Web Audio: cria um MediaElementSource por <audio> e conecta uma cadeia de
 *   6 BiquadFilters + GainNode. Aplicação em tempo real, sem reload.
 * - Persistência via localStorage (volume, mute, preset).
 * - Continua tocando ao trocar de aba (não pausamos por visibilitychange).
 */

export type EqPresetId =
  | 'flat'
  | 'bass'
  | 'superbass'
  | 'loudness'
  | 'treble'
  | 'vocal'
  | 'rock'
  | 'pop'
  | 'hiphop'
  | 'electronic'
  | 'acoustic'
  | 'cinema';

export interface EqPreset {
  id: EqPresetId;
  label: string;
  /** Ganhos (dB) para 6 bandas: 60, 230, 910, 3.6k, 9k, 14k Hz */
  gains: [number, number, number, number, number, number];
}

export const EQ_FREQUENCIES = [60, 230, 910, 3600, 9000, 14000] as const;

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat',       label: 'Padrão',          gains: [0, 0, 0, 0, 0, 0] },
  { id: 'bass',       label: 'Graves +',        gains: [6, 4, 1, 0, 0, 0] },
  { id: 'superbass',  label: 'Graves Intensos', gains: [10, 7, 2, 0, -1, -2] },
  { id: 'loudness',   label: 'Loudness',        gains: [7, 3, -2, 0, 4, 6] },
  { id: 'treble',     label: 'Agudos +',        gains: [0, 0, 0, 3, 6, 8] },
  { id: 'vocal',      label: 'Vocal',           gains: [-2, -1, 3, 5, 3, 0] },
  { id: 'rock',       label: 'Rock',            gains: [5, 3, -1, 2, 4, 5] },
  { id: 'pop',        label: 'Pop',             gains: [-1, 2, 4, 4, 1, -1] },
  { id: 'hiphop',     label: 'Hip-Hop / R&B',   gains: [8, 5, 1, 1, 2, 3] },
  { id: 'electronic', label: 'Eletrônico',      gains: [7, 4, 0, 1, 4, 6] },
  { id: 'acoustic',   label: 'Acústico',        gains: [4, 3, 2, 1, 2, 3] },
  { id: 'cinema',     label: 'Cinema',          gains: [6, 3, -1, 1, 4, 5] },
];

const LS_VOLUME = 'oculto:play:audio:volume';
const LS_MUTED  = 'oculto:play:audio:muted';
const LS_PRESET = 'oculto:play:audio:eq';

interface State {
  volume: number;     // 0..1
  muted: boolean;
  presetId: EqPresetId;
}

function loadState(): State {
  try {
    const v = parseFloat(localStorage.getItem(LS_VOLUME) ?? '1');
    const m = localStorage.getItem(LS_MUTED) === '1';
    const p = (localStorage.getItem(LS_PRESET) as EqPresetId) || 'flat';
    return {
      volume: isFinite(v) ? Math.max(0, Math.min(1, v)) : 1,
      muted: m,
      presetId: EQ_PRESETS.some((x) => x.id === p) ? p : 'flat',
    };
  } catch {
    return { volume: 1, muted: false, presetId: 'flat' };
  }
}

const state: State = loadState();

type Listener = (s: State) => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l({ ...state }));

let ctx: AudioContext | null = null;
interface Chain {
  source: MediaElementAudioSourceNode;
  filters: BiquadFilterNode[];
  gain: GainNode;
}
const chains = new WeakMap<HTMLAudioElement, Chain>();

function applyNativeAudioState(el: HTMLAudioElement) {
  try {
    el.volume = state.muted ? 0 : state.volume;
    el.muted = state.muted;
  } catch { /* noop */ }
}

function canAttachWebAudio(el: HTMLAudioElement): boolean {
  // Só liga WebAudio quando o usuário realmente usa EQ. O modo padrão fica
  // 100% nativo para evitar silêncio/trava por AudioContext suspenso/CORS em mobile.
  if (state.presetId === 'flat') return false;
  try {
    const src = el.currentSrc || el.src;
    if (!src) return false;
    const u = new URL(src, window.location.href);
    return u.origin === window.location.origin || !!el.crossOrigin;
  } catch {
    return !!el.crossOrigin;
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function resumeAudioFxNow(): void {
  const c = ctx;
  if (!c || c.state === 'running') return;
  try { c.resume().catch(() => { /* noop */ }); } catch { /* noop */ }
}

function presetById(id: EqPresetId): EqPreset {
  return EQ_PRESETS.find((p) => p.id === id) ?? EQ_PRESETS[0];
}

function applyPresetToChain(chain: Chain) {
  const p = presetById(state.presetId);
  chain.filters.forEach((f, i) => {
    try { f.gain.value = p.gains[i] ?? 0; } catch { /* noop */ }
  });
}

function applyGainToChain(chain: Chain) {
  try {
    chain.gain.gain.value = state.muted ? 0 : state.volume;
  } catch { /* noop */ }
}

export function attachAudioFx(el: HTMLAudioElement) {
  if (chains.has(el)) return;
  if (!canAttachWebAudio(el)) {
    applyNativeAudioState(el);
    return;
  }
  const c = ensureContext();
  if (!c) {
    // Sem WebAudio: aplica volume/mute direto no <audio>
    applyNativeAudioState(el);
    return;
  }
  try {
    const source = c.createMediaElementSource(el);
    const filters: BiquadFilterNode[] = EQ_FREQUENCIES.map((freq, idx) => {
      const f = c.createBiquadFilter();
      f.type = idx === 0 ? 'lowshelf' : idx === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1;
      f.gain.value = 0;
      return f;
    });
    const gain = c.createGain();
    // Encadeia: source -> f0 -> f1 -> ... -> gain -> destination
    let prev: AudioNode = source;
    filters.forEach((f) => { prev.connect(f); prev = f; });
    prev.connect(gain);
    gain.connect(c.destination);
    const chain: Chain = { source, filters, gain };
    chains.set(el, chain);
    applyPresetToChain(chain);
    applyGainToChain(chain);
    // Garante volume nativo cheio (controle real fica no GainNode)
    try { el.volume = 1; el.muted = false; } catch { /* noop */ }
    // Retoma contexto no primeiro play (políticas de autoplay). Se o FX for
    // anexado depois que a música já começou, retoma imediatamente; caso
    // contrário o MediaElementSource pode ficar conectado a um contexto
    // suspenso e aparentar que o player “travou” sem som.
    const resume = () => { if (c.state !== 'running') c.resume().catch(() => { /* noop */ }); };
    el.addEventListener('play', resume);
    el.addEventListener('playing', resume);
    if (!el.paused) resume();
  } catch {
    // Se MediaElementSource falhar (CORS, já conectado etc.), cai no modo simples
    applyNativeAudioState(el);
  }
}

function applyAll() {
  // Aplica a todas as cadeias conhecidas (WeakMap não é iterável; usamos
  // um registro paralelo de elementos para isso).
  trackedElements.forEach((el) => {
    const chain = chains.get(el);
    if (chain) {
      applyPresetToChain(chain);
      applyGainToChain(chain);
    } else if (canAttachWebAudio(el)) {
      _attachAudioFx(el);
      const created = chains.get(el);
      if (created) {
        applyPresetToChain(created);
        applyGainToChain(created);
      } else {
        applyNativeAudioState(el);
      }
    } else {
      applyNativeAudioState(el);
    }
  });
  emit();
}

const trackedElements = new Set<HTMLAudioElement>();
const _attachAudioFx = attachAudioFx;
export function attachAudioFxTracked(el: HTMLAudioElement) {
  trackedElements.add(el);
  _attachAudioFx(el);
}

export function setVolume(v: number) {
  state.volume = Math.max(0, Math.min(1, v));
  if (state.volume > 0 && state.muted) state.muted = false;
  try { localStorage.setItem(LS_VOLUME, String(state.volume)); } catch { /* noop */ }
  try { localStorage.setItem(LS_MUTED, state.muted ? '1' : '0'); } catch { /* noop */ }
  applyAll();
}

export function setMuted(m: boolean) {
  state.muted = m;
  try { localStorage.setItem(LS_MUTED, m ? '1' : '0'); } catch { /* noop */ }
  applyAll();
}

export function toggleMuted() { setMuted(!state.muted); }

export function setPreset(id: EqPresetId) {
  state.presetId = id;
  try { localStorage.setItem(LS_PRESET, id); } catch { /* noop */ }
  applyAll();
}

export const DEFAULT_FX: State = { volume: 1, muted: false, presetId: 'flat' };

export function resetFx() {
  state.volume = DEFAULT_FX.volume;
  state.muted = DEFAULT_FX.muted;
  state.presetId = DEFAULT_FX.presetId;
  try {
    localStorage.setItem(LS_VOLUME, String(state.volume));
    localStorage.setItem(LS_MUTED, state.muted ? '1' : '0');
    localStorage.setItem(LS_PRESET, state.presetId);
  } catch { /* noop */ }
  applyAll();
}

export function getFxState(): State { return { ...state }; }

export function subscribeFx(l: Listener): () => void {
  listeners.add(l);
  queueMicrotask(() => l({ ...state }));
  return () => { listeners.delete(l); };
}

// Sincronização entre abas: ouve mudanças do localStorage e replica
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    if (e.key !== LS_VOLUME && e.key !== LS_MUTED && e.key !== LS_PRESET) return;
    const next = (() => {
      try {
        const v = parseFloat(localStorage.getItem(LS_VOLUME) ?? '1');
        const m = localStorage.getItem(LS_MUTED) === '1';
        const p = (localStorage.getItem(LS_PRESET) as EqPresetId) || 'flat';
        return {
          volume: isFinite(v) ? Math.max(0, Math.min(1, v)) : 1,
          muted: m,
          presetId: EQ_PRESETS.some((x) => x.id === p) ? p : 'flat',
        } as State;
      } catch { return null; }
    })();
    if (!next) return;
    state.volume = next.volume;
    state.muted = next.muted;
    state.presetId = next.presetId;
    applyAll();
  });
}

