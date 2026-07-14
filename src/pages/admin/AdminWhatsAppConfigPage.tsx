import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";
import {
  persistIntegrationHealth,
  persistIntegrationReference,
} from "@/lib/integrationHealth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Settings,
  TestTube,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Send,
  Clock,
  AlertTriangle,
  Smartphone,
} from "lucide-react";

type WhatsAppProvider = "z-api" | "twilio" | "evolution-api" | "wppconnect";

interface WhatsAppConfig {
  id: string;
  provider: WhatsAppProvider;
  is_active: boolean;
  sandbox_mode: boolean;
  instance_id: string | null;
  api_key_encrypted: string | null;
  account_sid: string | null;
  from_number: string | null;
  webhook_secret: string | null;
  server_url: string | null;
  max_messages_per_hour: number;
  delay_between_messages_ms: number;
  cart_recovery_template: string;
  created_at: string;
  updated_at: string;
}

const defaultTemplate = `Oi {name}! 👋

Vi que você quase entrou para o meu VIP, mas algo aconteceu... 😢

Se precisar de ajuda ou tiver alguma dúvida, estou aqui!

👉 Clique aqui para continuar: {link}

Esse link é exclusivo e expira em breve! ⏰`;

export default function AdminWhatsAppConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testPhone, setTestPhone] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Fetch config
  const { data: config, isLoading } = useQuery({
    queryKey: ["whatsapp-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_config")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as WhatsAppConfig | null;
    },
  });

  // Local state for form
  const [formData, setFormData] = useState<Partial<WhatsAppConfig>>({
    provider: "z-api",
    is_active: false,
    sandbox_mode: true,
    instance_id: "",
    api_key_encrypted: "",
    account_sid: "",
    from_number: "",
    webhook_secret: "",
    max_messages_per_hour: 100,
    delay_between_messages_ms: 3000,
    cart_recovery_template: defaultTemplate,
  });

  // Update form when config loads
  useEffect(() => {
    if (config) {
      setFormData({
        ...config,
        api_key_encrypted: config.api_key_encrypted || "",
        instance_id: config.instance_id || "",
        account_sid: config.account_sid || "",
        from_number: config.from_number || "",
        webhook_secret: config.webhook_secret || "",
      });
    }
  }, [config]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: Partial<WhatsAppConfig>) => {
      const payload = {
        provider: data.provider,
        is_active: data.is_active,
        sandbox_mode: data.sandbox_mode,
        instance_id: data.instance_id || null,
        api_key_encrypted: data.api_key_encrypted || null,
        account_sid: data.account_sid || null,
        from_number: data.from_number || null,
        webhook_secret: data.webhook_secret || null,
        server_url: data.server_url || null,
        max_messages_per_hour: data.max_messages_per_hour || 100,
        delay_between_messages_ms: data.delay_between_messages_ms || 3000,
        cart_recovery_template: data.cart_recovery_template || defaultTemplate,
        updated_at: new Date().toISOString(),
      };

      if (config?.id) {
        const { error } = await supabase
          .from("whatsapp_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("whatsapp_config")
          .insert(payload);
        if (error) throw error;
      }

      await persistIntegrationReference(
        "whatsapp",
        "WhatsApp referenciado — aguardando teste de conexão",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-config"] });
      toast({
        title: "Referência salva — ainda não validada",
        description:
          "Clique em Testar Conexão para atualizar o status para Operacional.",
      });
    },
    onError: (error: any) => {
      const msg =
        error?.message ||
        error?.details ||
        error?.hint ||
        JSON.stringify(error);
      toast({
        title: "Erro ao salvar",
        description: msg,
        variant: "destructive",
      });
    },
  });

  // Test connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke(
        "whatsapp-gateway",
        {
          body: { action: "test-connection" },
        },
      );

      if (error) throw error;
      await persistIntegrationHealth(
        "whatsapp",
        data?.success ? "OK" : "FAIL",
        data?.message ||
          data?.error ||
          (data?.success
            ? "WhatsApp operacional ✅"
            : "Falha ao validar WhatsApp"),
      );
      setTestResult(data);
    } catch (err) {
      await persistIntegrationHealth("whatsapp", "FAIL", String(err)).catch(
        () => null,
      );
      setTestResult({ success: false, message: String(err) });
    } finally {
      setIsTesting(false);
    }
  };

  // Send test message
  const handleSendTestMessage = async () => {
    if (!testPhone) {
      toast({ title: "Digite um número", variant: "destructive" });
      return;
    }

    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "whatsapp-gateway",
        {
          body: {
            action: "send",
            phone: testPhone,
            message: formData.cart_recovery_template
              ?.replace("{name}", "Teste")
              .replace("{link}", "https://exemplo.com/checkout"),
          },
        },
      );

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Mensagem enviada!",
          description: data.sandbox
            ? "Modo sandbox: mensagem simulada"
            : "Mensagem real enviada",
        });
      } else {
        toast({
          title: "Falha no envio",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Trigger manual cart recovery
  const handleTriggerRecovery = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "recover-abandoned-carts",
      );
      if (error) throw error;

      toast({
        title: "Recuperação executada!",
        description: `Processados: ${data.processed}, Enviados: ${data.sent}, Recuperados: ${data.alreadyRecovered}`,
      });
    } catch (err) {
      toast({
        title: "Erro",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const updateField = (field: keyof WhatsAppConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-500" />
            Configuração WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Configure a recuperação de carrinho via WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-2">
          {formData.sandbox_mode && (
            <Badge
              variant="outline"
              className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
            >
              <TestTube className="h-3 w-3 mr-1" />
              Sandbox
            </Badge>
          )}
          {formData.is_active ? (
            <Badge className="bg-green-500/10 text-green-600 border-green-500/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <XCircle className="h-3 w-3 mr-1" />
              Inativo
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config">
            <Settings className="h-4 w-4 mr-2" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="template">
            <MessageCircle className="h-4 w-4 mr-2" />
            Template
          </TabsTrigger>
          <TabsTrigger value="test">
            <TestTube className="h-4 w-4 mr-2" />
            Testes
          </TabsTrigger>
        </TabsList>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Provider Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Provedor de WhatsApp</CardTitle>
                <CardDescription>
                  Escolha a API que será utilizada
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Provedor</Label>
                  <Select
                    value={formData.provider}
                    onValueChange={(v) =>
                      updateField("provider", v as WhatsAppProvider)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="z-api">Z-API</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="evolution-api">
                        Evolution API
                      </SelectItem>
                      <SelectItem value="wppconnect">WPPConnect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Provider-specific fields */}
                {formData.provider === "z-api" && (
                  <>
                    <div className="space-y-2">
                      <Label>Instance ID</Label>
                      <Input
                        value={formData.instance_id || ""}
                        onChange={(e) =>
                          updateField("instance_id", e.target.value)
                        }
                        placeholder="Ex: 3C8A2B1D..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Token</Label>
                      <Input
                        type="password"
                        value={formData.api_key_encrypted || ""}
                        onChange={(e) =>
                          updateField("api_key_encrypted", e.target.value)
                        }
                        placeholder="Seu token Z-API"
                      />
                    </div>
                  </>
                )}

                {formData.provider === "twilio" && (
                  <>
                    <div className="space-y-2">
                      <Label>Account SID</Label>
                      <Input
                        value={formData.account_sid || ""}
                        onChange={(e) =>
                          updateField("account_sid", e.target.value)
                        }
                        placeholder="ACxxxxxxxx..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Auth Token</Label>
                      <Input
                        type="password"
                        value={formData.api_key_encrypted || ""}
                        onChange={(e) =>
                          updateField("api_key_encrypted", e.target.value)
                        }
                        placeholder="Seu Auth Token"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Número WhatsApp (From)</Label>
                      <Input
                        value={formData.from_number || ""}
                        onChange={(e) =>
                          updateField("from_number", e.target.value)
                        }
                        placeholder="+5511999999999"
                      />
                    </div>
                  </>
                )}

                {formData.provider === "evolution-api" && (
                  <>
                    <div className="space-y-2">
                      <Label>URL do Servidor</Label>
                      <Input
                        value={formData.server_url || ""}
                        onChange={(e) =>
                          updateField("server_url", e.target.value)
                        }
                        placeholder="https://sua-instancia.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Instance ID</Label>
                      <Input
                        value={formData.instance_id || ""}
                        onChange={(e) =>
                          updateField("instance_id", e.target.value)
                        }
                        placeholder="Nome da instância"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        value={formData.api_key_encrypted || ""}
                        onChange={(e) =>
                          updateField("api_key_encrypted", e.target.value)
                        }
                        placeholder="Sua API Key"
                      />
                    </div>
                  </>
                )}

                {formData.provider === "wppconnect" && (
                  <>
                    <div className="space-y-2">
                      <Label>URL do Servidor</Label>
                      <Input
                        value={formData.server_url || ""}
                        onChange={(e) =>
                          updateField("server_url", e.target.value)
                        }
                        placeholder="http://localhost:21465"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Session Name</Label>
                      <Input
                        value={formData.instance_id || ""}
                        onChange={(e) =>
                          updateField("instance_id", e.target.value)
                        }
                        placeholder="minha-sessao"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Secret Key</Label>
                      <Input
                        type="password"
                        value={formData.api_key_encrypted || ""}
                        onChange={(e) =>
                          updateField("api_key_encrypted", e.target.value)
                        }
                        placeholder="Sua Secret Key"
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Configurações Gerais</CardTitle>
                <CardDescription>
                  Controles do sistema de recuperação
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Gateway Ativo</Label>
                    <p className="text-sm text-muted-foreground">
                      Habilita o envio de mensagens
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(v) => updateField("is_active", v)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-2">
                      Modo Sandbox
                      <Badge variant="outline" className="text-xs">
                        Recomendado para testes
                      </Badge>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Simula envios sem gastar créditos
                    </p>
                  </div>
                  <Switch
                    checked={formData.sandbox_mode}
                    onCheckedChange={(v) => updateField("sandbox_mode", v)}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Delay entre Mensagens (ms)
                  </Label>
                  <Input
                    type="number"
                    min={1000}
                    max={60000}
                    value={formData.delay_between_messages_ms || 3000}
                    onChange={(e) =>
                      updateField(
                        "delay_between_messages_ms",
                        parseInt(e.target.value) || 3000,
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Intervalo entre envios para evitar bloqueio (padrão: 3000ms)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Máx. Mensagens por Hora</Label>
                  <Input
                    type="number"
                    min={10}
                    max={500}
                    value={formData.max_messages_per_hour || 100}
                    onChange={(e) =>
                      updateField(
                        "max_messages_per_hour",
                        parseInt(e.target.value) || 100,
                      )
                    }
                  />
                </div>

                {!formData.sandbox_mode && formData.is_active && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Modo Produção Ativo
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Mensagens reais serão enviadas para os usuários
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate(formData)}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Configurações
            </Button>
          </div>
        </TabsContent>

        {/* Template Tab */}
        <TabsContent value="template" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Template da Mensagem</CardTitle>
              <CardDescription>
                Personalize a mensagem de recuperação de carrinho
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Variáveis disponíveis:</Label>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {"{name}"} - Nome do usuário
                  </Badge>
                  <Badge variant="secondary">
                    {"{link}"} - Magic Link do checkout
                  </Badge>
                  <Badge variant="secondary">{"{plan}"} - Nome do plano</Badge>
                  <Badge variant="secondary">{"{amount}"} - Valor</Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Editor</Label>
                  <Textarea
                    value={formData.cart_recovery_template || defaultTemplate}
                    onChange={(e) =>
                      updateField("cart_recovery_template", e.target.value)
                    }
                    className="min-h-[300px] font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="bg-[#e5ddd5] rounded-lg p-4 min-h-[300px]">
                    <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[90%] ml-auto shadow">
                      <p className="text-sm whitespace-pre-wrap">
                        {(formData.cart_recovery_template || defaultTemplate)
                          .replace("{name}", "Maria")
                          .replace(
                            "{link}",
                            "https://oculto.app/checkout/abc123",
                          )
                          .replace("{plan}", "VIP Anual")
                          .replace("{amount}", "R$ 199,90")}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-gray-500">14:32</span>
                        <CheckCircle2 className="h-3 w-3 text-blue-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => saveMutation.mutate(formData)}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Tab */}
        <TabsContent value="test" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Connection Test */}
            <Card>
              <CardHeader>
                <CardTitle>Teste de Conexão</CardTitle>
                <CardDescription>
                  Verifique se as credenciais estão corretas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="w-full"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  Testar Conexão
                </Button>

                {testResult && (
                  <div
                    className={`p-3 rounded-lg ${
                      testResult.success
                        ? "bg-green-500/10 border border-green-500/30"
                        : "bg-destructive/10 border border-destructive/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-sm font-medium">
                        {testResult.success ? "Conexão OK" : "Falha na conexão"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {testResult.message}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Send Test Message */}
            <Card>
              <CardHeader>
                <CardTitle>Enviar Mensagem de Teste</CardTitle>
                <CardDescription>
                  Teste o envio para um número específico
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Número de Telefone</Label>
                  <div className="flex gap-2">
                    <Input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="5511999999999"
                    />
                    <Button
                      onClick={handleSendTestMessage}
                      disabled={isTesting || !testPhone}
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formato: código do país + DDD + número (sem espaços)
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Manual Trigger */}
          <Card>
            <CardHeader>
              <CardTitle>Executar Recuperação Manual</CardTitle>
              <CardDescription>
                Processa carrinhos abandonados agora (ignora cron)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleTriggerRecovery} variant="outline">
                <Smartphone className="h-4 w-4 mr-2" />
                Processar Carrinhos Abandonados
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
