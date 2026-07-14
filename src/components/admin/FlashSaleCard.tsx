/**
 * Card de Flash Sale - Desconto de emergência
 * Botão de pânico para ativar desconto global por 1 hora
 */
import { useState, useEffect } from 'react';
import { Zap, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFlashSale } from '@/hooks/useFlashSale';

export function FlashSaleCard() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [customDiscount, setCustomDiscount] = useState('10');
  const [displayTime, setDisplayTime] = useState<string | null>(null);
  
  const { 
    isActive, 
    discount, 
    timeRemaining, 
    activate, 
    deactivate, 
    isActivating,
    isDeactivating,
    isLoading 
  } = useFlashSale();

  // Timer visual atualizado a cada segundo
  useEffect(() => {
    if (!isActive || !timeRemaining) {
      setDisplayTime(null);
      return;
    }

    const updateDisplay = () => {
      const hours = Math.floor(timeRemaining / 3600);
      const minutes = Math.floor((timeRemaining % 3600) / 60);
      const secs = timeRemaining % 60;
      
      if (hours > 0) {
        setDisplayTime(`${hours}h ${minutes}min ${secs}s`);
      } else if (minutes > 0) {
        setDisplayTime(`${minutes}min ${secs}s`);
      } else {
        setDisplayTime(`${secs}s`);
      }
    };

    updateDisplay();
    const interval = setInterval(updateDisplay, 1000);
    return () => clearInterval(interval);
  }, [isActive, timeRemaining]);

  // Calcular progresso do timer
  const progress = timeRemaining 
    ? ((3600 - timeRemaining) / 3600) * 100 // Assumindo 1 hora
    : 0;

  if (isLoading) {
    return (
      <Card className="border-[hsl(45,93%,47%)]/30">
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={`transition-colors ${isActive ? 'border-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/5' : 'border-border/50'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className={`h-5 w-5 ${isActive ? 'text-[hsl(45,93%,47%)]' : ''}`} />
              Flash Sale
              {isActive && (
                <Badge className="bg-[hsl(45,93%,47%)] text-black animate-pulse">
                  ATIVA
                </Badge>
              )}
            </CardTitle>
          </div>
          <CardDescription>
            Ative desconto de emergência quando conversões caírem
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {isActive ? (
            <>
              {/* Status Ativo */}
              <div className="p-4 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                    <span className="font-bold text-lg">{discount}% OFF</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="font-mono">{displayTime || '...'}</span>
                  </div>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  Aplicado automaticamente em todos os checkouts
                </p>
              </div>

              {/* Botão Desativar */}
              <Button
                variant="outline"
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={() => deactivate()}
                disabled={isDeactivating}
              >
                {isDeactivating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Desativar Flash Sale
              </Button>
            </>
          ) : (
            <>
              {/* Configuração */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Percentual de Desconto</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="5"
                      max="50"
                      value={customDiscount}
                      onChange={(e) => setCustomDiscount(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Desconto aplicado por 1 hora em todos os planos
                  </p>
                </div>

                {/* Botão de Pânico */}
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-bold"
                  onClick={() => setShowConfirm(true)}
                  disabled={isActivating}
                >
                  <Zap className="h-5 w-5" />
                  🔥 ATIVAR FLASH SALE {customDiscount}%
                </Button>

                {/* Aviso */}
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Use quando detectar queda de conversões. O desconto será aplicado 
                    automaticamente e expira em 1 hora.
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirmação */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              Ativar Flash Sale?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Isso irá aplicar <strong>{customDiscount}% de desconto</strong> em todos 
                os planos por <strong>1 hora</strong>.
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Todos os checkouts terão o desconto aplicado</li>
                <li>Cupons existentes podem se acumular</li>
                <li>Não é possível estender o tempo (apenas reativar)</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                activate({ discount: parseInt(customDiscount) });
                setShowConfirm(false);
              }}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400"
            >
              🔥 ATIVAR AGORA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
