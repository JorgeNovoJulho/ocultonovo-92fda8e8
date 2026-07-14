import { beforeEach, describe, expect, it, vi } from 'vitest';

class AudioMock {
  static instances: AudioMock[] = [];
  static audiblePlayCalls = 0;
  static totalPlayCalls = 0;
  static forceBlockAllPlayback = false;

  preload = '';
  volume = 1;
  muted = false;
  currentTime = 0;
  src = '';
  play = vi.fn<() => Promise<void>>(async () => {
    AudioMock.totalPlayCalls += 1;
    if (AudioMock.forceBlockAllPlayback) {
      throw new Error('autoplay blocked');
    }
    const activated = Boolean((navigator as any)?.userActivation?.hasBeenActive);
    if (!activated) {
      throw new Error('autoplay blocked');
    }
    if (!this.muted && this.volume > 0) {
      AudioMock.audiblePlayCalls += 1;
    }
  });
  pause = vi.fn();
  setAttribute = vi.fn();

  constructor(src: string) {
    this.src = src;
    AudioMock.instances.push(this);
  }
}

describe('messageSound', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    localStorage.clear();
    AudioMock.instances = [];
    AudioMock.audiblePlayCalls = 0;
    AudioMock.totalPlayCalls = 0;
    AudioMock.forceBlockAllPlayback = false;

    Object.defineProperty(window, 'Audio', {
      configurable: true,
      writable: true,
      value: AudioMock,
    });
    Object.defineProperty(globalThis, 'Audio', {
      configurable: true,
      writable: true,
      value: AudioMock,
    });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        userActivation: { hasBeenActive: false },
        vibrate: vi.fn(() => true),
      },
    });
  });

  it('toca a notificação pendente após destravar o áudio no toque seguinte', async () => {
    const sound = await import('@/lib/messageSound');

    sound.playNewMessageSound();
    expect(AudioMock.audiblePlayCalls).toBe(0);

    (navigator as any).userActivation.hasBeenActive = true;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(AudioMock.instances.length).toBeGreaterThan(0);
    expect(AudioMock.audiblePlayCalls).toBe(1);
  });

  it('rearma o unlock no mobile quando a primeira tentativa de prime falha', async () => {
    const sound = await import('@/lib/messageSound');

    AudioMock.forceBlockAllPlayback = true;

    (navigator as any).userActivation.hasBeenActive = true;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();

    expect(AudioMock.audiblePlayCalls).toBe(0);

    sound.playNewMessageSound('message:mobile-retry');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(AudioMock.audiblePlayCalls).toBe(0);

    AudioMock.forceBlockAllPlayback = false;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(AudioMock.audiblePlayCalls).toBe(1);
  });

  it('deduplica o mesmo evento de mensagem para não tocar múltiplas vezes', async () => {
    const sound = await import('@/lib/messageSound');

    (navigator as any).userActivation.hasBeenActive = true;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    AudioMock.audiblePlayCalls = 0;

    sound.playNewMessageSound('message:abc');
    sound.playNewMessageSound('message:abc');
    await Promise.resolve();

    expect(AudioMock.audiblePlayCalls).toBe(1);
  });

  it('E2E: desbloqueia via keydown e toca som pendente (acessibilidade teclado)', async () => {
    const sound = await import('@/lib/messageSound');

    sound.playNewMessageSound('message:kb-1');
    expect(AudioMock.audiblePlayCalls).toBe(0);

    (navigator as any).userActivation.hasBeenActive = true;
    window.dispatchEvent(new Event('keydown'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(AudioMock.audiblePlayCalls).toBe(1);
  });

  it('E2E: dispara vibração ao tocar mensagem recebida', async () => {
    const sound = await import('@/lib/messageSound');
    const vibrateSpy = (navigator as any).vibrate as ReturnType<typeof vi.fn>;

    (navigator as any).userActivation.hasBeenActive = true;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();

    sound.playNewMessageSound('message:vib-1');
    expect(vibrateSpy).toHaveBeenCalled();
  });

  it('E2E: gestos repetidos não recriam pool nem disparam play indevidamente', async () => {
    const sound = await import('@/lib/messageSound');

    (navigator as any).userActivation.hasBeenActive = true;
    window.dispatchEvent(new Event('pointerdown'));
    await Promise.resolve();
    await Promise.resolve();

    const audibleAfterFirst = AudioMock.audiblePlayCalls;

    // Subsequentes gestos não devem reproduzir som (não há pendente).
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('touchstart'));
    await Promise.resolve();

    expect(AudioMock.audiblePlayCalls).toBe(audibleAfterFirst);

    // Mas uma nova mensagem após desbloqueio toca imediatamente.
    sound.playNewMessageSound('message:after-unlock');
    await Promise.resolve();
    expect(AudioMock.audiblePlayCalls).toBe(audibleAfterFirst + 1);
  });
});
