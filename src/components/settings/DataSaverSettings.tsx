import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataSaver } from "@/hooks/useDataSaver";
import { Wifi, WifiOff, Zap, Image, Video, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataSaverSettings() {
  const { 
    isDataSaverEnabled, 
    connectionType, 
    enableDataSaver, 
    disableDataSaver,
    shouldLoadVideo,
    shouldLoadHDImages,
  } = useDataSaver();

  const getConnectionIcon = () => {
    switch (connectionType) {
      case '4g':
        return <Wifi className="h-4 w-4 text-[hsl(142,76%,46%)]" />;
      case '3g':
        return <Wifi className="h-4 w-4 text-[hsl(45,93%,47%)]" />;
      case '2g':
      case 'slow-2g':
        return <WifiOff className="h-4 w-4 text-destructive" />;
      default:
        return <Wifi className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getConnectionLabel = () => {
    switch (connectionType) {
      case '4g':
        return 'Conexão Rápida (4G)';
      case '3g':
        return 'Conexão Moderada (3G)';
      case '2g':
        return 'Conexão Lenta (2G)';
      case 'slow-2g':
        return 'Conexão Muito Lenta';
      default:
        return 'Conexão Desconhecida';
    }
  };

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-5 w-5 text-primary" />
          Modo Economia de Dados
        </CardTitle>
        <CardDescription>
          Reduza o consumo de dados desativando vídeos e imagens em alta definição
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            {getConnectionIcon()}
            <span className="text-sm">{getConnectionLabel()}</span>
          </div>
          <Gauge className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Main Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="data-saver" className="font-medium">
              Ativar Economia de Dados
            </Label>
            <p className="text-xs text-muted-foreground">
              Ideal para conexões lentas ou planos limitados
            </p>
          </div>
          <Switch
            id="data-saver"
            checked={isDataSaverEnabled}
            onCheckedChange={(checked) => checked ? enableDataSaver() : disableDataSaver()}
          />
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className={cn(
            "flex items-center gap-2 p-3 rounded-lg border transition-colors",
            shouldLoadVideo 
              ? "border-[hsl(142,76%,46%)]/30 bg-[hsl(142,76%,46%)]/5" 
              : "border-destructive/30 bg-destructive/5"
          )}>
            <Video className={cn(
              "h-4 w-4",
              shouldLoadVideo ? "text-[hsl(142,76%,46%)]" : "text-destructive"
            )} />
            <span className="text-xs">
              Vídeos {shouldLoadVideo ? "Ativos" : "Desativados"}
            </span>
          </div>
          
          <div className={cn(
            "flex items-center gap-2 p-3 rounded-lg border transition-colors",
            shouldLoadHDImages 
              ? "border-[hsl(142,76%,46%)]/30 bg-[hsl(142,76%,46%)]/5" 
              : "border-destructive/30 bg-destructive/5"
          )}>
            <Image className={cn(
              "h-4 w-4",
              shouldLoadHDImages ? "text-[hsl(142,76%,46%)]" : "text-destructive"
            )} />
            <span className="text-xs">
              HD {shouldLoadHDImages ? "Ativo" : "Desativado"}
            </span>
          </div>
        </div>

        {isDataSaverEnabled && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            📱 Você está economizando dados. Algumas mídias serão carregadas em qualidade reduzida.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
