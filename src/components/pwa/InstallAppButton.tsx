import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Check, Download, Share, Plus, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useToast } from "@/hooks/use-toast";

interface InstallAppButtonProps {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  fullWidth?: boolean;
  label?: string;
  className?: string;
  /** Auto-trigger native prompt (or guide modal) on mount, once */
  autoPrompt?: boolean;
  /** Hide the button when already installed (default true). When false, shows a confirmed/disabled state. */
  hideWhenInstalled?: boolean;
  /** Where this CTA lives. Used to enforce a single visible CTA across the UI. */
  surface?: "settings" | "sidebar" | "drawer" | "signup" | "other";
}

/**
 * Cross-platform "Install App" button.
 * - Android/Chrome/Edge: native install prompt
 * - iOS Safari: Share -> Add to Home Screen modal
 * - Desktop / fallback: shows browser-specific instructions
 */
export function InstallAppButton({
  variant = "outline",
  size = "default",
  fullWidth = false,
  label = "Instalar app na tela inicial",
  className = "",
  autoPrompt = false,
  hideWhenInstalled = true,
  surface = "other",
}: InstallAppButtonProps) {
  const { isInstalled, isIOS, install, hasNativePrompt } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [autoFired, setAutoFired] = useState(false);
  const { toast } = useToast();
  const location = useLocation();

  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isInsidePreviewFrame = (() => {
    if (typeof window === "undefined") return false;
    try { return window.self !== window.top; } catch { return true; }
  })();

  // Single-CTA rule: on /settings, suppress sidebar/drawer copies (Settings owns the canonical CTA).
  const onSettingsRoute = location.pathname.startsWith("/settings");
  const suppressedByRoute = onSettingsRoute && (surface === "sidebar" || surface === "drawer");

  const handleClick = async () => {
    if (hasNativePrompt) {
      const res = await install();
      if (res.outcome === "accepted") {
        toast({ title: "App instalado!", description: "Acesse pelo ícone na sua tela inicial." });
      }
      return;
    }
    setShowGuide(true);
  };

  // Auto-prompt once per device (persisted in localStorage)
  const AUTO_PROMPT_KEY = "oculto_pwa_autoprompt_shown_v1";
  useEffect(() => {
    if (!autoPrompt || autoFired || isInstalled) return;
    try {
      if (localStorage.getItem(AUTO_PROMPT_KEY) === "1") {
        setAutoFired(true);
        return;
      }
    } catch { /* ignore */ }

    const markShown = () => { try { localStorage.setItem(AUTO_PROMPT_KEY, "1"); } catch { /* ignore */ } };

    if (hasNativePrompt) {
      setAutoFired(true);
      markShown();
      handleClick();
    } else if (isMobile) {
      setAutoFired(true);
      markShown();
      setShowGuide(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt, hasNativePrompt, isInstalled, isMobile]);

  if (suppressedByRoute) return null;

  if (isInstalled) {
    if (hideWhenInstalled) return null;
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled
        aria-disabled="true"
        className={`${fullWidth ? "w-full" : ""} gap-2 cursor-default opacity-90 ${className}`}
      >
        <Check className="h-4 w-4 text-primary" />
        App instalado neste dispositivo
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        className={`${fullWidth ? "w-full" : ""} gap-2 ${className}`}
      >
        <Download className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isMobile ? <Smartphone className="h-5 w-5 text-primary" /> : <Monitor className="h-5 w-5 text-primary" />}
              Instalar OCULTO
            </DialogTitle>
            <DialogDescription>
              {hasNativePrompt
                ? "Toque no botão abaixo para instalar agora."
                : isIOS
                ? "No iPhone/iPad a instalação é feita pelo Safari em 2 toques."
                : isInsidePreviewFrame
                ? "A prévia do editor não pode instalar PWAs. Abra o domínio oficial e use o botão Instalar app do navegador."
                : "Seu navegador instala pela barra de endereço ou pelo menu do navegador."}
            </DialogDescription>
          </DialogHeader>

          {/* Primary one-click action */}
          {hasNativePrompt ? (
            <Button
              type="button"
              size="lg"
              className="w-full gap-2"
              onClick={async () => {
                const res = await install();
                if (res.outcome === "accepted") {
                  toast({ title: "App instalado!", description: "Abra pelo ícone na sua tela inicial." });
                  setShowGuide(false);
                }
              }}
            >
              <Download className="h-4 w-4" />
              Instalar agora
            </Button>
          ) : isIOS ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                <p className="flex items-center gap-2">
                  <Share className="h-4 w-4 text-primary shrink-0" />
                  <span>1. Toque em <strong>Compartilhar</strong> na barra do Safari.</span>
                </p>
                <p className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary shrink-0" />
                  <span>2. Toque em <strong>Adicionar à Tela de Início</strong>.</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Importante: use o navegador <strong>Safari</strong>. Outros navegadores no iOS não permitem instalar.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  O Chrome/Edge só libera a janela nativa de instalação quando o site está aberto
                  diretamente no domínio oficial e o navegador já confirmou que ele é instalável.
                </p>
                <p>
                  Se você está na prévia do Lovable, este botão não consegue instalar daqui.
                  Abra <strong>ocultoswing.com.br</strong> na aba principal e use o ícone de instalação
                  na barra de endereço ou o menu do navegador → <strong>Instalar app</strong>.
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full gap-2"
                onClick={async () => {
                  const nativeRes = await install();
                  if (nativeRes.outcome === "accepted") {
                    toast({ title: "App instalado!", description: "Abra pelo ícone na sua tela inicial." });
                    setShowGuide(false);
                    return;
                  }

                  const target = "https://ocultoswing.com.br/?pwa=install";
                  try {
                    if (isInsidePreviewFrame && window.top) {
                      // Sai do iframe levando a aba inteira para o domínio oficial
                      window.top.location.href = target;
                      return;
                    }
                  } catch { /* cross-origin: cai no fallback */ }
                  // Mesma aba (sem iframe) — o navegador habilita o instalador
                  window.location.href = target;
                }}
              >
                <Download className="h-4 w-4" />
                Abrir e instalar agora
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setShowGuide(false)}
              >
                Fechar
              </Button>
            </div>
          )}

        </DialogContent>
      </Dialog>
    </>
  );
}
