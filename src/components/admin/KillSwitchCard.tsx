/**
 * Card de Kill Switch - Controle de emergência
 * Permite desconectar todos os usuários instantaneamente
 */
import { useState } from 'react';
import { Power, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { useKillSwitch } from '@/hooks/useKillSwitch';

export function KillSwitchCard() {
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  
  const { killAllSessions, forceRefresh, isExecuting } = useKillSwitch();

  return (
    <>
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-lg text-destructive flex items-center gap-2">
            <Power className="h-5 w-5" />
            Kill Switch (Emergência)
          </CardTitle>
          <CardDescription>
            Comandos de emergência para controle da plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Kill All Sessions */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/10">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-destructive/20">
                <Power className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="font-medium text-destructive">Desconectar Todos</p>
                <p className="text-sm text-muted-foreground">
                  Força logout de todos os usuários via WebSocket
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowKillConfirm(true)}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'KILL'
              )}
            </Button>
          </div>

          {/* Force Refresh */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/30">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <RefreshCw className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Forçar Atualização</p>
                <p className="text-sm text-muted-foreground">
                  Recarrega a página de todos os usuários
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRefreshConfirm(true)}
              disabled={isExecuting}
            >
              Refresh
            </Button>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
            <AlertTriangle className="h-5 w-5 text-[hsl(45,93%,47%)] shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-[hsl(45,93%,47%)]">Atenção</p>
              <p className="text-sm text-muted-foreground">
                Estes comandos afetam TODOS os usuários conectados. Use apenas em emergências reais.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Kill Confirmation Dialog */}
      <AlertDialog open={showKillConfirm} onOpenChange={setShowKillConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Power className="h-5 w-5" />
              Confirmar Kill Switch?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                Esta ação irá <strong>desconectar imediatamente todos os usuários</strong> da plataforma.
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Todas as sessões serão encerradas</li>
                <li>Usuários verão mensagem de logout forçado</li>
                <li>Ação será registrada no log de auditoria</li>
              </ul>
              <p className="text-destructive font-medium">
                ⚠️ Use apenas em caso de emergência real (ataque, vazamento, etc.)
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                killAllSessions();
                setShowKillConfirm(false);
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              CONFIRMAR KILL SWITCH
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refresh Confirmation Dialog */}
      <AlertDialog open={showRefreshConfirm} onOpenChange={setShowRefreshConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Forçar Atualização Global?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Todos os usuários terão suas páginas recarregadas em 3 segundos.
              Isso pode interromper uploads, chats em andamento, etc.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                forceRefresh();
                setShowRefreshConfirm(false);
              }}
            >
              Confirmar Refresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
