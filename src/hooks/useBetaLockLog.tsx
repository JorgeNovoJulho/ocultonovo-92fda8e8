/**
 * useBetaLockLog — registro local (mock) das tentativas de CTAs bloqueados
 * durante o Beta. Nunca dispara cobrança — apenas grava no localStorage para
 * que o admin possa auditar quando e qual CTA foi impedido.
 */
import { useCallback, useEffect, useState } from 'react';
import type { BetaFeatureKey } from './useBetaGuard';

const STORAGE_KEY = 'oculto:beta:lock-log:v1';
const MAX_ENTRIES = 200;

export interface BetaLockEntry {
  id: string;
  feature: BetaFeatureKey;
  label: string;
  source: string;          // ex: 'PaidMediaOverlay', 'CreatePlanWizard'
  at: string;              // ISO timestamp
  route: string;           // window.location.pathname
}

type Listener = (entries: BetaLockEntry[]) => void;
const listeners = new Set<Listener>();

function read(): BetaLockEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: BetaLockEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota — ignore */
  }
  listeners.forEach((l) => l(entries));
}

export function recordBetaLockAttempt(input: {
  feature: BetaFeatureKey;
  label: string;
  source?: string;
}) {
  const entry: BetaLockEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    feature: input.feature,
    label: input.label,
    source: input.source ?? 'unknown',
    at: new Date().toISOString(),
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
  };
  const next = [entry, ...read()].slice(0, MAX_ENTRIES);
  write(next);
}

export function clearBetaLockLog() {
  write([]);
}

export function useBetaLockLog() {
  const [entries, setEntries] = useState<BetaLockEntry[]>(() => read());

  useEffect(() => {
    const cb: Listener = (e) => setEntries(e);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);

  const clear = useCallback(() => clearBetaLockLog(), []);

  return { entries, clear };
}
