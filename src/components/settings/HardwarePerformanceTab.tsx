import { useState } from 'react';
import { usePerformance } from '@/contexts/PerformanceContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Cpu, MemoryStick, Monitor, Zap, Sparkles, Image, Download, RotateCcw, Loader2, Eye } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePaywallBlurLevel } from '@/hooks/usePaywallBlurLevel';

export function HardwarePerformanceTab() {
  const { profile, hardware, loading, updateSetting, rescanHardware, fps, autoDowngraded } = usePerformance();
  const { level: paywallBlur, setLevel: setPaywallBlur } = usePaywallBlurLevel();
  const [rescanning, setRescanning] = useState(false);
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Zap className="h-6 w-6 animate-pulse text-primary" />
      </div>
    );
  }

  const tierLabel = { low: 'Baixo', medium: 'Médio', high: 'Alto' };
  const tierColor = { low: 'text-red-400', medium: 'text-yellow-400', high: 'text-green-400' };

  return (
    <div className="space-y-6">
      {/* Hardware Info Card */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          Informações do Dispositivo
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
            <Cpu className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">CPU</p>
              <p className="text-sm font-medium text-foreground">
                {hardware?.cpuCores ?? '?'} núcleos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
            <MemoryStick className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">RAM</p>
              <p className="text-sm font-medium text-foreground">
                {hardware?.ramGB ? `${hardware.ramGB} GB` : 'Não detectada'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg bg-muted/30 p-3">
            <Monitor className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">GPU</p>
              <p className="text-sm font-medium text-foreground truncate max-w-[160px]" title={hardware?.gpu}>
                {hardware?.gpu ?? 'Desconhecida'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${tierColor[profile.tier]}`} />
            <span className="text-xs text-muted-foreground">
              Perfil detectado:{' '}
              <span className={`font-semibold ${tierColor[profile.tier]}`}>
                {tierLabel[profile.tier]}
              </span>
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            disabled={rescanning}
            onClick={async () => {
              setRescanning(true);
              try {
                await rescanHardware();
                toast({
                  title: "Hardware reanalisado!",
                  description: `Perfil detectado: ${tierLabel[profile.tier]}. Ajustes aplicados automaticamente.`,
                });
              } finally {
                setRescanning(false);
              }
            }}
          >
            {rescanning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reanalisar
          </Button>
        </div>
      </div>

      {/* Live FPS monitor */}
      {fps && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Monitor em Tempo Real
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">FPS atual</p>
              <p className={`text-lg font-bold ${fps.status === 'good' ? 'text-green-400' : fps.status === 'degraded' ? 'text-yellow-400' : 'text-red-400'}`}>
                {fps.fps}
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">Média</p>
              <p className="text-lg font-bold text-foreground">{fps.averageFps}</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-2">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className={`text-sm font-semibold ${fps.status === 'good' ? 'text-green-400' : fps.status === 'degraded' ? 'text-yellow-400' : 'text-red-400'}`}>
                {fps.status === 'good' ? 'Ótimo' : fps.status === 'degraded' ? 'Lento' : 'Crítico'}
              </p>
            </div>
          </div>
          {autoDowngraded && (
            <p className="text-xs text-yellow-400 pt-1">
              ⚡ Ajuste automático aplicado para melhorar a fluidez. Toque em "Reanalisar" para restaurar.
            </p>
          )}
        </div>
      )}

      {/* Manual Switches */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Ajustes de Performance
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="animations" className="text-sm cursor-pointer">
                Animações de Interface
              </Label>
            </div>
            <Switch
              id="animations"
              checked={profile.showAnimations}
              onCheckedChange={(v) => updateSetting('showAnimations', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="shadows" className="text-sm cursor-pointer">
                Sombras e Efeitos
              </Label>
            </div>
            <Switch
              id="shadows"
              checked={profile.showShadows}
              onCheckedChange={(v) => updateSetting('showShadows', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="prefetch" className="text-sm cursor-pointer">
                Pré-carregamento de Mídia
              </Label>
            </div>
            <Switch
              id="prefetch"
              checked={profile.prefetchMedia}
              onCheckedChange={(v) => updateSetting('prefetchMedia', v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Image className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Qualidade de Imagem</Label>
            </div>
            <Select
              value={profile.imageQuality}
              onValueChange={(v) => updateSetting('imageQuality', v)}
            >
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baixa</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm">Blur do Paywall</Label>
                <p className="text-[11px] text-muted-foreground">Intensidade do desfoque sobre conteúdo pago</p>
              </div>
            </div>
            <Select value={paywallBlur} onValueChange={(v) => setPaywallBlur(v as any)}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
                <SelectItem value="medium">Médio</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
