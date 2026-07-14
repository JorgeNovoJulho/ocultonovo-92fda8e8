import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useInvisibleModeStatus, useToggleInvisibleMode } from "@/hooks/useInvisibleMode";
import { PremiumUpgradeModal } from "@/components/PremiumUpgradeModal";
import { EyeOff, Eye, Crown, Loader2, Radar, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function InvisibleModeSettings() {
  const { data: status, isLoading } = useInvisibleModeStatus();
  const toggleInvisible = useToggleInvisibleMode();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const isInvisible = status?.isInvisible || false;
  const isVip = status?.isVip || false;

  const handleToggle = (checked: boolean) => {
    if (!isVip) {
      setShowUpgrade(true);
      return;
    }
    toggleInvisible.mutate(checked);
  };

  if (isLoading) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card/50 border-border/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <EyeOff className={cn(
              "h-5 w-5 transition-colors",
              isInvisible ? "text-primary" : "text-muted-foreground"
            )} />
            Modo Invisível
            <Badge className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-background text-xs">
              <Crown className="h-3 w-3 mr-1" />
              VIP
            </Badge>
            {isInvisible && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                Ativo
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isInvisible
              ? "Você está invisível — ninguém pode te encontrar"
              : "Ative para desaparecer do radar e ficar offline"
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Main Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              {isInvisible ? (
                <EyeOff className="h-5 w-5 text-primary" />
              ) : (
                <Eye className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <Label htmlFor="invisible-mode" className="font-medium">
                  {isInvisible ? "Modo Invisível Ativo" : "Ativar Modo Invisível"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isInvisible
                    ? "Você não aparece no radar nem como online"
                    : "Desapareça completamente do radar"
                  }
                </p>
              </div>
            </div>
            <Switch
              id="invisible-mode"
              checked={isInvisible}
              onCheckedChange={handleToggle}
              disabled={toggleInvisible.isPending}
            />
          </div>

          {/* Info bullets */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2">
            <p className="flex items-center gap-1">
              <Radar className="h-3 w-3" />
              Você some do radar para todos os usuários
            </p>
            <p className="flex items-center gap-1">
              <Wifi className="h-3 w-3" />
              Seu status online é forçado para offline
            </p>
            <p className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              Você continua vendo e interagindo normalmente
            </p>
          </div>
        </CardContent>
      </Card>

      <PremiumUpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Modo Invisível"
      />
    </>
  );
}
