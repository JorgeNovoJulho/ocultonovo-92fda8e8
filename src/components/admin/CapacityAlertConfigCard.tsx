import { useState, useEffect } from 'react';
import { Bell, Mail, Webhook, Save, TestTube, Send, MessageCircle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useUpdateCapacityAlerts } from '@/hooks/useCapacityMetrics';
import { useTestCapacityAlert } from '@/hooks/useConversionEvents';
import { toast } from '@/hooks/use-toast';

export function CapacityAlertConfigCard() {
  const { data: settings, isLoading } = useSystemSettings();
  const updateAlerts = useUpdateCapacityAlerts();
  const testAlert = useTestCapacityAlert();

  const [alert90, setAlert90] = useState(false);
  const [alert95, setAlert95] = useState(false);
  const [alert100, setAlert100] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load initial values from settings
  useEffect(() => {
    if (settings) {
      const getValue = (key: string) => {
        const setting = settings[key];
        if (!setting) return null;
        const val = setting.value;
        if (typeof val === 'string') {
          // Remove aspas de valores JSONB
          const cleaned = val.replace(/^"|"$/g, '');
          if (cleaned === 'true') return true;
          if (cleaned === 'false') return false;
          return cleaned;
        }
        return val;
      };

      setAlert90(getValue('capacity_alert_90') === true);
      setAlert95(getValue('capacity_alert_95') === true);
      setAlert100(getValue('capacity_alert_100') === true);
      
      const webhook = getValue('capacity_webhook_url');
      setWebhookUrl(typeof webhook === 'string' ? webhook : '');
      
      const email = getValue('capacity_alert_email');
      setAlertEmail(typeof email === 'string' ? email : '');
      
      const token = getValue('telegram_bot_token');
      setTelegramToken(typeof token === 'string' ? token : '');
      
      const chatId = getValue('telegram_chat_id');
      setTelegramChatId(typeof chatId === 'string' ? chatId : '');
    }
  }, [settings]);

  const handleSave = () => {
    updateAlerts.mutate({
      alert_90: alert90,
      alert_95: alert95,
      alert_100: alert100,
      webhook_url: webhookUrl,
      alert_email: alertEmail,
      telegram_bot_token: telegramToken,
      telegram_chat_id: telegramChatId,
    });
    setHasChanges(false);
  };

  const handleTestTelegram = async () => {
    if (!telegramToken || !telegramChatId) {
      toast({
        title: 'Configuração incompleta',
        description: 'Preencha o Token do Bot e o Chat ID antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    // Salvar primeiro para garantir que os valores estejam no banco
    if (hasChanges) {
      handleSave();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    testAlert.mutate(undefined, {
      onSuccess: (data) => {
        if (data?.telegram_sent) {
          toast({
            title: '✅ Teste enviado!',
            description: 'Verifique seu Telegram para a mensagem de teste.',
          });
        } else {
          toast({
            title: '⚠️ Telegram não configurado',
            description: 'Verifique o Token e Chat ID.',
            variant: 'destructive',
          });
        }
      },
      onError: (error) => {
        toast({
          title: 'Erro ao enviar teste',
          description: error instanceof Error ? error.message : 'Erro desconhecido',
          variant: 'destructive',
        });
      },
    });
  };

  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const handleTestEmail = async () => {
    if (!alertEmail) {
      toast({
        title: 'Email não configurado',
        description: 'Preencha o campo de email antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    setSendingTestEmail(true);
    try {
      const { supabase } = await import('@/lib/supabaseExternal');
      const { error } = await supabase.functions.invoke('send-test-email', {
        body: {
          to: alertEmail,
          subject: '🧪 Teste de Alerta de Capacidade',
          html: `<h2>✅ Email de teste enviado com sucesso!</h2><p>Esta é uma mensagem de teste da configuração de alertas de capacidade do painel administrativo.</p><p><strong>Data/hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>`,
        },
      });

      if (error) throw error;

      toast({
        title: '✅ Email de teste enviado!',
        description: `Verifique a caixa de entrada de ${alertEmail}`,
      });
    } catch (err) {
      toast({
        title: '❌ Erro ao enviar email',
        description: err instanceof Error ? err.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleChange = () => {
    setHasChanges(true);
  };

  const telegramConfigured = telegramToken && telegramChatId;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="h-48 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Configuração de Alertas
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Alert Thresholds */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Notificar quando atingir:</Label>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-6 bg-yellow-500/20 rounded flex items-center justify-center">
                  <span className="text-xs font-bold text-yellow-600">90%</span>
                </div>
                <span className="text-sm">Alerta preventivo</span>
              </div>
              <Switch
                checked={alert90}
                onCheckedChange={(checked) => {
                  setAlert90(checked);
                  handleChange();
                }}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-6 bg-orange-500/20 rounded flex items-center justify-center">
                  <span className="text-xs font-bold text-orange-600">95%</span>
                </div>
                <span className="text-sm">Quase cheio</span>
              </div>
              <Switch
                checked={alert95}
                onCheckedChange={(checked) => {
                  setAlert95(checked);
                  handleChange();
                }}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-12 h-6 bg-red-500/20 rounded flex items-center justify-center">
                  <span className="text-xs font-bold text-red-600">100%</span>
                </div>
                <span className="text-sm">Limite atingido</span>
              </div>
              <Switch
                checked={alert100}
                onCheckedChange={(checked) => {
                  setAlert100(checked);
                  handleChange();
                }}
              />
            </div>
          </div>
        </div>

        {/* Telegram Configuration */}
        <div className="space-y-4 pt-2 border-t">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2 font-medium">
              <MessageCircle className="w-4 h-4 text-[#0088cc]" />
              Telegram Bot
            </Label>
            {telegramConfigured && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                Configurado
              </div>
            )}
          </div>
          
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Bot Token</Label>
              <Input
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                value={telegramToken}
                onChange={(e) => {
                  setTelegramToken(e.target.value);
                  handleChange();
                }}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Chat ID</Label>
              <Input
                type="text"
                placeholder="-1001234567890"
                value={telegramChatId}
                onChange={(e) => {
                  setTelegramChatId(e.target.value);
                  handleChange();
                }}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Crie um bot com @BotFather e envie uma mensagem para ele para obter o Chat ID.
            </p>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestTelegram}
              disabled={testAlert.isPending || !telegramToken || !telegramChatId}
              className="w-full"
            >
              {testAlert.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Testar Notificação Telegram
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Other Notification Targets */}
        <div className="space-y-4 pt-2 border-t">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Email para alertas
            </Label>
          <Input
              type="email"
              placeholder="admin@exemplo.com"
              value={alertEmail}
              onChange={(e) => {
                setAlertEmail(e.target.value);
                handleChange();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestEmail}
              disabled={sendingTestEmail || !alertEmail}
              className="w-full"
            >
              {sendingTestEmail ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando email...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Email de Teste
                </>
              )}
            </Button>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Webhook className="w-4 h-4 text-muted-foreground" />
              Webhook URL
            </Label>
            <Input
              type="url"
              placeholder="https://hooks.slack.com/..."
              value={webhookUrl}
              onChange={(e) => {
                setWebhookUrl(e.target.value);
                handleChange();
              }}
            />
            <p className="text-xs text-muted-foreground">
              Receba alertas via Slack, Discord ou qualquer serviço com webhooks.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || updateAlerts.isPending}
          >
            {updateAlerts.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
