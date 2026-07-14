import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Crown, Sparkles, Clock } from "lucide-react";
import {
  useMyProfileHighlight,
  useProfileHighlightPrice,
  useActivateHighlight,
  useDeactivateHighlight,
} from "@/hooks/useProfileHighlight";
import { useHighlightGlow, highlightGlowClass } from "@/hooks/useHighlightGlow";
import { usePerformance } from "@/contexts/PerformanceContext";
import { useEffect, useState } from "react";

function formatBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function useCountdown(expiresAt: string | null | undefined) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) return setRemaining("Expirado");
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setRemaining(`${h}h ${m}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return remaining;
}

export function ProfileHighlightCard() {
  const { data: highlight, isLoading } = useMyProfileHighlight();
  const price = useProfileHighlightPrice();
  const activate = useActivateHighlight();
  const deactivate = useDeactivateHighlight();
  const isActive = !!highlight;
  const remaining = useCountdown(highlight?.expires_at);
  const { style: glowStyle, setStyle: setGlowStyle } = useHighlightGlow();
  const { profile: perfProfile, updateSetting } = usePerformance();
  const reduceMotion = !perfProfile.showAnimations;

  const handleToggle = (checked: boolean) => {
    if (checked) {
      // Em produção: abrir checkout. Aqui ativa e cobra mock.
      const ok = window.confirm(
        `Ativar destaque dourado por 24 horas?\n\nValor: ${formatBRL(price)}\n\n(o valor será cobrado na sua forma de pagamento padrão)`
      );
      if (ok) activate.mutate(undefined);
    } else {
      const ok = window.confirm("Desativar o destaque agora? O tempo restante será perdido.");
      if (ok) deactivate.mutate();
    }
  };

  return (
    <Card className={`bg-card/50 border ${isActive ? "border-amber-400/60" : "border-border/30"}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crown className={`h-5 w-5 ${isActive ? "text-amber-400" : "text-muted-foreground"}`} />
          Destacar meu perfil
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Ative o <strong className="text-amber-400">Destaque Dourado</strong> e ganhe uma moldura
          dourada no seu card nas sugestões do feed por 24 horas. Aumenta sua visibilidade e
          conexões.
        </p>

        <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30 border border-border/40">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                {isActive ? "Destaque ativo" : "Destaque inativo"}
              </span>
            </div>
            {isActive ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Expira em <span className="text-amber-400 font-medium">{remaining}</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Custo: <strong className="text-foreground">{formatBRL(price)}</strong> · duração 24h
              </p>
            )}
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            disabled={isLoading || activate.isPending || deactivate.isPending}
            aria-label="Ativar destaque dourado do perfil"
          />
        </div>

        {/* Estilo do brilho da moldura (real-time, escolha do usuário) */}
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Estilo do brilho da moldura</p>
          <p className="text-[11px] text-muted-foreground">
            Escolha como sua moldura aparece para você quando o destaque está ativo.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(["gold", "rgb"] as const).map((opt) => {
              const selected = glowStyle === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setGlowStyle(opt)}
                  className={`relative rounded-md p-2 text-xs font-semibold transition-all ${
                    selected
                      ? "ring-2 ring-amber-400/80"
                      : "ring-1 ring-border/50 hover:ring-border"
                  }`}
                >
                  <span
                    className={`block rounded-md aspect-[3/2] mb-1 bg-card ${highlightGlowClass(opt)}`}
                    aria-hidden
                  />
                  {opt === "gold" ? "Dourado pulsante" : "RGB rotativo"}
                </button>
              );
            })}
          </div>
        </div>

        {/* Reduzir animações (acessibilidade + economia de bateria) */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-muted/20 p-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Reduzir animações</p>
            <p className="text-[11px] text-muted-foreground">
              Desabilita o glow pulsante e a rotação RGB em todo o app.
            </p>
          </div>
          <Switch
            checked={reduceMotion}
            onCheckedChange={(checked) => updateSetting("showAnimations", !checked)}
            aria-label="Reduzir animações do destaque e do app"
          />
        </div>

        {!isActive && (
          <Button
            onClick={() => handleToggle(true)}
            disabled={activate.isPending}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-semibold"
          >
            <Crown className="h-4 w-4 mr-2" />
            Ativar destaque por {formatBRL(price)}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
