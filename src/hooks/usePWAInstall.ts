import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __ocultoDeferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

/**
 * Hook for PWA installation. Detects native install prompt (Chrome/Edge/Android),
 * iOS Safari standalone state, and exposes a unified install() helper.
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const INSTALLED_KEY = "oculto_pwa_installed_v1";

  useEffect(() => {
    // Detect iOS
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Detect already installed (display-mode standalone, iOS standalone, or persisted flag)
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const standalone =
      mql?.matches ||
      (window.navigator as any).standalone === true ||
      (() => { try { return localStorage.getItem(INSTALLED_KEY) === "1"; } catch { return false; } })();
    setIsInstalled(!!standalone);
    if (standalone) {
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ }
    }

    const markInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ }
      // Notify other hook instances in the same tab
      try { window.dispatchEvent(new Event("oculto:pwa-installed")); } catch { /* ignore */ }
    };

    const syncStoredPrompt = () => {
      if (window.__ocultoDeferredPWAInstallPrompt) {
        setDeferredPrompt(window.__ocultoDeferredPWAInstallPrompt);
      }
    };

    syncStoredPrompt();

    const onPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      window.__ocultoDeferredPWAInstallPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      try { window.dispatchEvent(new Event("oculto:pwa-prompt-ready")); } catch { /* ignore */ }
    };
    const onInstalled = () => markInstalled();
    const onDisplayChange = (e: MediaQueryListEvent) => { if (e.matches) markInstalled(); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === INSTALLED_KEY && e.newValue === "1") setIsInstalled(true);
    };
    const onCustom = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("storage", onStorage);
    window.addEventListener("oculto:pwa-installed", onCustom);
    window.addEventListener("oculto:pwa-prompt-ready", syncStoredPrompt);
    mql?.addEventListener?.("change", onDisplayChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("oculto:pwa-installed", onCustom);
      window.removeEventListener("oculto:pwa-prompt-ready", syncStoredPrompt);
      mql?.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const install = useCallback(async () => {
    const promptEvent = deferredPrompt || window.__ocultoDeferredPWAInstallPrompt;
    if (!promptEvent) return { outcome: "unavailable" as const };

    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    window.__ocultoDeferredPWAInstallPrompt = null;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
      try { localStorage.setItem(INSTALLED_KEY, "1"); } catch { /* ignore */ }
      try { window.dispatchEvent(new Event("oculto:pwa-installed")); } catch { /* ignore */ }
    }
    return { outcome: choice.outcome };
  }, [deferredPrompt]);

  // Available when there's a native prompt OR when on iOS (we'll show instructions)
  const canInstall = !isInstalled && (!!deferredPrompt || isIOS);

  return { canInstall, isInstalled, isIOS, install, hasNativePrompt: !!deferredPrompt };
}
