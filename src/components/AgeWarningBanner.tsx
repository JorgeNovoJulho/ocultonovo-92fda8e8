import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, X } from "lucide-react";
import { Link } from "react-router-dom";
import { saveTermsConsent, hasAcceptedCurrentTerms, TERMS_ROUTE, TERMS_VERSION } from "@/lib/termsConsent";

export function AgeWarningBanner() {
  // Não exibir em páginas públicas de convite nem em links públicos
  // de compartilhamento do OCULTO PLAY (/play/p/:id e /play/share/:id).
  if (typeof window !== 'undefined' && (
    /^\/creator-invite(\/|$)/.test(window.location.pathname) ||
    /^\/play\/(p|share)\//.test(window.location.pathname)
  )) {
    return null;
  }

  const [isVisible, setIsVisible] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  useEffect(() => {
    // Consentimento é persistente: se o usuário já confirmou idade (localStorage)
    // E aceitou a versão ATUAL dos Termos, o modal não reaparece após reload,
    // hard-reset do ErrorBoundary, atualização do Service Worker ou troca de aba.
    // O sessionStorage é apenas um cache rápido — não a fonte da verdade.
    const sessionOk = sessionStorage.getItem("oculto_age_confirmed_session") === "true";
    const ageOkPersist = localStorage.getItem("oculto_age_confirmed") === "true";
    const termsOk = hasAcceptedCurrentTerms();

    if (sessionOk || (ageOkPersist && termsOk)) {
      // Re-hidrata o flag de sessão para próximos consumidores que dependem dele
      try { sessionStorage.setItem("oculto_age_confirmed_session", "true"); } catch {}
      setHasConfirmed(true);
      return;
    }

    setIsVisible(true);
    // Pré-marca o que já tiver sido aceito antes, acelerando o "Entrar"
    setAgeChecked(ageOkPersist);
    setTermsChecked(termsOk);
  }, []);

  const handleConfirm = () => {
    if (!ageChecked || !termsChecked) return;
    localStorage.setItem("oculto_age_confirmed", "true");
    sessionStorage.setItem("oculto_age_confirmed_session", "true");
    saveTermsConsent("age-banner");
    setHasConfirmed(true);
    setIsVisible(false);
  };

  const handleExit = () => {
    window.location.href = "https://www.google.com";
  };

  if (hasConfirmed || !isVisible) return null;

  const canProceed = ageChecked && termsChecked;

  return (
    <div className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-md flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-4">
          Aviso de Conteúdo Adulto
        </h2>

        <p className="text-muted-foreground mb-6 leading-relaxed">
          Este site contém material adulto restrito a <strong className="text-foreground">maiores de 18 anos</strong>.
          Para continuar, confirme sua idade e o aceite dos Termos de Uso atualizados.
        </p>

        <div className="bg-muted/30 rounded-lg p-4 mb-4 text-left space-y-3">
          <label className="flex items-start gap-2 cursor-pointer text-xs text-muted-foreground">
            <Checkbox
              checked={ageChecked}
              onCheckedChange={(v) => setAgeChecked(!!v)}
              className="mt-0.5"
            />
            <span>
              Declaro, sob as penas da lei, que tenho <strong className="text-foreground">18 anos ou mais</strong>.
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer text-xs text-muted-foreground">
            <Checkbox
              checked={termsChecked}
              onCheckedChange={(v) => setTermsChecked(!!v)}
              className="mt-0.5"
            />
            <span>
              Li e aceito os{" "}
              <Link to={TERMS_ROUTE} target="_blank" className="text-primary hover:underline">
                Termos de Uso
              </Link>{" "}
              e a{" "}
              <Link to="/legal/privacidade" target="_blank" className="text-primary hover:underline">
                Política de Privacidade
              </Link>.
            </span>
          </label>
          <p className="text-[10px] text-muted-foreground/70">
            Versão dos Termos: <span className="font-mono">{TERMS_VERSION}</span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={handleExit}
            variant="outline"
            className="flex-1 h-12 border-border/50"
          >
            <X className="h-4 w-4 mr-2" />
            Sair
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canProceed}
            className="flex-1 h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold disabled:opacity-50"
          >
            Entrar
          </Button>
        </div>
      </div>
    </div>
  );
}
