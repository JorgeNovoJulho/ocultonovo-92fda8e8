import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Webhook, 
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Key,
  Eye,
  EyeOff,
  Copy,
  Activity
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useWebhookEndpoints,
  useWebhookLogs,
  useWebhookEventTypes,
  useWebhookStats,
  useCreateWebhookEndpoint,
  useUpdateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
} from '@/hooks/useWebhooks';
import { toast } from '@/hooks/use-toast';

export default function AdminWebhooksPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newWebhook, setNewWebhook] = useState({ name: '', url: '', description: '', events: [] as string[] });
  const [newApiKey, setNewApiKey] = useState({ name: '', description: '', permissions: ['read'] });
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const { data: endpoints, isLoading, refetch } = useWebhookEndpoints();
  const { data: logs } = useWebhookLogs();
  const { data: eventTypes } = useWebhookEventTypes();
  const { data: stats } = useWebhookStats();
  const { data: apiKeys } = useApiKeys();

  const createEndpoint = useCreateWebhookEndpoint();
  const updateEndpoint = useUpdateWebhookEndpoint();
  const deleteEndpoint = useDeleteWebhookEndpoint();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();

  const handleCreateWebhook = async () => {
    if (!newWebhook.name || !newWebhook.url) return;
    
    await createEndpoint.mutateAsync(newWebhook);
    setNewWebhook({ name: '', url: '', description: '', events: [] });
    setIsCreateOpen(false);
  };

  const handleCreateApiKey = async () => {
    if (!newApiKey.name) return;
    
    const result = await createApiKey.mutateAsync(newApiKey);
    setCreatedKey(result.raw_key);
    setNewApiKey({ name: '', description: '', permissions: ['read'] });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copiado!' });
  };

  const groupedEvents = eventTypes?.reduce((acc, evt) => {
    if (!acc[evt.category]) acc[evt.category] = [];
    acc[evt.category].push(evt);
    return acc;
  }, {} as Record<string, typeof eventTypes>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks & API</h1>
          <p className="text-muted-foreground">Gerencie integrações e chaves de API</p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_endpoints || 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.active_endpoints || 0} ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requisições Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_logs_today || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sucesso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.successful_today || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Falhas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.failed_today || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(stats?.avg_response_time || 0)}ms</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="webhooks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Webhooks
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="api-keys">
            <Key className="h-4 w-4 mr-2" />
            API Keys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Endpoints de Webhook</CardTitle>
                  <CardDescription>Configure URLs para receber eventos</CardDescription>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Webhook
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Criar Webhook</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Nome</Label>
                          <Input
                            value={newWebhook.name}
                            onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                            placeholder="Meu Webhook"
                          />
                        </div>
                        <div>
                          <Label>URL</Label>
                          <Input
                            value={newWebhook.url}
                            onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                            placeholder="https://api.example.com/webhook"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Descrição</Label>
                        <Textarea
                          value={newWebhook.description}
                          onChange={(e) => setNewWebhook({ ...newWebhook, description: e.target.value })}
                          placeholder="Descrição opcional..."
                        />
                      </div>
                      <div>
                        <Label className="mb-3 block">Eventos</Label>
                        <div className="grid grid-cols-2 gap-4 max-h-60 overflow-y-auto">
                          {Object.entries(groupedEvents || {}).map(([category, events]) => (
                            <div key={category} className="space-y-2">
                              <p className="text-sm font-medium capitalize">{category}</p>
                              {events?.map((evt) => (
                                <div key={evt.code} className="flex items-center gap-2">
                                  <Checkbox
                                    checked={newWebhook.events.includes(evt.code)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setNewWebhook({ ...newWebhook, events: [...newWebhook.events, evt.code] });
                                      } else {
                                        setNewWebhook({ ...newWebhook, events: newWebhook.events.filter(e => e !== evt.code) });
                                      }
                                    }}
                                  />
                                  <span className="text-sm">{evt.name}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button 
                        onClick={handleCreateWebhook} 
                        disabled={createEndpoint.isPending}
                        className="w-full"
                      >
                        Criar Webhook
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando...</div>
              ) : endpoints?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum webhook configurado
                </div>
              ) : (
                <div className="space-y-3">
                  {endpoints?.map((endpoint) => (
                    <div 
                      key={endpoint.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          endpoint.is_active ? 'bg-green-500/10' : 'bg-muted'
                        }`}>
                          <Webhook className={`h-5 w-5 ${endpoint.is_active ? 'text-green-600' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{endpoint.name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{endpoint.url}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="flex flex-wrap gap-1">
                          {endpoint.events.slice(0, 3).map((evt) => (
                            <Badge key={evt} variant="outline" className="text-xs">{evt}</Badge>
                          ))}
                          {endpoint.events.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{endpoint.events.length - 3}</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setShowSecrets(prev => ({ ...prev, [endpoint.id]: !prev[endpoint.id] }));
                            }}
                          >
                            {showSecrets[endpoint.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          {showSecrets[endpoint.id] && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => copyToClipboard(endpoint.secret_key)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        <Switch
                          checked={endpoint.is_active}
                          onCheckedChange={(checked) => updateEndpoint.mutate({ id: endpoint.id, is_active: checked })}
                        />
                        
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm('Remover este webhook?')) {
                              deleteEndpoint.mutate(endpoint.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs de Webhook</CardTitle>
              <CardDescription>Histórico de requisições enviadas</CardDescription>
            </CardHeader>
            <CardContent>
              {logs?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum log encontrado
                </div>
              ) : (
                <div className="space-y-2">
                  {logs?.map((log) => (
                    <div 
                      key={log.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {log.success ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{log.event_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        {log.response_status && (
                          <Badge variant={log.success ? 'default' : 'destructive'}>
                            {log.response_status}
                          </Badge>
                        )}
                        {log.response_time_ms && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {log.response_time_ms}ms
                          </span>
                        )}
                        {log.error_message && (
                          <span className="text-red-600 text-xs max-w-48 truncate">{log.error_message}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Chaves de acesso para integrações</CardDescription>
                </div>
                <Dialog open={isCreateKeyOpen} onOpenChange={(open) => {
                  setIsCreateKeyOpen(open);
                  if (!open) setCreatedKey(null);
                }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Nova API Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Criar API Key</DialogTitle>
                    </DialogHeader>
                    {createdKey ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                          <p className="text-sm font-medium text-yellow-600 mb-2">
                            ⚠️ Guarde esta chave em local seguro. Ela não será exibida novamente!
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                              {createdKey}
                            </code>
                            <Button size="icon" variant="outline" onClick={() => copyToClipboard(createdKey)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <Button className="w-full" onClick={() => { setIsCreateKeyOpen(false); setCreatedKey(null); }}>
                          Fechar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <Label>Nome</Label>
                          <Input
                            value={newApiKey.name}
                            onChange={(e) => setNewApiKey({ ...newApiKey, name: e.target.value })}
                            placeholder="Nome da chave"
                          />
                        </div>
                        <div>
                          <Label>Descrição</Label>
                          <Textarea
                            value={newApiKey.description}
                            onChange={(e) => setNewApiKey({ ...newApiKey, description: e.target.value })}
                            placeholder="Uso da chave..."
                          />
                        </div>
                        <Button 
                          onClick={handleCreateApiKey} 
                          disabled={createApiKey.isPending}
                          className="w-full"
                        >
                          Criar API Key
                        </Button>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {apiKeys?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma API Key criada
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys?.map((key) => (
                    <div 
                      key={key.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          key.is_active ? 'bg-primary/10' : 'bg-muted'
                        }`}>
                          <Key className={`h-5 w-5 ${key.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-sm text-muted-foreground font-mono">{key.key_prefix}...****</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right text-sm">
                          <p className="text-muted-foreground">{key.usage_count} usos</p>
                          {key.last_used_at && (
                            <p className="text-xs text-muted-foreground">
                              Último: {format(new Date(key.last_used_at), 'dd/MM HH:mm')}
                            </p>
                          )}
                        </div>
                        
                        <Badge variant={key.is_active ? 'default' : 'secondary'}>
                          {key.is_active ? 'Ativa' : 'Revogada'}
                        </Badge>
                        
                        {key.is_active && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              if (confirm('Revogar esta API Key?')) {
                                revokeApiKey.mutate(key.id);
                              }
                            }}
                          >
                            Revogar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
