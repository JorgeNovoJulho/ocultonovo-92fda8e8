/**
 * useFabEnabled — Preferência do usuário para exibir o botão flutuante
 * de criar publicação (FAB) no mobile. Padrão: DESATIVADO.
 * Persistido em localStorage e sincronizado entre abas/instâncias.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "oculto-fab-enabled-v2";
const EVENT_NAME = "oculto-fab-enabled-change";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false; // default: disabled
    return raw === "1";
  } catch {
    return false;
  }
}

export function useFabEnabled() {
  const [enabled, setEnabled] = useState<boolean>(() => read());

  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT_NAME, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT_NAME, sync);
    };
  }, []);

  const setFabEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {}
    setEnabled(value);
    try {
      window.dispatchEvent(new Event(EVENT_NAME));
    } catch {}
  }, []);

  const toggleFab = useCallback(() => setFabEnabled(!read()), [setFabEnabled]);

  return { enabled, setFabEnabled, toggleFab };
}

