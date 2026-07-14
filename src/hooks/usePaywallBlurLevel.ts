import { useEffect, useState, useCallback } from 'react';

export type PaywallBlurLevel = 'auto' | 'low' | 'medium' | 'high';
const STORAGE_KEY = 'paywall:blur-level:v1';

function read(): PaywallBlurLevel {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY) as PaywallBlurLevel | null;
  return v && ['auto', 'low', 'medium', 'high'].includes(v) ? v : 'auto';
}

function apply(level: PaywallBlurLevel) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-paywall-blur', level);
}

export function usePaywallBlurLevel() {
  const [level, setLevel] = useState<PaywallBlurLevel>(read);

  useEffect(() => { apply(level); }, [level]);

  const update = useCallback((next: PaywallBlurLevel) => {
    setLevel(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return { level, setLevel: update };
}

/** Apply on app boot so the attribute exists before first paint of paywall. */
export function bootPaywallBlurLevel() {
  apply(read());
}
