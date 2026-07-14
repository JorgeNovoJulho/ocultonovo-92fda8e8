/**
 * useTheme — Sistema de tema automático (Auto / Dark / Light).
 * Usa prefers-color-scheme + localStorage. Troca via classe CSS no <html>.
 */
import { useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'auto' | 'dark' | 'light';

const STORAGE_KEY = 'oculto-theme-mode';

function getSystemPreference(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(resolved: 'dark' | 'light') {
  const html = document.documentElement;
  if (resolved === 'dark') {
    html.classList.add('dark');
  } else {
    html.classList.remove('dark');
  }
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    // Migration v4: força DARK para TODOS uma única vez como novo padrão.
    // Após isso, o usuário pode alternar livremente — sua escolha persiste.
    const MIGRATION_KEY = 'oculto-theme-default-dark-v4';
    const migrated = localStorage.getItem(MIGRATION_KEY);
    if (!migrated) {
      localStorage.setItem(STORAGE_KEY, 'dark');
      localStorage.setItem(MIGRATION_KEY, '1');
      localStorage.removeItem('admin-theme');
      localStorage.removeItem('oculto-theme-default-dark-v1');
      localStorage.removeItem('oculto-theme-default-light-v2');
      localStorage.removeItem('oculto-theme-default-light-v3');
      return 'dark';
    }
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    return saved && ['auto', 'dark', 'light'].includes(saved) ? saved : 'dark';
  });

  const resolved = mode === 'auto' ? getSystemPreference() : mode;

  // Apply on mount and mode change
  useEffect(() => {
    applyTheme(resolved);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, resolved]);

  // Listen for system preference changes when in auto mode
  useEffect(() => {
    if (mode !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    // Also remove legacy key to avoid conflicts
    localStorage.removeItem('admin-theme');
  }, []);

  return { mode, resolved, setMode };
}
