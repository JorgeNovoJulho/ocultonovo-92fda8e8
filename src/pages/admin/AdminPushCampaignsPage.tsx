import { useState } from "react";
import { AdminBroadcastPushCard } from "@/components/admin/AdminBroadcastPushCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Bell, Send, Users, Target, Clock, CheckCircle2, XCircle, 
  Zap, FileText, Plus, Trash2, Play, Pause, TrendingUp,
  MousePointerClick, Eye, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  usePushCampaigns,
  useCreatePushCampaign,
  useSendPushCampaign,
  useDeletePushCampaign,
  usePushTemplates,
  useCreatePushTemplate,
  useUpdatePushTemplate,
  useDeletePushTemplate,
  usePushAutomations,
  useUpdatePushAutomation,
  usePushStats,
  usePushTokensCount,
} from "@/hooks/usePushCampaigns";

export default function AdminPushCampaignsPage() {
  const [activeTab, setActiveTab] = useState("campaigns");
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  
  const { data: campaigns, isLoading: loadingCampaigns, refetch: refetchCampaigns } = usePushCampaigns();
  const { data: templates, isLoading: loadingTemplates } = usePushTemplates();
  const { data: automations, isLoading: loadingAutomations } = usePushAutomations();
  const { data: stats, isLoading: loadingStats } = usePushStats();
  const { data: tokensCount } = usePushTokensCount();
  
  const createCampaign = useCreatePushCampaign();
  const sendCampaign = useSendPushCampaign();
  const deleteCampaign = useDeletePushCampaign();
  const createTemplate = useCreatePushTemplate();
  const updateTemplate = useUpdatePushTemplate();
  const deleteTemplate = useDeletePushTemplate();
  const updateAutomation = useUpdatePushAutomation();
  
  // Form state para nova campanha
  const [newCampaign, setNewCampaign] = useState({
    title: "",
    body: "",
    url: "",
    target_type: "all",
    target_segment: "",
  });
  
  // Form state para novo template
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    title: "",
    body: "",
    category: "transactional",
  });

  const handleCreateCampaign = async () => {
    await createCampaign.mutateAsync(newCampaign);
    setNewCampaign({ title: "", body: "", url: "", target_type: "all", target_segment: "" });
    setShowNewCampaign(false);
  };

  const handleCreateTemplate = async () => {
    await createTemplate.mutateAsync(newTemplate);
    setNewTemplate({ name: "", title: "", body: "", category: "transactional" });
    setShowNewTemplate(false);
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode }> = {
      draft: { color: "bg-muted text-muted-foreground", icon: <FileText className="h-3 w-3" /> },
      scheduled: { color: "bg-blue-500/20 text-blue-400", icon: <Clock className="h-3 w-3" /> },
      sending: { color: "bg-amber-500/20 text-amber-400", icon: <Send className="h-3 w-3 animate-pulse" /> },
      sent: { color: "bg-green-500/20 text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
      failed: { color: "bg-destructive/20 text-destructive", icon: <XCircle className="h-3 w-3" /> },
    };
    const config = configs[status] || configs.draft;
    return (
      <Badge className={`${config.color} gap-1`}>
        {config.icon}
        {status}
      </Badge>
    );
  };

  const getCategoryBadge = (category?: string) => {
    const colors: Record<string, string> = {
      marketing: "bg-purple-500/20 text-purple-400",
      transactional: "bg-blue-500/20 text-blue-400",
      engagement: "bg-green-500/20 text-green-400",
      reminder: "bg-amber-500/20 text-amber-400",
    };
    return (
      <Badge className={colors[category || "transactional"] || colors.transactional}>
        {category || "transactional"}
      </Badge>
    );
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Push Notifications
          </h1>
          <p className="text-muted-foreground">
            Gerencie campanhas, templates, automações e broadcasts instantâneos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetchCampaigns()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Broadcast Global — destaque no topo */}
      <AdminBroadcastPushCard />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {loadingStats ? (
          Array(7).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="bg-gradient-to-br from-primary/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Send className="h-3 w-3" /> Campanhas
                </p>
                <p className="text-2xl font-bold">{stats?.total_campaigns || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Tokens Ativos
                </p>
                <p className="text-2xl font-bold">{tokensCount || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Send className="h-3 w-3" /> Enviados
                </p>
                <p className="text-2xl font-bold">{stats?.total_sent || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Entregues
                </p>
                <p className="text-2xl font-bold">{stats?.total_delivered || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MousePointerClick className="h-3 w-3" /> Cliques
                </p>
                <p className="text-2xl font-bold">{stats?.total_clicked || 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Taxa Entrega
                </p>
                <p className="text-2xl font-bold">{stats?.delivery_rate || 0}%</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Taxa Clique
                </p>
                <p className="text-2xl font-bold">{stats?.click_rate || 0}%</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="campaigns" className="gap-2">
            <Send className="h-4 w-4" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="automations" className="gap-2">
            <Zap className="h-4 w-4" />
            Automações
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Campanhas de Push</h2>
            <Dialog open={showNewCampaign} onOpenChange={setShowNewCampaign}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Campanha
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Campanha</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Título</Label>
                    <Input
                      value={newCampaign.title}
                      onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                      placeholder="🔔 Novidade especial!"
                    />
                  </div>
                  <div>
                    <Label>Mensagem</Label>
                    <Textarea
                      value={newCampaign.body}
                      onChange={(e) => setNewCampaign({ ...newCampaign, body: e.target.value })}
                      placeholder="Clique para ver as novidades..."
                    />
                  </div>
                  <div>
                    <Label>URL (opcional)</Label>
                    <Input
                      value={newCampaign.url}
                      onChange={(e) => setNewCampaign({ ...newCampaign, url: e.target.value })}
                      placeholder="/explore"
                    />
                  </div>
                  <div>
                    <Label>Audiência</Label>
                    <Select
                      value={newCampaign.target_type}
                      onValueChange={(v) => setNewCampaign({ ...newCampaign, target_type: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os usuários</SelectItem>
                        <SelectItem value="segment">Segmento específico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newCampaign.target_type === "segment" && (
                    <div>
                      <Label>Segmento</Label>
                      <Select
                        value={newCampaign.target_segment}
                        onValueChange={(v) => setNewCampaign({ ...newCampaign, target_segment: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subscribers">Assinantes Premium</SelectItem>
                          <SelectItem value="active_users">Usuários Ativos (7 dias)</SelectItem>
                          <SelectItem value="inactive_users">Usuários Inativos</SelectItem>
                          <SelectItem value="new_users">Novos Usuários</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button 
                    onClick={handleCreateCampaign} 
                    className="w-full"
                    disabled={!newCampaign.title || !newCampaign.body || createCampaign.isPending}
                  >
                    Criar Campanha
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <ScrollArea className="h-[500px]">
            {loadingCampaigns ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : campaigns?.length === 0 ? (
              <Card className="p-8 text-center">
                <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma campanha criada ainda</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {campaigns?.map((campaign) => (
                  <Card key={campaign.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{campaign.title}</h3>
                          {getStatusBadge(campaign.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate mb-2">
                          {campaign.body}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {campaign.target_type === "all" ? "Todos" : campaign.target_segment}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {campaign.total_recipients} destinatários
                          </span>
                          <span className="flex items-center gap-1">
                            <Send className="h-3 w-3" />
                            {campaign.sent_count} enviados
                          </span>
                          <span>
                            {format(new Date(campaign.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {campaign.status === "draft" && (
                          <Button 
                            size="sm" 
                            onClick={() => sendCampaign.mutate(campaign.id)}
                            disabled={sendCampaign.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Enviar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => deleteCampaign.mutate(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Templates de Notificação</h2>
            <Dialog open={showNewTemplate} onOpenChange={setShowNewTemplate}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Template</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Nome do Template</Label>
                    <Input
                      value={newTemplate.name}
                      onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                      placeholder="promo_black_friday"
                    />
                  </div>
                  <div>
                    <Label>Título</Label>
                    <Input
                      value={newTemplate.title}
                      onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                      placeholder="🎉 Promoção especial!"
                    />
                  </div>
                  <div>
                    <Label>Mensagem</Label>
                    <Textarea
                      value={newTemplate.body}
                      onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
                      placeholder="Use {{variavel}} para dados dinâmicos"
                    />
                  </div>
                  <div>
                    <Label>Categoria</Label>
                    <Select
                      value={newTemplate.category}
                      onValueChange={(v) => setNewTemplate({ ...newTemplate, category: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="transactional">Transacional</SelectItem>
                        <SelectItem value="engagement">Engajamento</SelectItem>
                        <SelectItem value="reminder">Lembrete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleCreateTemplate} 
                    className="w-full"
                    disabled={!newTemplate.name || !newTemplate.title || createTemplate.isPending}
                  >
                    Criar Template
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <ScrollArea className="h-[500px]">
            {loadingTemplates ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array(6).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates?.map((template) => (
                  <Card key={template.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium">{template.name}</h3>
                        {getCategoryBadge(template.category)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={template.is_active}
                          onCheckedChange={(checked) => 
                            updateTemplate.mutate({ id: template.id, is_active: checked })
                          }
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive h-8 w-8"
                          onClick={() => deleteTemplate.mutate(template.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <p className="font-medium text-sm">{template.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{template.body}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Usado {template.usage_count}x
                    </p>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Automations Tab */}
        <TabsContent value="automations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Automações de Push</h2>
          </div>

          <ScrollArea className="h-[500px]">
            {loadingAutomations ? (
              <div className="space-y-3">
                {Array(6).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {automations?.map((automation) => (
                  <Card key={automation.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className={`h-4 w-4 ${automation.is_active ? 'text-amber-400' : 'text-muted-foreground'}`} />
                          <h3 className="font-medium">{automation.name}</h3>
                          <Badge variant="outline" className="text-xs">
                            {automation.trigger_event}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">
                          {automation.custom_title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {automation.custom_body}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Triggered: {automation.triggered_count}x</span>
                          <span>Sent: {automation.sent_count}x</span>
                          {automation.delay_minutes > 0 && (
                            <span>Delay: {automation.delay_minutes}min</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={automation.is_active}
                          onCheckedChange={(checked) =>
                            updateAutomation.mutate({ id: automation.id, is_active: checked })
                          }
                        />
                        {automation.is_active ? (
                          <Badge className="bg-green-500/20 text-green-400">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Pausado</Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
