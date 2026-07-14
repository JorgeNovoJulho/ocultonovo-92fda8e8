import { memo } from 'react';
import { Bell, BellOff, Send, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminPushNotifications } from '@/hooks/useAdminPushNotifications';

export const AdminPushCard = memo(function AdminPushCard() {
  const { isSupported, isEnabled, isLoading, permission, vapidConfigured, vapidLoading, activate, deactivate, sendTest } = useAdminPushNotifications();

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Central de Alertas</CardTitle>
          </div>
          {isEnabled ? (
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
              <CheckCircle className="h-3 w-3 mr-1" /> Ativo
            </Badge>
          ) : vapidLoading ? (
            <Badge variant="outline" className="text-muted-foreground">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Configurando...
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
          )}
        </div>
        <CardDescription className="text-xs">
          Receba alertas de assinaturas e denúncias mesmo com o app fechado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isSupported && (
          <div className="flex items-center gap-2 text-sm text-yellow-500">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Seu navegador não suporta push notifications.</span>
          </div>
        )}

        {permission === 'denied' && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Permissão bloqueada. Ative nas configurações do navegador.</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!isEnabled ? (
            <Button
              onClick={activate}
              disabled={isLoading || !isSupported || !vapidConfigured || permission === 'denied' || vapidLoading}
              className="bg-primary hover:bg-primary/90"
              size="sm"
            >
              {isLoading || vapidLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Bell className="h-4 w-4 mr-1.5" />
              )}
              {vapidLoading ? 'Configurando...' : 'Habilitar Notificações em Tempo Real'}
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={deactivate}>
                <BellOff className="h-4 w-4 mr-1.5" /> Desativar
              </Button>
              <Button variant="secondary" size="sm" onClick={sendTest}>
                <Send className="h-4 w-4 mr-1.5" /> Enviar Teste
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
