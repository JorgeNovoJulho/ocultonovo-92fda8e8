import { memo, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useGhostModeStatus, useToggleGhostActive } from "@/hooks/useGhostMode";
import { useAddonConfig } from "@/hooks/useAddonConfig";
import { Ghost, Eye, EyeOff, Crown, CreditCard, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { supabase } from "@/lib/supabaseExternal";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { GhostModeCheckoutModal } from "./GhostModeCheckoutModal";

export const GhostModeSettings = memo(function GhostModeSettings() {
  const { data: status, isLoading } = useGhostModeStatus();
  const { data: addonConfig } = useAddonConfig("ghost_mode");
  const toggleGhost = useToggleGhostActive();
  const permissions = usePlanPermissions();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const autoUnlockRef = useRef(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const hasGhostMode = status?.hasGhostMode || false;
  const isGhostActive = status?.isGhostActive || false;
  const price = addonConfig?.price_monthly ?? 9.9;
  const isAddonEnabled = addonConfig?.is_enabled ?? true;
  const minPlan = addonConfig?.min_plan ?? "premium";

  // Check if user's plan qualifies
  const planQualifies = permissions.isVip || permissions.isPremium || (minPlan === "free");

  // VIP auto-unlock — runs ONCE
  useEffect(() => {
    if (permissions.ghostModeFree && !hasGhostMode && user?.id && !autoUnlockRef.current) {
      autoUnlockRef.current = true;
      supabase
        .from("profiles")
        .update({ has_ghost_mode: true } as any)
        .eq("id", user.id)
        .then(() => queryClient.invalidateQueries({ queryKey: ["ghost-mode-status"] }));
    }
  }, [permissions.ghostModeFree, hasGhostMode, user?.id, queryClient]);

  const handleToggle = (checked: boolean) => {
    toggleGhost.mutate(checked);
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  // Add-on desabilitado globalmente pelo admin
  if (!isAddonEnabled) {
    return null;
  }

  // Não tem ghost mode — mostrar card de compra ou bloqueio
  if (!hasGhostMode && !permissions.ghostModeFree) {
    return (
      <>
        <Card className="bg-card/50 border-border/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Ghost className="h-5 w-5 text-primary" />
              Modo Fantasma
              <Badge className="text-xs bg-primary/10 text-primary">
                <Crown className="h-3 w-3 mr-1" />
                R$ {price.toFixed(2).replace(".", ",")}
              </Badge>
            </CardTitle>
            <CardDescription>
              Navegue de forma invisível — suas visitas não serão registradas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <Ghost className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />

              {!planQualifies ? (
                // Plano free — bloqueado
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-muted-foreground">
                      Disponível apenas para membros Premium/VIP
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Faça upgrade do seu plano para desbloquear este add-on
                  </p>
                </>
              ) : (
                // Premium/VIP — pode comprar
                <>
                  <p className="text-sm text-muted-foreground mb-1">
                    Desbloqueie por apenas
                  </p>
                  <p className="text-2xl font-bold text-primary mb-1">
                    R$ {price.toFixed(2).replace(".", ",")}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">Pagamento único</p>
                  <Button
                    onClick={() => setShowCheckout(true)}
                    className="bg-primary text-primary-foreground"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pagar e Desbloquear
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <GhostModeCheckoutModal open={showCheckout} onOpenChange={setShowCheckout} />
      </>
    );
  }

  // Tem ghost mode — toggle switch
  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ghost className={cn("h-5 w-5", isGhostActive ? "text-primary" : "text-muted-foreground")} />
          Modo Fantasma
          {isGhostActive && (
            <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">Ativo</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {isGhostActive ? "Você está navegando de forma invisível" : "Ative para navegar anonimamente"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-3">
            {isGhostActive ? (
              <EyeOff className="h-5 w-5 text-primary" />
            ) : (
              <Eye className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <Label htmlFor="ghost-mode" className="font-medium">
                {isGhostActive ? "Modo Fantasma Ativo" : "Ativar Modo Fantasma"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {isGhostActive ? "Suas visitas não estão sendo registradas" : "Suas visitas serão registradas normalmente"}
              </p>
            </div>
          </div>
          <Switch
            id="ghost-mode"
            checked={isGhostActive}
            onCheckedChange={handleToggle}
            disabled={toggleGhost.isPending}
          />
        </div>
        <div className="text-xs text-muted-foreground space-y-1 pt-3">
          <p className="flex items-center gap-1">
            <Ghost className="h-3 w-3" /> Você não aparecerá na lista de visitantes
          </p>
          <p className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> Criadores não serão notificados
          </p>
        </div>
      </CardContent>
    </Card>
  );
});
