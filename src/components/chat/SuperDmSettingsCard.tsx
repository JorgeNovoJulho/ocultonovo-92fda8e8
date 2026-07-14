import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sparkles, Coins, Info, Loader2, Bot, Clock, MessageSquare } from 'lucide-react';
import { 
  useSuperDmSettings, 
  useUpdateSuperDmSettings, 
  useSuperDmStats,
  useAutoReplySettings,
  useUpdateAutoReplySettings,
} from '@/hooks/useSuperDm';
import { usePlanPermissions } from '@/hooks/usePlanPermissions';
import { showUpgradeToast } from '@/lib/upgradeToast';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SuperDmSettingsCard() {
  const { data: settings, isLoading } = useSuperDmSettings();
  const { data: stats } = useSuperDmStats();
  const { data: autoReplySettings, isLoading: isLoadingAutoReply } = useAutoReplySettings();
  const updateSettings = useUpdateSuperDmSettings();
  const updateAutoReply = useUpdateAutoReplySettings();
  const { isFree, isVip } = usePlanPermissions();
  // Regra de negócio: somente VIP pode ATIVAR Super DM.
  // Free e Premium veem o card desativado e bloqueado, com upsell.
  const canActivateSuperDm = isVip;

  // Free/Premium: força desativado e bloqueia toggle.
  const [acceptSuperDm, setAcceptSuperDm] = useState(canActivateSuperDm);
  const [minPrice, setMinPrice] = useState(5);

  // Auto-reply state
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('24');

  useEffect(() => {
    if (settings) {
      // Para usuários sem VIP, sempre forçamos desativado (independente do que vier do banco).
      setAcceptSuperDm(canActivateSuperDm ? settings.accept_super_dm : false);
      setMinPrice(settings.min_super_dm_price);
    }
  }, [settings, canActivateSuperDm]);

  useEffect(() => {
    if (autoReplySettings) {
      setAutoReplyEnabled(autoReplySettings.super_dm_auto_reply_enabled);
      setAutoReplyMessage(autoReplySettings.super_dm_auto_reply_message || '');
      setEstimatedHours(String(autoReplySettings.super_dm_estimated_response_hours || 24));
    }
  }, [autoReplySettings]);

  const handleSaveSuperDm = () => {
    updateSettings.mutate({
      accept_super_dm: acceptSuperDm,
      min_super_dm_price: Math.max(1, minPrice),
    });
  };

  const handleSaveAutoReply = () => {
    updateAutoReply.mutate({
      super_dm_auto_reply_enabled: autoReplyEnabled,
      super_dm_auto_reply_message: autoReplyMessage,
      super_dm_estimated_response_hours: parseInt(estimatedHours),
    });
  };

  const hasSuperDmChanges =
    settings?.accept_super_dm !== acceptSuperDm ||
    settings?.min_super_dm_price !== minPrice;

  const hasAutoReplyChanges =
    autoReplySettings?.super_dm_auto_reply_enabled !== autoReplyEnabled ||
    autoReplySettings?.super_dm_auto_reply_message !== autoReplyMessage ||
    autoReplySettings?.super_dm_estimated_response_hours !== parseInt(estimatedHours);

  if (isLoading || isLoadingAutoReply) {
    return (
      <Card className="bg-card/50 border-border/30">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-amber-500/5 to-amber-600/10 border-amber-500/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          Configurações de Super DM
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!canActivateSuperDm && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Recurso exclusivo VIP</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isFree
                  ? 'Aceitar Super DMs e ganhar créditos com mensagens prioritárias é exclusivo do plano VIP.'
                  : 'Aceitar Super DMs é exclusivo do plano VIP. Faça upgrade para liberar.'}
              </p>
              <Button
                size="sm"
                className="mt-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-semibold hover:from-amber-600 hover:to-yellow-500"
                onClick={() => window.dispatchEvent(new Event('open-plans-modal'))}
              >
                Fazer upgrade para VIP
              </Button>
            </div>
          </div>
        )}

        {/* Toggle */}
        <div className="flex items-center justify-between py-3 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-400/20">
              <Sparkles className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="font-medium text-foreground">Aceitar Super DM</p>
              <p className="text-sm text-muted-foreground">
                Permite que usuários paguem para destacar mensagens
              </p>
            </div>
          </div>
          <Switch
            checked={acceptSuperDm}
            disabled={!canActivateSuperDm}
            onCheckedChange={(v) => {
              if (!canActivateSuperDm) {
                showUpgradeToast({ description: "Aceitar Super DM é exclusivo do plano VIP. Faça upgrade para liberar." });
                return;
              }
              setAcceptSuperDm(v);
            }}
          />
        </div>

        {/* Min Price */}
        {acceptSuperDm && (
          <div className="space-y-2">
            <Label htmlFor="min-price" className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-amber-400" />
              Valor mínimo para furar a fila
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="min-price"
                type="number"
                min={1}
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="w-24 bg-muted/30 border-amber-500/30"
              />
              <span className="text-muted-foreground">créditos</span>
            </div>
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              Quanto maior o valor, menos mensagens prioritárias você receberá,
              mas de maior qualidade.
            </p>
          </div>
        )}

        {/* Save Super DM Settings Button */}
        {hasSuperDmChanges && (
          <Button
            onClick={handleSaveSuperDm}
            disabled={updateSettings.isPending}
            className={cn(
              "w-full",
              "bg-gradient-to-r from-amber-500 to-yellow-400",
              "hover:from-amber-600 hover:to-yellow-500",
              "text-black font-semibold"
            )}
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        )}

        {/* Auto-Reply Section */}
        {acceptSuperDm && (
          <div className="space-y-4 pt-4 border-t border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/20">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">Resposta Automática</p>
                  <p className="text-sm text-muted-foreground">
                    Enviar agradecimento automático ao receber Super DM
                  </p>
                </div>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
              />
            </div>

            {autoReplyEnabled && (
              <div className="space-y-4 pl-12">
                <div className="space-y-2">
                  <Label htmlFor="auto-reply-message" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Mensagem de agradecimento
                  </Label>
                  <Textarea
                    id="auto-reply-message"
                    value={autoReplyMessage}
                    onChange={(e) => setAutoReplyMessage(e.target.value)}
                    placeholder="Obrigado pelo Super DM! Vou responder em breve..."
                    maxLength={280}
                    className="bg-muted/30 border-border/50 min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {autoReplyMessage.length}/280
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Tempo estimado de resposta
                  </Label>
                  <Select value={estimatedHours} onValueChange={setEstimatedHours}>
                    <SelectTrigger className="w-40 bg-muted/30 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 hora</SelectItem>
                      <SelectItem value="6">6 horas</SelectItem>
                      <SelectItem value="12">12 horas</SelectItem>
                      <SelectItem value="24">24 horas</SelectItem>
                      <SelectItem value="48">48 horas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Save Auto-Reply Button */}
                {hasAutoReplyChanges && (
                  <Button
                    onClick={handleSaveAutoReply}
                    disabled={updateAutoReply.isPending}
                    variant="outline"
                    className="w-full border-primary/30 hover:bg-primary/10"
                  >
                    {updateAutoReply.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Bot className="h-4 w-4 mr-2" />
                    )}
                    Salvar Auto-Reply
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {stats && stats.total_count > 0 && (
          <div className="p-4 rounded-lg bg-amber-400/10 border border-amber-400/30">
            <p className="text-sm font-medium text-amber-400 mb-3">
              📊 Suas estatísticas de Super DM
            </p>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {stats.total_count}
                </p>
                <p className="text-xs text-muted-foreground">Recebidos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">
                  {stats.total_received.toFixed(0)}
                </p>
                <p className="text-xs text-muted-foreground">Créditos</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {stats.average_amount.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground">Média</p>
              </div>
            </div>
          </div>
        )}

        {/* Total Earnings Badge */}
        {settings && settings.super_dm_earnings > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total recebido:</span>
            <Badge className="bg-amber-400/20 text-amber-400 border-amber-400/30">
              <Coins className="h-3 w-3 mr-1" />
              {settings.super_dm_earnings.toFixed(2)} créditos
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
