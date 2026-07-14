/**
 * useFeedSyncIndicatorPref
 * Preferência local (localStorage) para ligar/desligar o badge visual
 * que aparece quando o modo do feed é sincronizado em tempo real.
 * Default: ligado.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'oculto:feedSyncIndicator:enabled';
const EVENT = 'oculto:feedSyncIndicatorPrefChanged';

const read = (): boolean => {
  try {
    if (typeof window === 'undefined') return true;
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
};

export function useFeedSyncIndicatorPref() {
  const [enabled, setEnabled] = useState<boolean>(() => read());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setEnabledPersisted = useCallback((next: boolean) => {
    try { window.localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* noop */ }
    setEnabled(next);
    try { window.dispatchEvent(new CustomEvent(EVENT, { detail: next })); } catch { /* noop */ }
  }, []);

  return { enabled, setEnabled: setEnabledPersisted };
}
