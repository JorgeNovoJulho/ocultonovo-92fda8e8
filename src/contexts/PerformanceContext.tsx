import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, ReactNode } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import {
  detectHardware,
  buildDeviceSettings,
  type DeviceSettings,
  type PerformanceProfile,
} from '@/services/deviceManager';
import {
  subscribeFps,
  getFpsThresholds,
  type FpsSample,
} from '@/services/fpsMonitor';
import { logger } from '@/lib/logger';

const DEVICE_OVERRIDE_KEY_PREFIX = 'perf:device-override:v1:';

type StoredDeviceOverride = {
  performance: Partial<PerformanceProfile>;
  autoDowngraded: boolean;
  level: 'good' | 'degraded' | 'critical';
  updatedAt: string;
};

function readDeviceOverride(fingerprint: string): StoredDeviceOverride | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEVICE_OVERRIDE_KEY_PREFIX + fingerprint);
    return raw ? (JSON.parse(raw) as StoredDeviceOverride) : null;
  } catch {
    return null;
  }
}

function writeDeviceOverride(fingerprint: string, value: StoredDeviceOverride) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_OVERRIDE_KEY_PREFIX + fingerprint, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

interface PerformanceContextType {
  profile: PerformanceProfile;
  hardware: DeviceSettings['hardware'] | null;
  loading: boolean;
  fps: FpsSample | null;
  autoDowngraded: boolean;
  updateSetting: (key: keyof PerformanceProfile, value: any) => void;
  rescanHardware: () => Promise<void>;
}

const defaultProfile: PerformanceProfile = {
  tier: 'medium',
  showAnimations: true,
  showShadows: true,
  prefetchMedia: true,
  imageQuality: 'medium',
  dataSaver: false,
};

const PerformanceContext = createContext<PerformanceContextType>({
  profile: defaultProfile,
  hardware: null,
  loading: true,
  fps: null,
  autoDowngraded: false,
  updateSetting: () => {},
  rescanHardware: async () => {},
});

