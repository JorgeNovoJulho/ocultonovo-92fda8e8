import { useState, useEffect } from "react";
import { 
  QrCode, 
  Shield, 
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  CreditCard,
  Wallet,
  ExternalLink,
  Info,
  Loader2,
  Wifi,
  WifiOff,
  Copy,
  Link2,
  CheckCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePixGatewayConfig, useUpdatePixGatewayConfig, useTestPixConnection } from "@/hooks/usePixGateway";
import { supabase } from "@/lib/supabaseExternal";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import { AdminIntelligenceCenter } from "@/components/admin/AdminIntelligenceCenter";
import { AsaasSetupTutorial } from "@/components/admin/AsaasSetupTutorial";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

const gatewayProviders = [
  { value: 'mercadopago', label: 'Mercado Pago', logo: '💳', docUrl: 'https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-configuration/integrate-with-pix' },
  { value: 'pagseguro', label: 'PagSeguro', logo: '🔒', docUrl: 'https://dev.pagseguro.uol.com.br/' },
  { value: 'asaas', label: 'Asaas', logo: '💰', docUrl: 'https://docs.asaas.com/' },
  { value: 'gerencianet', label: 'Gerencianet/EfiBank', logo: '🏦', docUrl: 'https://dev.efipay.com.br/' },
];

const pixKeyTypes = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone' },
  { value: 'random', label: 'Chave Aleatória' },
];

