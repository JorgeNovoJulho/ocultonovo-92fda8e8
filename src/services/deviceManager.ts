// Ultra-fast hardware detection — non-blocking, runs once per device fingerprint

export interface HardwareInfo {
  cpuCores: number;
  ramGB: number | null;
  gpu: string;
  deviceFingerprint: string;
}

export interface PerformanceProfile {
  tier: 'low' | 'medium' | 'high';
  showAnimations: boolean;
  showShadows: boolean;
  prefetchMedia: boolean;
  imageQuality: 'low' | 'medium' | 'high';
  /** "Modo Economia" — reduz overscan, conteúdo secundário e qualidade visual.
   * Auto-ativado em hardware fraco (tier=low) ou quando o FPS cai. */
  dataSaver: boolean;
}

export interface DeviceSettings {
  hardware: HardwareInfo;
  performance: PerformanceProfile;
  detectedAt: string;
  manualOverride: boolean;
}

function getGPUInfo(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl && gl instanceof WebGLRenderingContext) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Unknown';
      }
    }
    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function getDeviceFingerprint(hw: Omit<HardwareInfo, 'deviceFingerprint'>): string {
  return btoa(`${hw.cpuCores}-${hw.ramGB}-${hw.gpu.slice(0, 20)}`).slice(0, 16);
}

export function detectHardware(): HardwareInfo {
  const nav = navigator as any;
  const cpuCores = nav.hardwareConcurrency || 4;
  const ramGB = nav.deviceMemory ?? null; // may be undefined in some browsers

  const gpu = getGPUInfo();
  const partial = { cpuCores, ramGB, gpu };

  return {
    ...partial,
    deviceFingerprint: getDeviceFingerprint(partial),
  };
}

export function computePerformanceProfile(hw: HardwareInfo): PerformanceProfile {
  const ram = hw.ramGB ?? 4; // assume medium if unknown
  const cores = hw.cpuCores;

  if (ram < 4 || cores < 4) {
    return {
      tier: 'low',
      showAnimations: false,
      showShadows: false,
      prefetchMedia: true,
      imageQuality: 'low',
      dataSaver: true,
    };
  }

  if (ram >= 8 && cores >= 8) {
    return {
      tier: 'high',
      showAnimations: true,
      showShadows: true,
      prefetchMedia: true,
      imageQuality: 'high',
      dataSaver: false,
    };
  }

  return {
    tier: 'medium',
    showAnimations: true,
    showShadows: true,
    prefetchMedia: true,
    imageQuality: 'medium',
    dataSaver: false,
  };
}

export function buildDeviceSettings(hw: HardwareInfo): DeviceSettings {
  return {
    hardware: hw,
    performance: computePerformanceProfile(hw),
    detectedAt: new Date().toISOString(),
    manualOverride: false,
  };
}