export function PerformanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [fps, setFps] = useState<FpsSample | null>(null);
  const [autoDowngraded, setAutoDowngraded] = useState(false);
  const downgradeAppliedRef = useRef(false);

  // On mount: detect hardware, check DB, save if needed
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const hw = detectHardware();
      const fingerprint = hw.deviceFingerprint;

      // Apply locally-stored downgrade override (per device) ASAP
      const localOverride = readDeviceOverride(fingerprint);
      const applyLocalOverride = (ds: DeviceSettings): DeviceSettings => {
        if (!localOverride || ds.manualOverride) return ds;
        downgradeAppliedRef.current = localOverride.autoDowngraded;
        if (localOverride.autoDowngraded) setAutoDowngraded(true);
        return {
          ...ds,
          performance: { ...ds.performance, ...localOverride.performance, prefetchMedia: true },
        };
      };

      if (!user) {
        const ds = applyLocalOverride(buildDeviceSettings(hw));
        if (!cancelled) {
          setSettings(ds);
          setLoading(false);
        }
        return;
      }

      try {
        const { data } = await supabase
          .from('profiles')
          .select('device_settings')
          .eq('user_id', user.id)
          .single();

        const saved = data?.device_settings as unknown as DeviceSettings | null;

        if (saved && saved.hardware?.deviceFingerprint === fingerprint) {
          const patchedSaved = applyLocalOverride({
            ...saved,
            performance: { ...saved.performance, prefetchMedia: true },
          });
          if (!cancelled) {
            setSettings(patchedSaved);
            setLoading(false);
          }
          return;
        }

        const ds = applyLocalOverride(buildDeviceSettings(hw));
        if (!cancelled) {
          setSettings(ds);
          setLoading(false);
        }

        await supabase
          .from('profiles')
          .update({ device_settings: ds as any })
          .eq('user_id', user.id);
      } catch {
        const ds = applyLocalOverride(buildDeviceSettings(hw));
        if (!cancelled) {
          setSettings(ds);
          setLoading(false);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [user]);

  // Apply CSS class + data-attrs to html for global performance tokens
  useEffect(() => {
    const html = document.documentElement;
    if (!settings) return;

    const { showAnimations, showShadows, tier, dataSaver } = settings.performance;

    // Reduced-motion do SO força desligar animações automaticamente
    const reducedMotion =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const effectiveAnimations = showAnimations && !reducedMotion;
    // Hardware muito fraco (tier=low) também desliga sombras pesadas
    const effectiveShadows = showShadows && tier !== 'low';

    html.classList.toggle('perf-no-animations', !effectiveAnimations);
    html.classList.toggle('perf-no-shadows', !effectiveShadows);
    html.classList.toggle('perf-reduced-motion', reducedMotion);
    html.setAttribute('data-perf-tier', tier);

    // Reflect connection saver / data-saver mode for adaptive blur etc.
    const conn = (navigator as any).connection;
    const connSaver =
      !!conn?.saveData ||
      conn?.effectiveType === '2g' ||
      conn?.effectiveType === 'slow-2g';
    // dataSaver = explícito no perfil OU detectado pela conexão OU hardware low-tier
    html.setAttribute('data-data-saver', (dataSaver || connSaver || tier === 'low') ? 'true' : 'false');

    // Reaplica quando o SO muda preferência de movimento (sem reload)
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotionChange = (e: MediaQueryListEvent) => {
      const eff = showAnimations && !e.matches;
      html.classList.toggle('perf-no-animations', !eff);
      html.classList.toggle('perf-reduced-motion', e.matches);
    };
    mql?.addEventListener?.('change', onMotionChange);

    return () => {
      html.classList.remove('perf-no-animations', 'perf-no-shadows', 'perf-reduced-motion');
      html.removeAttribute('data-perf-tier');
      html.removeAttribute('data-data-saver');
      mql?.removeEventListener?.('change', onMotionChange);
    };
  }, [settings?.performance.showAnimations, settings?.performance.showShadows, settings?.performance.tier, settings?.performance.dataSaver]);

  // ── Engine adaptativo: monitor FPS, downgrade e upgrade com HISTERESE ──
  // Downgrade: 3 janelas ruins seguidas → liga Modo Economia.
  // Upgrade: 8 janelas em fps≥recoveryFps E frameTime baixo → desliga.
  // Isso evita "flapping" perto do limiar (ex.: 38↔42fps).
  useEffect(() => {
    if (!settings) return;
    if (settings.manualOverride) return;

    const { dropsBeforeDowngrade, recoveriesBeforeUpgrade } = getFpsThresholds();

    const unsub = subscribeFps((sample) => {
      setFps(sample);

      // ── Downgrade automático ──
      if (
        !downgradeAppliedRef.current &&
        sample.status !== 'good' &&
        sample.drops >= dropsBeforeDowngrade
      ) {
        downgradeAppliedRef.current = true;
        setAutoDowngraded(true);
        setSettings((prev) => {
          if (!prev) return prev;
          const nextPerf: PerformanceProfile = {
            ...prev.performance,
            showAnimations: false,
            showShadows: false,
            dataSaver: true,
            imageQuality:
              sample.status === 'critical' ? 'low' : prev.performance.imageQuality,
          };
          writeDeviceOverride(prev.hardware.deviceFingerprint, {
            performance: {
              showAnimations: nextPerf.showAnimations,
              showShadows: nextPerf.showShadows,
              imageQuality: nextPerf.imageQuality,
              dataSaver: nextPerf.dataSaver,
            },
            autoDowngraded: true,
            level: sample.status,
            updatedAt: new Date().toISOString(),
          });
          return { ...prev, performance: nextPerf };
        });
        if (import.meta.env.DEV) logger.info('[Perf] Auto-downgrade', sample);
        return;
      }

      // ── Upgrade automático (sai do Modo Economia) ──
      // Só acontece quando o downgrade foi automático (não manual) e o
      // dispositivo não é fraco por hardware (tier !== 'low').
      if (
        downgradeAppliedRef.current &&
        sample.recoveries >= recoveriesBeforeUpgrade
      ) {
        setSettings((prev) => {
          if (!prev) return prev;
          // Se hardware é low-tier, não desliga: economia permanece sempre ativa.
          if (prev.performance.tier === 'low') return prev;
          downgradeAppliedRef.current = false;
          setAutoDowngraded(false);
          const nextPerf: PerformanceProfile = {
            ...prev.performance,
            showAnimations: true,
            showShadows: true,
            dataSaver: false,
            imageQuality: prev.performance.tier === 'high' ? 'high' : 'medium',
          };
          // Limpa override persistido
          try {
            localStorage.removeItem(DEVICE_OVERRIDE_KEY_PREFIX + prev.hardware.deviceFingerprint);
          } catch { /* ignore */ }
          if (import.meta.env.DEV) logger.info('[Perf] Auto-upgrade', sample);
          return { ...prev, performance: nextPerf };
        });
      }
    });

    return unsub;
  }, [settings?.manualOverride, settings === null]);

  const updateSetting = useCallback(
    (key: keyof PerformanceProfile, value: any) => {
      setSettings((prev) => {
        if (!prev) return prev;
        const next: DeviceSettings = {
          ...prev,
          manualOverride: true,
          performance: { ...prev.performance, [key]: value },
        };

        // Fire-and-forget save
        if (user) {
          supabase
            .from('profiles')
            .update({ device_settings: next as any })
            .eq('user_id', user.id)
            .then();
        }

        return next;
      });
    },
    [user],
  );

  const rescanHardware = useCallback(async () => {
    setLoading(true);
    const hw = detectHardware();
    const ds = buildDeviceSettings(hw);
    setSettings(ds);
    setLoading(false);

    if (user) {
      await supabase
        .from('profiles')
        .update({ device_settings: ds as any })
        .eq('user_id', user.id);
    }
  }, [user]);

  const profile = settings?.performance ?? defaultProfile;
  const hardware = settings?.hardware ?? null;

  const contextValue = useMemo(
    () => ({ profile, hardware, loading, fps, autoDowngraded, updateSetting, rescanHardware }),
    [profile, hardware, loading, fps, autoDowngraded, updateSetting, rescanHardware]
  );

  return (
    <PerformanceContext.Provider value={contextValue}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance() {
  return useContext(PerformanceContext);
}
