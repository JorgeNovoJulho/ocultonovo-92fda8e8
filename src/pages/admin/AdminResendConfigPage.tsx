import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { 
  Mail, 
  Eye, 
  EyeOff, 
  Save, 
  TestTube, 
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Shield,
  Loader2,
  Globe,
  XCircle,
  Info,
  Send,
} from 'lucide-react';
import { requestResendConnectionTest, requestResendCorsPreflight, type ResendDiagnosticResult, useResendConfig, useUpdateResendConfig } from '@/hooks/useResendConfig';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { persistIntegrationHealth } from '@/lib/integrationHealth';
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';

export default function AdminResendConfigPage() {
  const { data: config, isLoading } = useResendConfig();
  const { data: isMasterAdmin } = useIsMasterAdmin();
  const updateConfig = useUpdateResendConfig();
  const queryClient = useQueryClient();

  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [sandboxMode, setSandboxMode] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [legacyStatus, setLegacyStatus] = useState<'idle' | 'loading'>('idle');
  const [sendStatus, setSendStatus] = useState<'idle' | 'loading'>('idle');
  const [corsStatus, setCorsStatus] = useState<'idle' | 'loading'>('idle');
  const [diagnostic, setDiagnostic] = useState<ResendDiagnosticResult | null>(null);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);

  // Ping state (auditoria em tempo real)
  const [pingStatus, setPingStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [pingResult, setPingResult] = useState<{
    domain_verified?: boolean;
    domain_status?: string;
    domain_name?: string;
    dns_records?: any;
    sandbox?: boolean;
    from_email?: string;
    message?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (config) {
      setApiKey(config.api_key_encrypted || '');
      setFromEmail(config.from_email || '');
      setFromName(config.from_name || '');
      setIsActive(config.is_active || false);
      setSandboxMode(config.sandbox_mode ?? true);
    }
  }, [config]);

  // isMasterAdmin already derived from useIsMasterAdmin()

  const handlePing = async () => {
    setPingStatus('loading');
    setPingResult(null);
    try {
      const data = await requestResendConnectionTest();
      const responseData = data.response || {};
      if (!data?.success) {
        setPingStatus('error');
        setPingResult({ error: responseData.error || data.message || 'Falha na conexão' });
        toast.error('🚨 CRITICAL: Email Gateway Down — Alerta enviado ao Discord.');
      } else {
        setPingStatus('ok');
        setPingResult(responseData);
        if (responseData.domain_verified) {
          toast.success('✅ PIX Gateway & Email: OK — Status atualizado no Discord.');
        } else {
          toast.warning(`⚠️ API OK mas domínio "${responseData.domain_name}" não verificado. Configure o DNS.`);
        }
      }
    } catch (e: any) {
      setPingStatus('error');
      setPingResult({ error: e.message });
      toast.error('Erro ao conectar com a Edge Function.');
    }
  };



  if (!isMasterAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Acesso Restrito</h3>
            <p className="text-muted-foreground">
              Apenas administradores master podem acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSave = () => {
    updateConfig.mutate({
      api_key: apiKey,
      from_email: fromEmail,
      from_name: fromName,
      is_active: isActive,
      sandbox_mode: sandboxMode,
    });
  };

  const showDiagnostic = (result: ResendDiagnosticResult) => {
    setDiagnostic(result);
    setDiagnosticOpen(true);
    const label = `HTTP ${result.status_code} ${result.status_text}`;
    result.success ? toast.success(label, { description: result.message }) : toast.error(label, { description: result.message });
  };

  const handleTestConnection = async () => {
    setLegacyStatus('loading');
    const started = performance.now();
    try {
      if (!apiKey || !/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
        throw new Error('API Key ausente ou em formato inválido (esperado: re_...).');
      }

      const edgeUrl = `${EXTERNAL_SUPABASE_URL}/functions/v1/send-test-email`;
      const r = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EXTERNAL_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${EXTERNAL_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: testEmail || fromEmail || 'sandbox@ocultoswing.com.br',
          from_email: fromEmail || 'noreply@ocultoswing.com.br',
          from_name: fromName || 'Oculto Swing',
          subject: '[Oculto Swing] Ping de conexão Resend',
          html: '<p>Ping sandbox — validação de conectividade.</p>',
          api_key: apiKey,
          sandbox: sandboxMode === true,
        }),
      });
      const dur = Math.round(performance.now() - started);
      const raw = await r.text();
      let parsed: any = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch { /* noop */ }

      const ok = r.ok && parsed?.success !== false;
      const message = ok
        ? (parsed?.message || `Conexão OK via edge function (${dur}ms).`)
        : (parsed?.message || parsed?.error?.message || parsed?.error || `HTTP ${r.status} ${r.statusText}`);

      await persistIntegrationHealth('resend', ok ? 'OK' : 'FAIL', message);
      await queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['resend-config'] });

      showDiagnostic({
        success: ok,
        status_code: r.status,
        status_text: r.statusText,
        message,
        response: parsed,
        raw_body: raw,
        headers: Object.fromEntries(r.headers.entries()),
        proxy_used: 'edge:send-test-email',
      });
    } catch (e: any) {
      const message = e?.message || 'Falha no teste';
      await persistIntegrationHealth('resend', 'FAIL', message).catch(() => null);
      await queryClient.invalidateQueries({ queryKey: ['system-settings'] }).catch(() => null);
      if (e?.diagnostic) showDiagnostic(e.diagnostic);
      else toast.error('Falha no teste', { description: message });
    } finally {
      setLegacyStatus('idle');
    }
  };

  const handleSendTestEmail = async () => {
    setSendStatus('loading');
    try {
      showDiagnostic(await requestResendConnectionTest({ action: 'send_test_email', to: testEmail || fromEmail }));
    } catch (e: any) {
      if (e.diagnostic) showDiagnostic(e.diagnostic);
      else toast.error('Falha ao enviar teste', { description: e.message });
    } finally {
      setSendStatus('idle');
    }
  };

  const handleCorsTest = async () => {
    setCorsStatus('loading');
    try {
      showDiagnostic(await requestResendCorsPreflight());
    } finally {
      setCorsStatus('idle');
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardContent className="py-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="w-6 h-6" />
            Configuração Resend
          </h1>
          <p className="text-muted-foreground">
            Configure o gateway de emails para notificações automáticas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sandboxMode && isActive && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
              ⚠️ Sandbox
            </Badge>
          )}
          <Badge variant={isActive ? 'default' : 'secondary'}>
            {isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </div>

      {/* Sandbox Warning */}
      {sandboxMode && isActive && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Modo Sandbox Ativo:</strong> Emails são simulados e <strong>não são enviados de verdade</strong>.
            Para produção, desative o Modo Sandbox e certifique-se de que o domínio está verificado no Resend.
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Alert */}
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Configuração Sensível:</strong> A API Key do Resend permite enviar emails em nome da plataforma.
          Mantenha esta chave segura e nunca compartilhe.
        </AlertDescription>
      </Alert>

      {/* ── Ping / Auditoria em Tempo Real ────────────────────────────────── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <Globe className="h-4 w-4 text-primary" />
            </div>
            Auditoria de Infraestrutura (Ping)
          </CardTitle>
          <CardDescription className="text-xs">
            Valida a API Key, verifica o status do domínio DNS e atualiza o Discord. Processamento 100% no servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePing}
            disabled={pingStatus === 'loading' || !apiKey}
            className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
          >
            {pingStatus === 'loading' ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Verificando...</>
            ) : pingStatus === 'ok' ? (
              <><CheckCircle className="w-4 h-4 text-green-400" />Verificado ✓</>
            ) : pingStatus === 'error' ? (
              <><XCircle className="w-4 h-4 text-destructive" />Retry Ping</>
            ) : (
              <><TestTube className="w-4 h-4" />Executar Ping de Auditoria</>
            )}
          </Button>

          {/* Ping Result */}
          {pingResult && pingStatus === 'ok' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-400">API Key válida — Conexão OK</p>
                  <p className="text-xs text-muted-foreground">{pingResult.message}</p>
                </div>
              </div>

              {/* Domain Status */}
              <div className={`flex items-center justify-between p-3 rounded-lg border ${
                pingResult.domain_verified
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-yellow-500/10 border-yellow-500/20'
              }`}>
                <div>
                  <p className="text-sm font-medium">
                    {pingResult.domain_verified ? '✅ Domínio Verificado' : '⚠️ Domínio NÃO Verificado'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {pingResult.domain_name || 'domínio desconhecido'} — Status: <strong>{pingResult.domain_status || 'não encontrado'}</strong>
                  </p>
                </div>
                <Badge variant={pingResult.domain_verified ? 'default' : 'secondary'}>
                  {pingResult.domain_verified ? 'DNS OK' : 'DNS Pendente'}
                </Badge>
              </div>

              {/* DNS Records Hint */}
              {!pingResult.domain_verified && pingResult.domain_name && (
                <div className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Info className="h-3 w-3" /> Registros DNS necessários para {pingResult.domain_name}
                  </p>
                  <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
                    <p>TXT @ → v=spf1 include:amazonses.com ~all</p>
                    <p>TXT resend._domainkey → (DKIM — ver painel Resend)</p>
                    <p>MX 10 → feedback-smtp.us-east-1.amazonses.com</p>
                  </div>
                  <a
                    href="https://resend.com/domains"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    Ver registros exatos no Resend <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {pingResult.sandbox && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                  <p className="text-xs text-yellow-400">Modo Sandbox ativo — emails não são enviados de verdade.</p>
                </div>
              )}
            </div>
          )}

          {pingResult && pingStatus === 'error' && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <XCircle className="w-4 h-4 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">🚨 CRITICAL: Email Gateway Down</p>
                <p className="text-xs text-muted-foreground">{pingResult.error}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Alerta enviado automaticamente ao Discord.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Como Configurar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</span>
            <div>
              <p className="font-medium">Crie uma conta no Resend</p>
              <a 
                href="https://resend.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                https://resend.com <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">2</span>
            <div>
              <p className="font-medium">Valide seu domínio (DNS TXT + MX)</p>
              <a 
                href="https://resend.com/domains" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                https://resend.com/domains <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">3</span>
            <div>
              <p className="font-medium">Crie uma API Key e cole abaixo</p>
              <a 
                href="https://resend.com/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                https://resend.com/api-keys <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Credenciais da API</CardTitle>
          <CardDescription>
            Configure as credenciais do Resend para envio de emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="re_xxxxxxxxxxxxxxxxxxxx"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chave de API do Resend (começa com "re_")
            </p>
          </div>

          {/* From Email */}
          <div className="space-y-2">
            <Label htmlFor="fromEmail">Email de Envio</Label>
            <Input
              id="fromEmail"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="cobranca@seudominio.com"
            />
            <p className="text-xs text-muted-foreground">
              Email que aparecerá como remetente (deve estar em domínio verificado)
            </p>
          </div>

          {/* From Name */}
          <div className="space-y-2">
            <Label htmlFor="fromName">Nome do Remetente</Label>
            <Input
              id="fromName"
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Oculto Swing"
            />
          </div>

          <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-end rounded-lg border border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="testEmail">Email para teste de entrega</Label>
              <Input
                id="testEmail"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={fromEmail || 'seu-email@dominio.com'}
              />
            </div>
            <Button type="button" variant="outline" onClick={handleSendTestEmail} disabled={!apiKey || sendStatus === 'loading'}>
              {sendStatus === 'loading' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Enviar teste agora
            </Button>
            <Button type="button" variant="outline" onClick={handleCorsTest} disabled={corsStatus === 'loading'}>
              {corsStatus === 'loading' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
              Testar CORS/OPTIONS
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-3 rounded-lg bg-muted p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Último teste</p>
              <p className="font-medium">{config?.last_test_at ? new Date(config.last_test_at).toLocaleString('pt-BR') : 'Ainda não executado'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saúde</p>
              <p className={config?.last_test_status === 'FAIL' ? 'font-medium text-destructive' : 'font-medium text-primary'}>{config?.last_test_status || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Mensagem</p>
              <p className="font-medium truncate">{config?.last_test_message || '—'}</p>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="sandboxMode">Modo Sandbox</Label>
                <p className="text-xs text-muted-foreground">
                  Emails são logados mas não enviados de verdade
                </p>
              </div>
              <Switch
                id="sandboxMode"
                checked={sandboxMode}
                onCheckedChange={setSandboxMode}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="isActive">Gateway Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Ativar envio de emails de cobrança
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>

          {/* Status Indicator */}
          {apiKey && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              {isActive ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm">
                    Gateway configurado e {sandboxMode ? 'em modo sandbox' : 'ativo para produção'}
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <span className="text-sm">
                    API Key configurada, mas gateway desativado
                  </span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
            onClick={handleTestConnection}
            disabled={!apiKey || legacyStatus === 'loading'}
        >
          <TestTube className="w-4 h-4 mr-2" />
            {legacyStatus === 'loading' ? 'Testando...' : 'Testar Conexão (legacy)'}
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (config) {
                setApiKey(config.api_key_encrypted || '');
                setFromEmail(config.from_email || '');
                setFromName(config.from_name || '');
                setIsActive(config.is_active || false);
                setSandboxMode(config.sandbox_mode ?? true);
              }
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => updateConfig.mutate({ api_key: apiKey, from_email: fromEmail, from_name: fromName, is_active: isActive, sandbox_mode: sandboxMode })}
            disabled={updateConfig.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            {updateConfig.isPending ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </div>
      </div>

      {/* Usage Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uso do Gateway</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            O gateway de email é usado para enviar notificações automáticas:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Lembretes de pagamento (dias 3 e 7)
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Avisos de suspensão de conta
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              Confirmações de pagamento
            </li>
          </ul>
        </CardContent>
      </Card>

      <Dialog open={diagnosticOpen} onOpenChange={setDiagnosticOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultado detalhado do teste Resend</DialogTitle>
          </DialogHeader>
          {diagnostic && (
            <div className="space-y-3">
              <div className="grid md:grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">Status code</p><p className="font-semibold">{diagnostic.status_code}</p></div>
                <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">Estado</p><p className={diagnostic.success ? 'font-semibold text-primary' : 'font-semibold text-destructive'}>{diagnostic.success ? 'OK' : 'FAIL'}</p></div>
                <div className="rounded-lg bg-muted p-3"><p className="text-muted-foreground">Status text</p><p className="font-semibold">{diagnostic.status_text || '—'}</p></div>
              </div>
              {diagnostic.proxy_used && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="text-muted-foreground">Proxy CORS utilizado com sucesso</p>
                  <p className="font-mono text-xs break-all">{diagnostic.proxy_used}</p>
                </div>
              )}
              <div><Label>Mensagem completa</Label><Textarea readOnly rows={3} value={diagnostic.message} /></div>

              {diagnostic.attempts && diagnostic.attempts.length > 0 && (
                <div className="space-y-2">
                  <Label>Histórico de tentativas ({diagnostic.attempts.length})</Label>
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="p-2">#</th>
                          <th className="p-2">Hora</th>
                          <th className="p-2">Proxy</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">ms</th>
                          <th className="p-2">Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diagnostic.attempts.map((a, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="p-2 font-mono">{a.attempt}</td>
                            <td className="p-2 font-mono">{new Date(a.ts).toLocaleTimeString('pt-BR')}</td>
                            <td className="p-2 font-mono break-all max-w-[200px] truncate" title={a.proxy}>{new URL(a.proxy).host}</td>
                            <td className={`p-2 font-semibold ${a.ok ? 'text-primary' : 'text-destructive'}`}>{a.ok ? `✓ ${a.status}` : a.status ? `✗ ${a.status}` : '✗'}</td>
                            <td className="p-2">{a.duration_ms}</td>
                            <td className="p-2 text-destructive max-w-[180px] truncate" title={a.error}>{a.error || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div><Label>Headers retornados</Label><Textarea readOnly rows={4} value={JSON.stringify(diagnostic.headers, null, 2)} /></div>
              <div><Label>Body completo</Label><Textarea readOnly rows={8} value={JSON.stringify(diagnostic.response ?? diagnostic.raw_body, null, 2)} /></div>

              {!diagnostic.success && (
                <div className="flex justify-end pt-2 border-t border-border">
                  <Button
                    variant="default"
                    disabled={sendStatus === 'loading'}
                    onClick={handleSendTestEmail}
                  >
                    {sendStatus === 'loading' ? 'Tentando novamente...' : '🔁 Tentar novamente (com backoff)'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

