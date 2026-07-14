const TARGET_SAMPLE_RATE = 22050;

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}

function pcm16WavFromMono(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function createAudioPreviewClip(
  file: Blob,
  startSeconds: number,
  lengthSeconds: number,
): Promise<Blob | null> {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const srcCtx = new AudioCtx();
  try {
    const input = await file.arrayBuffer();
    const decoded = await srcCtx.decodeAudioData(input.slice(0));
    const start = Math.max(0, Math.min(startSeconds || 0, Math.max(0, decoded.duration - 0.25)));
    const len = Math.max(5, Math.min(30, lengthSeconds || 30, decoded.duration - start));
    const frameCount = Math.max(1, Math.floor(len * TARGET_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    const gain = offline.createGain();
    gain.gain.value = 0.92;
    source.connect(gain).connect(offline.destination);
    source.start(0, start, len);
    const rendered = await offline.startRendering();
    return pcm16WavFromMono(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
  } catch {
    return null;
  } finally {
    try { await srcCtx.close(); } catch { /* noop */ }
  }
}