export default function AdminPixConfigPage() {
  const { data: config, isLoading } = usePixGatewayConfig();
  const { data: isMasterAdmin } = useIsMasterAdmin();
  const updateConfig = useUpdatePixGatewayConfig();
  const testConnection = useTestPixConnection();

  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [testSaleStatus, setTestSaleStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [testSaleError, setTestSaleError] = useState<string | null>(null);
  const [testWebhookStatus, setTestWebhookStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [testDiscordStatus, setTestDiscordStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');

  const webhookEdgeFunctionUrl = `${EXTERNAL_SUPABASE_URL}/functions/v1/pix-webhook`;

  const handleCopyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(null), 2000);
  };
  
  const [formState, setFormState] = useState({
    gateway_provider: 'asaas',
    api_key_encrypted: '',
    webhook_secret_encrypted: '',
    pix_key: '',
    pix_key_type: '' as any,
    min_deposit: 5,
    max_deposit: 10000,
    is_active: false,
    sandbox_mode: true,
    discord_webhook_url: '',
  });

  const handleTestConnection = async () => {
    const result = await testConnection.mutateAsync();
    const status = result.success ? 'success' : 'error';
    setConnectionStatus(status);

    // Non-blocking: notify Discord that master account is OK after successful validation
    if (result.success && formState.discord_webhook_url) {
      fetch(formState.discord_webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content:
            `✅ **PIX Gateway: OK**\n` +
            `🏦 Conta Master (Admin) validada com sucesso!\n` +
            `📊 Split configurado: **74% Criador / 26% Plataforma** (20% margem + 6% impostos)\n` +
            `⚡ Provedor: ${formState.gateway_provider.toUpperCase()} | Modo: ${formState.sandbox_mode ? 'Sandbox' : 'Produção'}`,
        }),
      }).catch(() => null); // fire-and-forget — never blocks UI or audio
    }
  };

  // Test PIX webhook endpoint (ping)
  const handleTestWebhook = () => {
    setTestWebhookStatus('sending');
    fetch(webhookEdgeFunctionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ping', data: { id: 'test-ping' } }),
    })
      .then(async (r) => {
        await r.text();
        // 400 is expected (missing signature) but means endpoint is alive
        setTestWebhookStatus(r.ok || r.status === 400 ? 'ok' : 'error');
        setTimeout(() => setTestWebhookStatus('idle'), 4000);
      })
      .catch(() => {
        setTestWebhookStatus('error');
        setTimeout(() => setTestWebhookStatus('idle'), 3000);
      });
  };

  // Test Discord webhook connection
  const handleTestDiscord = () => {
    const webhookUrl = formState.discord_webhook_url;
    if (!webhookUrl) {
      setTestDiscordStatus('error');
      setTimeout(() => setTestDiscordStatus('idle'), 3000);
      return;
    }
    setTestDiscordStatus('sending');
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '🔔 Teste de Conexão Discord',
          description: 'Webhook Discord conectado com sucesso à Plataforma Oculta!',
          color: 0x00e676,
          fields: [
            { name: '📡 Status', value: 'Online', inline: true },
            { name: '⏱️ Horário', value: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), inline: true },
          ],
          footer: { text: 'Plataforma Oculta • Notificações Discord' },
          timestamp: new Date().toISOString(),
        }],
      }),
    })
      .then(async (r) => {
        await r.text();
        setTestDiscordStatus(r.ok ? 'ok' : 'error');
        setTimeout(() => setTestDiscordStatus('idle'), 4000);
      })
      .catch(() => {
        setTestDiscordStatus('error');
        setTimeout(() => setTestDiscordStatus('idle'), 3000);
      });
  };

  // Simulated sale test → admin e-mail (faleconosco@ocultoswing.com.br)
  const handleTestSale = async () => {
    setTestSaleError(null);
    setTestSaleStatus('sending');

    try {
      const { data, error } = await supabase.functions.invoke('admin-email-notify', {
        body: {
          type: 'test_sale_split',
          subject: '🔔 Teste de Disparo de Venda — Split 74/26',
          summary: 'Simulação de venda confirmada com sucesso. Status do sistema OK.',
          tone: 'success',
          highlight: '✅ Split 74% Criador / 26% Plataforma simulado',
          fields: [
            { name: 'Valor Bruto Simulado', value: 'R$ 100,00' },
            { name: 'Criador (74%)', value: 'R$ 74,00' },
            { name: 'Plataforma (26%)', value: 'R$ 26,00 (20% comissão + 6% impostos)' },
            { name: 'Provedor', value: `${formState.gateway_provider.toUpperCase()} • ${formState.sandbox_mode ? 'Sandbox' : 'Produção'}` },
            { name: 'Conta Master', value: 'Administrador — recebedor principal' },
          ],
        },
      });

      if (error) throw new Error(error.message || 'Falha ao chamar a edge function');
      if (!data?.success) throw new Error(data?.error || 'Resposta sem sucesso do servidor');

      setTestSaleStatus('ok');
      setTestSaleError(
        data.sandbox
          ? `Modo sandbox ativo: o e-mail foi simulado (não enviado). Destino configurado: ${data.destination || 'faleconosco@ocultoswing.com.br'}.`
          : `E-mail enviado para ${data.destination || 'faleconosco@ocultoswing.com.br'} com sucesso.`,
      );
      setTimeout(() => setTestSaleStatus('idle'), 5000);
    } catch (err: any) {
      const msg = String(err?.message || 'Erro desconhecido');
      if (/resend/i.test(msg) && /configurado|api key|apikey/i.test(msg)) {
        setTestSaleError('Resend não está configurado ou está desativado. Acesse Admin → Resend, salve a API Key e ative o serviço antes de testar.');
      } else if (/sandbox/i.test(msg)) {
        setTestSaleError('Resend está em modo sandbox. Desative o sandbox em Admin → Resend para envios reais.');
      } else if (/forbidden|admin/i.test(msg)) {
        setTestSaleError('Apenas administradores podem disparar este teste. Faça login com a conta master.');
      } else if (/sess[ãa]o|token|unauthor/i.test(msg)) {
        setTestSaleError('Sessão expirada. Faça login novamente para disparar o teste.');
      } else {
        setTestSaleError(`Falha ao enviar e-mail de teste: ${msg}`);
      }
      setTestSaleStatus('error');
      setTimeout(() => setTestSaleStatus('idle'), 8000);
    }
  };


  useEffect(() => {
    if (config) {
      setFormState({
        gateway_provider: config.gateway_provider || 'asaas',
        api_key_encrypted: '',
        webhook_secret_encrypted: '',
        pix_key: config.pix_key || '',
        pix_key_type: config.pix_key_type || '',
        min_deposit: config.min_deposit || 5,
        max_deposit: config.max_deposit || 10000,
        is_active: config.is_active || false,
        sandbox_mode: config.sandbox_mode ?? true,
        discord_webhook_url: (config as any).discord_webhook_url || '',
      });
    }
  }, [config]);

  const selectedProvider = gatewayProviders.find(p => p.value === formState.gateway_provider);

  const getApiKeyLabel = () => {
    switch (formState.gateway_provider) {
      case 'mercadopago':
        return 'Access Token do Mercado Pago';
      case 'pagseguro':
        return 'Token de Integração PagSeguro';
      case 'asaas':
        return 'API Key Asaas';
      case 'gerencianet':
        return 'Client ID + Client Secret (formato: id:secret)';
      default:
        return 'Chave de API';
    }
  };

  const getApiKeyPlaceholder = () => {
    switch (formState.gateway_provider) {
      case 'mercadopago':
        return 'APP_USR-0000000000000000-000000-...';
      case 'pagseguro':
        return 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
      case 'asaas':
        return '$aact_...';
      case 'gerencianet':
        return 'Client_Id_xxx:Client_Secret_xxx';
      default:
        return '••••••••••••••••';
    }
  };

  const handleSave = async () => {
    const updates: any = {
      gateway_provider: formState.gateway_provider,
      pix_key: formState.pix_key || null,
      pix_key_type: formState.pix_key_type || null,
      min_deposit: formState.min_deposit,
      max_deposit: formState.max_deposit,
      is_active: formState.is_active,
      sandbox_mode: formState.sandbox_mode,
      discord_webhook_url: formState.discord_webhook_url || null,
    };

    if (formState.api_key_encrypted) updates.api_key_encrypted = formState.api_key_encrypted;
    if (formState.webhook_secret_encrypted) updates.webhook_secret_encrypted = formState.webhook_secret_encrypted;

    await updateConfig.mutateAsync(updates);

    // Fire-and-forget Discord alert after successful save (never blocks UI/audio)
    const webhookUrl = formState.discord_webhook_url;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: '✅ PIX Gateway: OK - Admin Master Ativo',
            description:
              `**Configuração salva com sucesso!**\n` +
              `Provedor: **${formState.gateway_provider.toUpperCase()}** | Modo: **${formState.sandbox_mode ? 'Sandbox' : 'Produção'}** | Gateway: **${formState.is_active ? 'ATIVO' : 'INATIVO'}**`,
            color: 0x00e676,
            fields: [
              { name: '🏦 Conta Master', value: 'Administrador — recebedor primário de todas as transações', inline: false },
              { name: '💰 Retenção Master (26%)', value: '20% comissão + 6% reserva de impostos', inline: true },
              { name: '👤 Repasse Criador', value: '74% líquido via Split', inline: true },
              { name: '⚡ Split Processing', value: 'Servidor — zero impacto em áudio/vídeo mobile', inline: false },
            ],
            footer: { text: 'Plataforma Oculta • Admin Master Configurado' },
            timestamp: new Date().toISOString(),
          }],
        }),
      }).then(async (r) => { await r.text(); }).catch(() => null); // consume body → free RAM
    }
  };

  if (!isMasterAdmin) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh]">
        <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground text-center">
          Apenas administradores master podem configurar o gateway de pagamentos.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!config && !isLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <AlertTriangle className="h-16 w-16 text-destructive/50 mb-4" />
        <h2 className="text-xl font-bold mb-2">Configuração não encontrada</h2>
        <p className="text-muted-foreground mb-4">
          Não foi possível carregar a configuração do gateway PIX.<br />
          A linha de configuração pode não existir no banco de dados.
        </p>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <QrCode className="h-6 w-6 text-primary" />
            Configuração PIX
          </h1>
          <p className="text-muted-foreground">
            Configure o gateway de pagamentos PIX para recarga de carteira
          </p>
        </div>
        <Badge 
          variant="outline" 
          className={config?.is_active 
            ? 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30' 
            : 'bg-destructive/10 text-destructive border-destructive/30'
          }
        >
          {config?.is_active ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>

      {/* Atalho para depuração de webhooks recebidos */}
      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <Wifi className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">Logs de Webhook (depuração rápida)</p>
              <p className="text-xs text-muted-foreground">
                Veja em tempo real cada chamada recebida do Asaas: status, payload e horário.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="/admin/webhook-events">Abrir painel</a>
          </Button>
        </CardContent>
      </Card>

      {/* Tutorial passo-a-passo Asaas (PIX + Cartão + Split + Saques) */}
      <AsaasSetupTutorial />

      {/* Status Banner - shown when inactive */}
      {!config?.is_active && (
        <Card className="bg-destructive/5 border-destructive/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive">Gateway PIX inativo</p>
              <p className="text-sm text-muted-foreground">
                O gateway está desativado. Configure as credenciais abaixo e ative o toggle <strong>"Gateway Ativo"</strong> para habilitar pagamentos PIX.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Master Receiver Status Panel */}
      <Card className="bg-primary/5 border-primary/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-foreground">Conta Master — Recebedor Principal</p>
                <Badge className="bg-primary/15 text-primary border-primary/30 text-xs">
                  {config?.is_active ? '● ATIVO' : '○ INATIVO'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                A API Key do Administrador gera todas as cobranças. O split é calculado no servidor.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="bg-background/60 border border-border/40 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-primary">74%</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Criador<br />(conta filha)</p>
                </div>
                <div className="bg-background/60 border border-border/40 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-foreground">20%</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Plataforma<br />(Master)</p>
                </div>
                <div className="bg-background/60 border border-border/40 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-foreground">6%</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Impostos<br />(reserva)</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ⚡ Cálculo executado no servidor — zero impacto em áudio/vídeo mobile
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Sale → Discord */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg">🔔</div>
              <div>
                <p className="font-semibold text-sm">Teste de Disparo de Venda</p>
                <p className="text-xs text-muted-foreground">
                  Simula R$ 100 bruto → envia <strong>74 / 26</strong> split para o Discord
                </p>
                {testSaleStatus === 'ok' && (
                  <p className="text-xs text-primary mt-1 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    ✅ TESTE DE SISTEMA OK — Discord notificado!
                  </p>
                )}
                {testSaleStatus === 'error' && (
                  <p className="text-xs text-destructive mt-1 max-w-md leading-relaxed">
                    ⚠️ {testSaleError || 'Falha no envio — verifique a URL do Webhook Discord.'}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestSale}
              disabled={testSaleStatus === 'sending'}
              className="shrink-0 gap-2"
            >
              {testSaleStatus === 'sending' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
              ) : testSaleStatus === 'ok' ? (
                <><Check className="h-4 w-4 text-primary" /> Enviado!</>
              ) : (
                <><Wifi className="h-4 w-4" /> Disparar Teste</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>


      <Card className="bg-[hsl(45,93%,47%)]/5 border-[hsl(45,93%,47%)]/30">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[hsl(45,93%,47%)] shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-[hsl(45,93%,47%)]">Configuração Sensível</p>
            <p className="text-sm text-muted-foreground">
              As chaves de API são criptografadas e armazenadas com segurança. 
              Nunca compartilhe essas informações.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gateway Provider */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Provedor de Pagamento
          </CardTitle>
          <CardDescription>
            Escolha o gateway de pagamentos PIX
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {gatewayProviders.map((provider) => (
              <button
                key={provider.value}
                type="button"
                onClick={() => setFormState(prev => ({ ...prev, gateway_provider: provider.value }))}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border transition-all ${
                  formState.gateway_provider === provider.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 bg-muted/30 hover:border-primary/50'
                }`}
              >
                <span className="text-2xl mb-2">{provider.logo}</span>
                <span className="text-sm font-medium">{provider.label}</span>
              </button>
            ))}
          </div>
          
          {selectedProvider && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Documentação:</span>
              <a 
                href={selectedProvider.docUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1"
              >
                {selectedProvider.label} Developer Docs
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Credentials */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Credenciais da API
          </CardTitle>
          <CardDescription>
            Insira as credenciais do seu provedor de pagamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formState.gateway_provider === 'mercadopago' && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Como obter o Access Token:</strong><br />
                1. Acesse o <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Painel de Desenvolvedores</a><br />
                2. Crie ou selecione sua aplicação<br />
                3. Vá em "Credenciais de Produção" ou "Credenciais de Teste"<br />
                4. Copie o <strong>Access Token</strong>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{getApiKeyLabel()}</Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                placeholder={getApiKeyPlaceholder()}
                value={formState.api_key_encrypted}
                onChange={(e) => setFormState(prev => ({ ...prev, api_key_encrypted: e.target.value }))}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {config?.api_key_encrypted && (
              <p className="text-xs text-primary flex items-center gap-1">
                <Check className="h-3 w-3" />
                Chave já configurada. Deixe em branco para manter a atual.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Webhook Secret
              {formState.gateway_provider === 'asaas' && (
                <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                  Token de validação Asaas
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showWebhookSecret ? "text" : "password"}
                placeholder={formState.gateway_provider === 'asaas' ? 'oculto_secret_2026' : '••••••••••••••••'}
                value={formState.webhook_secret_encrypted}
                onChange={(e) => setFormState(prev => ({ ...prev, webhook_secret_encrypted: e.target.value }))}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {formState.gateway_provider === 'asaas'
                ? 'Token enviado pelo Asaas no header "asaas-access-token" para validar autenticidade de cada notificação.'
                : `Usado para validar as notificações de webhook do ${selectedProvider?.label || 'provedor'}.`}
            </p>
          </div>

          {/* Asaas: wallet_id is per-creator, show info instead of input */}
          {formState.gateway_provider === 'asaas' && (
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-2">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">Wallet ID por Criador</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cada criador configura seu próprio Wallet ID do Asaas no painel de Precificação VIP.
                  O sistema busca automaticamente o ID correto no momento da cobrança — nenhuma configuração global necessária aqui.
                </p>
              </div>
            </div>
          )}

          {/* Test Connection Button */}
          <div className="pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Testar Conexão</p>
                <p className="text-xs text-muted-foreground">
                  Verifique se a API key está configurada corretamente
                </p>
              </div>
              <div className="flex items-center gap-3">
                {connectionStatus === 'success' && (
                  <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/40 gap-1">
                    <CheckCheck className="h-3 w-3" />
                    Conexão bem-sucedida
                  </Badge>
                )}
                {connectionStatus === 'error' && (
                  <Badge variant="destructive" className="bg-destructive/10 gap-1">
                    <WifiOff className="h-3 w-3" />
                    Falha na conexão
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testConnection.isPending || (!config?.api_key_encrypted && !formState.api_key_encrypted)}
                >
                  {testConnection.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <Wifi className="h-4 w-4 mr-2" />
                      Testar API
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PIX Key */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Chave PIX de Recebimento
          </CardTitle>
          <CardDescription>
            A chave PIX onde os pagamentos serão recebidos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Chave</Label>
              <Select
                value={formState.pix_key_type}
                onValueChange={(value) => setFormState(prev => ({ ...prev, pix_key_type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {pixKeyTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chave PIX</Label>
              <Input
                placeholder="Sua chave PIX"
                value={formState.pix_key}
                onChange={(e) => setFormState(prev => ({ ...prev, pix_key: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Limites de Depósito</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor Mínimo (R$)</Label>
              <Input
                type="number"
                min="1"
                value={formState.min_deposit}
                onChange={(e) => setFormState(prev => ({ ...prev, min_deposit: parseFloat(e.target.value) || 5 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor Máximo (R$)</Label>
              <Input
                type="number"
                min="1"
                value={formState.max_deposit}
                onChange={(e) => setFormState(prev => ({ ...prev, max_deposit: parseFloat(e.target.value) || 10000 }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toggles */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Modo Sandbox/Teste</p>
              <p className="text-sm text-muted-foreground">
                Usar ambiente de testes (sem transações reais)
              </p>
            </div>
            <Switch
              checked={formState.sandbox_mode}
              onCheckedChange={(checked) => setFormState(prev => ({ ...prev, sandbox_mode: checked }))}
            />
          </div>

          <div className="border-t border-border/50 pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Gateway Ativo</p>
                <p className="text-sm text-muted-foreground">
                  Habilitar recebimento de pagamentos PIX
                </p>
              </div>
              <Switch
                checked={formState.is_active}
                onCheckedChange={(checked) => setFormState(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook / Notification URLs */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            URLs para Notificações (Webhook)
          </CardTitle>
          <CardDescription>
            Cole estas URLs no painel do seu provedor de pagamento para receber notificações de transações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info box */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Como configurar:</strong> No painel do seu provedor (ex: Mercado Pago → Desenvolvedor → Webhooks), cole a URL abaixo no campo de URL de notificação/webhook.
            </p>
          </div>

          {/* Production URL */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              URL para Produção
              <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">Recomendada</span>
            </Label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  readOnly
                  value={webhookEdgeFunctionUrl}
                  className="font-mono text-xs pr-3 bg-muted/50 cursor-text select-all"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopyUrl(webhookEdgeFunctionUrl, 'prod')}
                title="Copiar URL"
              >
                {copiedUrl === 'prod' ? (
                  <CheckCheck className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestWebhook}
                disabled={testWebhookStatus === 'sending'}
                title="Testar endpoint"
                className="shrink-0 gap-1.5"
              >
                {testWebhookStatus === 'sending' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testando...</>
                ) : testWebhookStatus === 'ok' ? (
                  <><Check className="h-3.5 w-3.5 text-primary" /> Endpoint OK</>
                ) : testWebhookStatus === 'error' ? (
                  <><WifiOff className="h-3.5 w-3.5 text-destructive" /> Falha</>
                ) : (
                  <><Wifi className="h-3.5 w-3.5" /> Testar Endpoint</>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta é a URL do endpoint de webhook do backend. Use-a no campo de notificações do seu provedor PIX.
            </p>
          </div>

          {/* Provider-specific instructions */}
          {formState.gateway_provider === 'mercadopago' && (
            <div className="p-3 bg-muted/30 border border-border/50 rounded-lg space-y-1">
              <p className="text-sm font-medium">Configuração no Mercado Pago:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Acesse <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Painel de Desenvolvedores</a></li>
                <li>Selecione sua aplicação → <strong>Webhooks</strong></li>
                <li>Clique em <strong>"Configurar"</strong> e cole a URL acima</li>
                <li>Selecione os eventos: <strong>payment</strong></li>
                <li>Salve e ative o webhook</li>
              </ol>
            </div>
          )}

          {formState.gateway_provider === 'asaas' && (
            <div className="p-3 bg-muted/30 border border-border/50 rounded-lg space-y-1">
              <p className="text-sm font-medium">Configuração no Asaas:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Acesse <a href="https://www.asaas.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Dashboard Asaas</a></li>
                <li>Vá em <strong>Integrações → Webhooks</strong></li>
                <li>Adicione a URL acima e selecione evento <strong>PAYMENT_RECEIVED</strong></li>
              </ol>
            </div>
          )}

          {formState.gateway_provider === 'pagseguro' && (
            <div className="p-3 bg-muted/30 border border-border/50 rounded-lg space-y-1">
              <p className="text-sm font-medium">Configuração no PagSeguro:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Acesse o <a href="https://sandbox.pagseguro.uol.com.br/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Portal PagSeguro</a></li>
                <li>Vá em <strong>Preferências → Notificações</strong></li>
                <li>Cole a URL no campo de URL de notificação</li>
              </ol>
            </div>
          )}

          {formState.gateway_provider === 'gerencianet' && (
            <div className="p-3 bg-muted/30 border border-border/50 rounded-lg space-y-1">
              <p className="text-sm font-medium">Configuração no EfiBank/Gerencianet:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Acesse o <a href="https://sejaefi.com.br/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Portal EfiBank</a></li>
                <li>Vá em <strong>API → Webhooks</strong></li>
                <li>Registre o webhook com a URL de produção acima</li>
              </ol>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discord Webhook URL */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            Notificações Discord
          </CardTitle>
          <CardDescription>
            URL do webhook para alertas automáticos de venda. Edite e salve para aplicar sem redeploy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              URL do Webhook Discord
              {formState.discord_webhook_url && (
                <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Configurado
                </span>
              )}
            </Label>
            <Input
              type="url"
              placeholder="https://discord.com/api/webhooks/..."
              value={formState.discord_webhook_url}
              onChange={(e) => setFormState(prev => ({ ...prev, discord_webhook_url: e.target.value }))}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">
                Salve as configurações para aplicar. O sistema usa esta URL para notificar cada venda confirmada.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestDiscord}
                disabled={testDiscordStatus === 'sending' || !formState.discord_webhook_url}
                className="shrink-0 gap-1.5"
              >
                {testDiscordStatus === 'sending' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                ) : testDiscordStatus === 'ok' ? (
                  <><Check className="h-3.5 w-3.5 text-primary" /> Discord OK!</>
                ) : testDiscordStatus === 'error' ? (
                  <><WifiOff className="h-3.5 w-3.5 text-destructive" /> Falha</>
                ) : (
                  <><Wifi className="h-3.5 w-3.5" /> Testar Discord</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Central de Inteligência */}
      <AdminIntelligenceCenter />

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline">Cancelar</Button>
        <Button 
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="gap-2"
        >
          {updateConfig.isPending ? (
            'Salvando...'
          ) : (
            <>
              <Check className="h-4 w-4" />
              Salvar Configurações
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
