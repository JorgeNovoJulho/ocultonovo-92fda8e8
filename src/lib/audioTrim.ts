/**
 * audioTrim — recorta um Blob de áudio em um trecho (start..start+duration)
 * usando Web Audio API + OfflineAudioContext e devolve um Blob WAV (mono ou estéreo).
 *
 * Usado pelo Voice Bio: o usuário pode enviar um áudio longo e escolher um
 * trecho de até 30 s para salvar no perfil.
 */

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const ab = new ArrayBuffer(bufferLength);
  const view = new DataView(ab);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // interleaved PCM samples
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c += 1) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < buffer.length; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, s, true);
      offset += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

export async function trimAudioBlob(
  blob: Blob,
  startSec: number,
  durationSec: number,
  options: { mono?: boolean; targetSampleRate?: number } = {},
): Promise<{ blob: Blob; duration: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) throw new Error('Web Audio API indisponível neste navegador.');
  const tempCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    try { await tempCtx.close(); } catch { /* noop */ }
  }

  const total = decoded.duration;
  const start = Math.max(0, Math.min(startSec, Math.max(0, total - 0.1)));
  const dur = Math.max(0.5, Math.min(durationSec, total - start));

  // Mono + 22.05 kHz por padrão → WAV ~30s ≈ 1,3 MB (vs ~5 MB stereo 44.1k).
  const outChannels = options.mono === false ? decoded.numberOfChannels : 1;
  const outSampleRate = Math.min(decoded.sampleRate, options.targetSampleRate ?? 22050);
  const frames = Math.max(1, Math.floor(dur * outSampleRate));

  const OAC: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OAC(outChannels, frames, outSampleRate);

  // Slice na taxa original; o OfflineAudioContext resampleia e faz downmix.
  const srcFrames = Math.max(1, Math.floor(dur * decoded.sampleRate));
  const startFrame = Math.floor(start * decoded.sampleRate);
  const slice = offline.createBuffer(
    decoded.numberOfChannels,
    srcFrames,
    decoded.sampleRate,
  );
  for (let c = 0; c < decoded.numberOfChannels; c += 1) {
    const src = decoded.getChannelData(c);
    const dst = slice.getChannelData(c);
    for (let i = 0; i < srcFrames; i += 1) dst[i] = src[startFrame + i] ?? 0;
  }

  const source = offline.createBufferSource();
  source.buffer = slice;
  source.connect(offline.destination);
  source.start(0);

  const rendered = await offline.startRendering();
  return { blob: audioBufferToWavBlob(rendered), duration: dur };
}
