import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

/**
 * Banner sutil que aparece quando navigator.onLine === false.
 * Posicionado no topo, respeita safe-area-inset-top.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground text-sm font-medium px-3 py-2 flex items-center justify-center gap-2 shadow-md"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
    >
      <WifiOff className="h-4 w-4" />
      <span>Você está sem conexão.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="ml-2 inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-80"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Tentar novamente
      </button>
    </div>
  );
}

export default OfflineBanner;
