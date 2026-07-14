/**
 * Engine de som do alerta master.
 *
 * Para presets (`bell`, `chime`, `ping`) usamos Web Audio API (síntese leve,
 * zero dependência de arquivos). Para `custom`, usamos HTMLAudioElement
 * apontando para uma URL assinada do bucket `master-alerts`.
 */

export type MasterAlertPreset = 'bell' | 'chime' | 'ping' | 'custom';

let _ctx: AudioContext | null = null;
function ctx(): AudioContext {
  if (!_ctx) {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    _ctx = new AC();
  }
  return _ctx;
}

function tone(freq: number, durationMs: number, volume: number, startOffset = 0) {
  try {
    const c = ctx();
    const t0 = c.currentTime + startOffset / 1000;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.05);
  } catch {/* silencioso */}
}

export function primeAudio(): void {
  // Precisa ser chamado dentro de um gesto do usuário para destravar autoplay.
  try {
    const c = ctx();
    if (c.state === 'suspended') c.resume().catch(() => {});
  } catch {/* */}
}

/**
 * BOOST: o volume do alerta master é multiplicado por 2x em relação ao slider.
 * Para os presets sintetizados, isso é feito ampliando o ganho do oscilador
 * (Web Audio aceita gain > 1 sem clipping audível em senoides curtas).
 * Para áudio personalizado (HTMLAudioElement), roteamos o elemento via
 * MediaElementSource + GainNode com ganho 2.0 (audio.volume sozinho é capado em 1).
 */
const VOLUME_BOOST = 2.0;

// Cache de roteamento WebAudio por elemento, para não recriar o grafo a cada play.
const _routed = new WeakMap<HTMLAudioElement, GainNode>();

function routeAudioElement(el: HTMLAudioElement, boost: number): GainNode {
  const existing = _routed.get(el);
  if (existing) {
    existing.gain.value = boost;
    return existing;
  }
  const c = ctx();
  const src = c.createMediaElementSource(el);
  const gain = c.createGain();
  gain.gain.value = boost;
  src.connect(gain).connect(c.destination);
  _routed.set(el, gain);
  return gain;
}

export async function playMasterAlert(opts: {
  preset: MasterAlertPreset;
  volume: number;            // 0–1
  customUrl?: string | null; // usado quando preset='custom'
}): Promise<void> {
  const baseVol = Math.max(0, Math.min(1, opts.volume ?? 0.8));
  const vol = baseVol * VOLUME_BOOST; // 0–2 (boost aplicado)
  primeAudio();

  if (opts.preset === 'custom' && opts.customUrl) {
    try {
      const audio = new Audio(opts.customUrl);
      audio.crossOrigin = 'anonymous';
      audio.volume = 1; // máximo no elemento; o boost vai pelo GainNode
      try {
        routeAudioElement(audio, baseVol * VOLUME_BOOST);
      } catch {
        // Se o roteamento WebAudio falhar (CORS), cai para volume nativo.
        audio.volume = baseVol;
      }
      await audio.play();
    } catch {/* permissão / autoplay */}
    return;
  }

  if (opts.preset === 'bell') {
    tone(880, 180, vol);
    tone(660, 280, vol * 0.7, 120);
  } else if (opts.preset === 'chime') {
    tone(523, 140, vol);          // C5
    tone(659, 140, vol, 130);     // E5
    tone(784, 220, vol, 260);     // G5
  } else {
    // ping
    tone(1200, 90, vol);
    tone(900, 120, vol * 0.6, 80);
  }
}
