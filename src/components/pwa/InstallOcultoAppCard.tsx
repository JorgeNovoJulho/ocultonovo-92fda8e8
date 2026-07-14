import { useEffect, useState } from "react";
import { Download, X, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { usePWASettings } from "@/hooks/usePWASettings";
import { useToast } from "@/hooks/use-toast";

const DISMISS_KEY = "oculto_install_card_dismissed_at";
const DISMISS_DAYS = 14;

interface Props {
  variant?: "default" | "compact" | "feed";
  className?: string;
}

/**
 * Card "Instale o OCULTO" — wrapper visual do InstallAppButton.
 * - Oculta quando isInstalled.
 * - Respeita platform_runtime_settings.pwa_install_banner_enabled.
 * - Dismiss persistido em localStorage por 14 dias.
 */
export function InstallOcultoAppCard({ variant = "default", className = "" }: Props) {
  const { isInstalled, isIOS, install, hasNativePrompt } = usePWAInstall();
  const { settings } = usePWASettings();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return;
      const at = Number(raw);
      if (!Number.isFinite(at)) return;
      const days = (Date.now() - at) / (1000 * 60 * 60 * 24);
      if (days < DISMISS_DAYS) setDismissed(true);
    } catch { /* noop */ }
  }, []);

  if (isInstalled) return null;
  if (dismissed) return null;
  if (settings && settings.pwa_install_banner_enabled === false) return null;

  const handleInstall = async () => {
    if (hasNativePrompt) {
      const res = await install();
      if (res.outcome === "accepted") {
        toast({ title: "OCULTO instalado!", description: "Acesse pelo ícone na sua tela inicial." });
      }
      return;
    }
    // Sem prompt nativo (iOS, desktop sem suporte): leva para a página /instalar
    window.location.href = "/instalar";
  };

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
    setDismissed(true);
  };

  return (
    <Card
      className={`relative overflow-hidden border-amber-500/30 bg-gradient-to-br from-black via-zinc-950 to-amber-950/20 ${className}`}
    >
      <button
        type="button"
        aria-label="Dispensar"
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className={variant === "compact" ? "p-4" : "p-5"}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Instale o OCULTO no seu celular
            </h3>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Acesso instantâneo, notificações em tempo real e experiência fullscreen como um app nativo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={handleInstall}
                className="gap-2 bg-amber-500 text-black hover:bg-amber-400 font-semibold"
              >
                <Download className="h-4 w-4" />
                {hasNativePrompt ? "Instalar agora" : isIOS ? "Ver instruções" : "Como instalar"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default InstallOcultoAppCard;
