/**
 * PushSoftPrompt — Banner elegante e não invasivo
 * Aparece 5s após o login, apenas uma vez por sessão.
 * Explica o benefício das notificações antes de pedir permissão.
 * Respeita recusa: se o utilizador clicar "Agora não", não aparece mais na sessão.
 */
import { useEffect, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X, Zap, MessageSquare, Heart, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/hooks/useAuth";

const SESSION_KEY = "push_prompt_dismissed";
const DELAY_MS = 5000; // 5s após login

const BENEFITS = [
  { icon: <MessageSquare className="h-3.5 w-3.5" />, text: "Novas mensagens" },
  { icon: <Heart className="h-3.5 w-3.5" />, text: "Matches & likes" },
  { icon: <Shield className="h-3.5 w-3.5" />, text: "Status do Selo Oculto" },
];

export function PushSoftPrompt() {
  const { user } = useAuth();
  const {
    isSupported,
    permission,
    vapidConfigured,
    isInIframe,
    isEnabled,
    requestPermission,
    isLoading,
  } = usePushNotifications();

  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Condições para NÃO mostrar
    if (!user) return;
    if (!isSupported) return;
    if (!vapidConfigured) return;
    if (isInIframe) return;
    if (isEnabled) return;
    if (permission !== "default") return; // já concedido ou negado
    if (sessionStorage.getItem(SESSION_KEY)) return; // já recusou nesta sessão

    timerRef.current = setTimeout(() => {
      setVisible(true);
    }, DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, isSupported, vapidConfigured, isInIframe, isEnabled, permission]);

  // Fechar sem ativar
  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(false);
  };

  // Ativar e fechar
  const handleActivate = async () => {
    const granted = await requestPermission();
    if (granted || permission !== "default") {
      sessionStorage.setItem(SESSION_KEY, "1");
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.95 }}
          transition={{ type: "spring", damping: 22, stiffness: 280 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9998] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="relative bg-card border border-primary/40 rounded-2xl shadow-2xl shadow-primary/20 overflow-hidden">
            {/* Gradient top bar */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-secondary to-primary" />

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-4 pt-5">
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/25 shrink-0">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground leading-tight">
                    Fica sempre ligado à comunidade
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    Activa as notificações para não perderes nenhum momento importante.
                  </p>
                </div>
              </div>

              {/* Benefits chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {BENEFITS.map(({ icon, text }) => (
                  <span
                    key={text}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-muted/60 border border-border/40 text-muted-foreground"
                  >
                    <span className="text-primary">{icon}</span>
                    {text}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-9 text-xs text-muted-foreground"
                  onClick={handleDismiss}
                >
                  Agora não
                </Button>
                <Button
                  size="sm"
                  className="flex-[2] h-9 text-xs gap-1.5 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                  onClick={handleActivate}
                  disabled={isLoading}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Ativar notificações
                </Button>
              </div>

              <p className="text-[10px] text-muted-foreground text-center mt-2">
                Podes gerir ou desativar a qualquer momento nas Definições.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
