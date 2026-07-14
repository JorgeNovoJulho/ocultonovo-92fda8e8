import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Users, Zap, Clock, RotateCcw, Activity } from 'lucide-react';
import { useSystemSettings, useUpdateSetting, useBatchUpdateSettings } from '@/hooks/useSystemSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { useSmartOnlineCounter } from '@/hooks/useSmartOnlineCounter';

export function OnlineCounterConfigCard() {
  const { data: settings, isLoading } = useSystemSettings();
  const { count, mode, isRealtime } = useSmartOnlineCounter();
  const updateSetting = useUpdateSetting();
  const batchUpdate = useBatchUpdateSettings();
  
  const [localSettings, setLocalSettings] = useState({
    mode: 'simulated',
    baseMin: 180,
    baseMax: 320,
    incrementInterval: 5,
    maxIncrement: 50,
  });
  
  // Sync with database settings
  useEffect(() => {
    if (settings) {
      setLocalSettings({
        mode: settings.online_users_mode?.value?.toString().replace(/"/g, '') || 'simulated',
        baseMin: parseInt(settings.simulated_base_min?.value?.toString() || '180', 10),
        baseMax: parseInt(settings.simulated_base_max?.value?.toString() || '320', 10),
        incrementInterval: parseInt(settings.simulated_increment_interval?.value?.toString() || '5000', 10) / 1000,
        maxIncrement: parseInt(settings.simulated_max_increment?.value?.toString() || '50', 10),
      });
    }
  }, [settings]);
  
  const handleModeToggle = () => {
    const newMode = localSettings.mode === 'simulated' ? 'realtime' : 'simulated';
    setLocalSettings(prev => ({ ...prev, mode: newMode }));
    updateSetting.mutate({ key: 'online_users_mode', value: `"${newMode}"` });
  };
  
  const handleSaveSettings = () => {
    batchUpdate.mutate({
      simulated_base_min: localSettings.baseMin.toString(),
      simulated_base_max: localSettings.baseMax.toString(),
      simulated_increment_interval: (localSettings.incrementInterval * 1000).toString(),
      simulated_max_increment: localSettings.maxIncrement.toString(),
    });
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-green-500" />
          Contador de Usuários Online
        </CardTitle>
        <CardDescription>
          Configure como o contador de usuários online é exibido na landing page
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Live Preview */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </div>
            <span className="text-2xl font-bold text-green-500">{count}</span>
            <span className="text-muted-foreground">online agora</span>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            isRealtime 
              ? 'bg-blue-500/20 text-blue-400' 
              : 'bg-amber-500/20 text-amber-400'
          }`}>
            {isRealtime ? 'TEMPO REAL' : 'SIMULADO'}
          </span>
        </div>
        
        {/* Mode Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Modo Tempo Real
            </Label>
            <p className="text-sm text-muted-foreground">
              {localSettings.mode === 'realtime' 
                ? 'Mostra contagem real de usuários online'
                : 'Mostra contador simulado com incremento gradual'}
            </p>
          </div>
          <Switch 
            checked={localSettings.mode === 'realtime'}
            onCheckedChange={handleModeToggle}
            disabled={updateSetting.isPending}
          />
        </div>
        
        {/* Simulated Mode Settings */}
        {localSettings.mode === 'simulated' && (
          <div className="space-y-5 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">
              Configurações do Modo Simulado
            </h4>
            
            {/* Base Range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="baseMin" className="flex items-center gap-2">
                  <Zap className="h-3 w-3" />
                  Mínimo Base
                </Label>
                <Input
                  id="baseMin"
                  type="number"
                  value={localSettings.baseMin}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    baseMin: parseInt(e.target.value) || 0 
                  }))}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseMax" className="flex items-center gap-2">
                  <Zap className="h-3 w-3" />
                  Máximo Base
                </Label>
                <Input
                  id="baseMax"
                  type="number"
                  value={localSettings.baseMax}
                  onChange={(e) => setLocalSettings(prev => ({ 
                    ...prev, 
                    baseMax: parseInt(e.target.value) || 0 
                  }))}
                  min={0}
                />
              </div>
            </div>
            
            {/* Increment Interval */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Intervalo entre incrementos: {localSettings.incrementInterval}s
              </Label>
              <Slider
                value={[localSettings.incrementInterval]}
                onValueChange={([value]) => setLocalSettings(prev => ({ 
                  ...prev, 
                  incrementInterval: value 
                }))}
                min={1}
                max={15}
                step={0.5}
              />
              <p className="text-xs text-muted-foreground">
                A cada {localSettings.incrementInterval} segundos, o contador aumenta +1
              </p>
            </div>
            
            {/* Max Increments */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <RotateCcw className="h-3 w-3" />
                Incrementos antes de resetar: {localSettings.maxIncrement}
              </Label>
              <Slider
                value={[localSettings.maxIncrement]}
                onValueChange={([value]) => setLocalSettings(prev => ({ 
                  ...prev, 
                  maxIncrement: value 
                }))}
                min={10}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Após {localSettings.maxIncrement} incrementos, o contador reseta para um novo número base
              </p>
            </div>
            
            {/* Save Button */}
            <Button 
              onClick={handleSaveSettings}
              disabled={batchUpdate.isPending}
              className="w-full"
            >
              {batchUpdate.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
