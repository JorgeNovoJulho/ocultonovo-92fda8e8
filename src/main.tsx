import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { bootPaywallBlurLevel } from "@/hooks/usePaywallBlurLevel";
import { startAppVersionWatcher } from "@/lib/appVersion";
import { runForceUpdateFromServer } from "@/lib/forceUpdateFromServer";

// ─── Silenciar console.log/debug/info em produção (mantém warn/error) ───
// Reduz ruído nos logs do browser sem perder erros críticos para Sentry/debug.
if (!import.meta.env.DEV) {
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
}

// ─── Arquivo de uma versão anterior não existe mais (novo deploy) ───
// O Vite dispara `vite:preloadError` quando um import dinâmico falha. Em vez
// de cair na tela "Algo deu errado", recarrega UMA vez para pegar a versão nova.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    try {
      const KEY = "__oculto_preload_reload";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 30_000) return; // evita loop
      sessionStorage.setItem(KEY, String(Date.now()));
      event.preventDefault();
      window.location.reload();
    } catch { /* deixa o ErrorBoundary tratar */ }
  });
}

bootPaywallBlurLevel();
startAppVersionWatcher();
// Atraso pequeno para não disputar com o boot inicial; corre em background.
setTimeout(() => { void runForceUpdateFromServer(); }, 4500);

const APP_BUILD_MARKER = "Oculto External DB v4.0";
if (import.meta.env.DEV) {
  console.info(`[Build Marker] ${APP_BUILD_MARKER}`);
}

// Captura cedo o prompt nativo de instalação, antes do React terminar de montar.
// Sem isso o navegador pode disparar o evento antes do botão de instalar existir.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as any).__ocultoDeferredPWAInstallPrompt = event;
    try { window.dispatchEvent(new Event("oculto:pwa-prompt-ready")); } catch { /* ignore */ }
  });
}

// ─── Register Service Worker so the browser fires `beforeinstallprompt` ───
// Required for the "Install app" 1-click flow to work. We skip registration
// inside Lovable's preview iframe (causes stale caches & blocks install).
(function registerPWA() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const inIframe = window.self !== window.top;
    if (inIframe) return;
  } catch { return; }
  const host = window.location.hostname;
  const isPreview =
    host.includes("id-preview--") || host.includes("lovableproject.com");
  if (isPreview) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[PWA] SW register failed:", err));
  });
})();

createRoot(document.getElementById("root")!).render(<App />);
