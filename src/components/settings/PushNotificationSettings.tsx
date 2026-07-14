import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appUrl } from '@/lib/appConfig';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Bell, BellOff, Smartphone, AlertCircle, CheckCircle2, Send } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";

export function PushNotificationSettings() {
  const {
    permission,
    isSupported,
    isEnabled,
    isLoading,
    isInIframe,
    requestPermission,
    disableNotifications,
    sendTestNotification,
    vapidConfigured,
  } = usePushNotifications();

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      await requestPermission();
    } else {
      await disableNotifications();
    }
  };

  const getStatusBadge = () => {
    if (!isSupported) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Não Suportado
        </Badge>
      );
    }
    
    if (!vapidConfigured) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Não Configurado
        </Badge>
      );
    }

    if (permission === 'denied' && !isInIframe) {
      return (
        <Badge variant="destructive" className="gap-1">
          <BellOff className="h-3 w-3" />
          Bloqueado pelo Navegador
        </Badge>
      );
    }

    if (isInIframe && !isEnabled) {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Abra no App
        </Badge>
      );
    }

    if (isEnabled) {
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Ativado
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="gap-1">
        <Bell className="h-3 w-3" />
        Desativado
      </Badge>
    );
  };

  return (
    <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/20">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <span>Notificações Push</span>
          </div>
          {getStatusBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Receba alertas em tempo real mesmo quando o app estiver fechado. 
          Mensagens, curtidas, novos seguidores e muito mais.
        </p>

        {/* Toggle de ativação */}
        <div className={cn(
          "flex items-center justify-between p-3 rounded-lg border transition-colors",
          isEnabled 
            ? "bg-green-500/10 border-green-500/30" 
            : "bg-muted/30 border-border/30"
        )}>
          <div className="flex items-center gap-3">
            {isEnabled ? (
              <Bell className="h-5 w-5 text-green-400" />
            ) : (
              <BellOff className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium text-foreground">
                {isEnabled ? "Notificações Ativas" : "Ativar Notificações"}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEnabled 
                  ? "Você receberá alertas no navegador" 
                  : "Permita notificações para receber alertas"}
              </p>
            </div>
          </div>
          <Switch 
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isLoading || !isSupported || !vapidConfigured}
          />
        </div>

        {/* Aviso se em iframe (preview) */}
        {isInIframe && !isEnabled && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">Modo Preview</p>
                <p className="text-muted-foreground">
                  Notificações push não funcionam no modo preview. 
                  Acesse a URL publicada do app para ativar: 
                </p>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="mt-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                  onClick={() => window.open(appUrl('/settings'), '_blank')}
                >
                  Abrir App Publicado
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Aviso se bloqueado (fora do iframe) */}
        {permission === 'denied' && !isInIframe && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Permissão Bloqueada</p>
                <p className="text-muted-foreground">
                  Após liberar nas configurações do navegador, clique no botão abaixo ou recarregue a página.
                </p>
                <div className="flex gap-2 mt-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={() => requestPermission()}
                  >
                    Tentar Novamente
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Recarregar Página
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aviso se não configurado pelo admin */}
        {isSupported && !vapidConfigured && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">Configuração Pendente</p>
                <p className="text-muted-foreground">
                  O administrador ainda não configurou as chaves de notificação push (VAPID). 
                  Esta funcionalidade estará disponível em breve.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Botão de teste */}
        {isEnabled && (
          <Button 
            variant="outline" 
            className="w-full border-primary/50 hover:bg-primary/10"
            onClick={sendTestNotification}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Enviar Notificação de Teste
          </Button>
        )}

        {/* Info adicional */}
        <p className="text-xs text-muted-foreground text-center">
          As notificações funcionam apenas em navegadores compatíveis (Chrome, Firefox, Edge).
          Safari no iOS não suporta notificações push web.
        </p>
      </CardContent>
    </Card>
  );
}
