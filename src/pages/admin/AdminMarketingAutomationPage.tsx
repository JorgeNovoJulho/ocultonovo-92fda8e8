import React, { useState } from 'react';
import { 
  Megaphone, 
  Zap, 
  Mail, 
  Bell, 
  Users, 
  Play,
  Pause,
  Plus,
  BarChart3,
  Clock,
  Target,
  RefreshCw,
  Trash2,
  Edit,
  Eye,
  Send,
  Gift
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import {
  useMarketingCampaigns,
  useCreateCampaign,
  useUpdateCampaign,
  useDeleteCampaign,
  useExecuteCampaign,
  useReengagementRules,
  useCreateReengagementRule,
  useUpdateReengagementRule,
  useDeleteReengagementRule,
  useToggleReengagementRule,
  useCampaignStats,
  useTriggerReengagementCheck,
  type MarketingCampaign,
  type ReengagementRule,
} from '@/hooks/useMarketingAutomation';
import { useEmailTemplates } from '@/hooks/useEmailTemplates';

const TRIGGER_CONDITIONS = [
  { value: 'inactive_3d', label: 'Inativo há 3 dias' },
  { value: 'inactive_7d', label: 'Inativo há 7 dias' },
  { value: 'inactive_14d', label: 'Inativo há 14 dias' },
  { value: 'inactive_30d', label: 'Inativo há 30 dias' },
  { value: 'subscription_expiring_3d', label: 'Assinatura expira em 3 dias' },
  { value: 'subscription_expiring_7d', label: 'Assinatura expira em 7 dias' },
  { value: 'cart_abandoned_1h', label: 'Carrinho abandonado (1h)' },
  { value: 'cart_abandoned_24h', label: 'Carrinho abandonado (24h)' },
  { value: 'new_user_no_activity', label: 'Novo usuário sem atividade' },
];

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Todos os usuários' },
  { value: 'active', label: 'Usuários ativos (7 dias)' },
  { value: 'inactive', label: 'Usuários inativos (14+ dias)' },
  { value: 'new', label: 'Novos usuários (7 dias)' },
  { value: 'churned', label: 'Usuários perdidos (30+ dias)' },
];

function StatCard({ title, value, icon: Icon, description }: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    active: 'bg-green-100 text-green-700',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-200 text-gray-600',
  };
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    active: 'Ativa',
    paused: 'Pausada',
    completed: 'Concluída',
    archived: 'Arquivada',
  };
  return <Badge className={styles[status] || styles.draft}>{labels[status] || status}</Badge>;
}

function CampaignTypeBadge({ type }: { type: string }) {
  const icons: Record<string, React.ElementType> = {
    email: Mail,
    push: Bell,
    both: Megaphone,
  };
  const Icon = icons[type] || Megaphone;
  return (
    <Badge variant="outline" className="gap-1">
      <Icon className="h-3 w-3" />
      {type === 'both' ? 'Email + Push' : type === 'email' ? 'Email' : 'Push'}
    </Badge>
  );
}

export default function AdminMarketingAutomationPage() {
  const { data: isAdmin } = useIsMasterAdmin();
  const { data: campaigns, isLoading: loadingCampaigns } = useMarketingCampaigns();
  const { data: rules, isLoading: loadingRules } = useReengagementRules();
  const { data: stats } = useCampaignStats();
  const { data: templates } = useEmailTemplates();
  
  const createCampaign = useCreateCampaign();
  const updateCampaign = useUpdateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const executeCampaign = useExecuteCampaign();
  
  const createRule = useCreateReengagementRule();
  const updateRule = useUpdateReengagementRule();
  const deleteRule = useDeleteReengagementRule();
  const toggleRule = useToggleReengagementRule();
  const triggerCheck = useTriggerReengagementCheck();

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<MarketingCampaign | null>(null);
  const [editingRule, setEditingRule] = useState<ReengagementRule | null>(null);

  // Campaign form state
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    description: '',
    type: 'push' as 'email' | 'push' | 'both',
    trigger_type: 'manual' as 'manual' | 'scheduled' | 'event_based',
    target_audience: 'all' as 'all' | 'active' | 'inactive' | 'new' | 'churned' | 'custom',
    email_template_id: '',
    push_title: '',
    push_body: '',
    push_url: '/feed',
    scheduled_at: '',
  });

  // Rule form state
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    trigger_condition: 'inactive_7d',
    action_type: 'push' as 'email' | 'push' | 'both' | 'coupon',
    email_template_id: '',
    push_title: '',
    push_body: '',
    coupon_discount: 10,
    coupon_valid_days: 7,
    cooldown_days: 7,
    priority: 5,
  });

  // isAdmin already derived from useIsMasterAdmin()

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Acesso restrito a administradores de marketing.</p>
      </div>
    );
  }

  const handleSaveCampaign = async () => {
    if (editingCampaign) {
      await updateCampaign.mutateAsync({ id: editingCampaign.id, ...campaignForm });
    } else {
      await createCampaign.mutateAsync(campaignForm);
    }
    setShowCampaignModal(false);
    setEditingCampaign(null);
    resetCampaignForm();
  };

  const handleSaveRule = async () => {
    if (editingRule) {
      await updateRule.mutateAsync({ id: editingRule.id, ...ruleForm });
    } else {
      await createRule.mutateAsync(ruleForm);
    }
    setShowRuleModal(false);
    setEditingRule(null);
    resetRuleForm();
  };

  const resetCampaignForm = () => {
    setCampaignForm({
      name: '',
      description: '',
      type: 'push',
      trigger_type: 'manual',
      target_audience: 'all',
      email_template_id: '',
      push_title: '',
      push_body: '',
      push_url: '/feed',
      scheduled_at: '',
    });
  };

  const resetRuleForm = () => {
    setRuleForm({
      name: '',
      description: '',
      trigger_condition: 'inactive_7d',
      action_type: 'push',
      email_template_id: '',
      push_title: '',
      push_body: '',
      coupon_discount: 10,
      coupon_valid_days: 7,
      cooldown_days: 7,
      priority: 5,
    });
  };

  const openEditCampaign = (campaign: MarketingCampaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name,
      description: campaign.description || '',
      type: campaign.type,
      trigger_type: campaign.trigger_type,
      target_audience: campaign.target_audience as 'all' | 'active' | 'inactive' | 'new' | 'churned' | 'custom',
      email_template_id: campaign.email_template_id || '',
      push_title: campaign.push_title || '',
      push_body: campaign.push_body || '',
      push_url: campaign.push_url || '/feed',
      scheduled_at: campaign.scheduled_at || '',
    });
    setShowCampaignModal(true);
  };

  const openEditRule = (rule: ReengagementRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      trigger_condition: rule.trigger_condition,
      action_type: rule.action_type,
      email_template_id: rule.email_template_id || '',
      push_title: rule.push_title || '',
      push_body: rule.push_body || '',
      coupon_discount: rule.coupon_discount || 10,
      coupon_valid_days: rule.coupon_valid_days || 7,
      cooldown_days: rule.cooldown_days,
      priority: rule.priority,
    });
    setShowRuleModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            Automação de Marketing
          </h1>
          <p className="text-muted-foreground mt-1">
            Campanhas, re-engajamento e notificações automáticas
          </p>
        </div>
        <Button onClick={() => triggerCheck.mutate()} disabled={triggerCheck.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${triggerCheck.isPending ? 'animate-spin' : ''}`} />
          Verificar Re-engajamento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard 
          title="Campanhas Ativas" 
          value={stats?.active || 0} 
          icon={Megaphone}
          description={`${stats?.total || 0} total`}
        />
        <StatCard 
          title="Mensagens Enviadas" 
          value={stats?.totalSent || 0} 
          icon={Send}
        />
        <StatCard 
          title="Taxa de Abertura" 
          value={stats?.totalSent ? `${Math.round((stats.totalOpened / stats.totalSent) * 100)}%` : '0%'} 
          icon={Eye}
        />
        <StatCard 
          title="Conversões" 
          value={stats?.totalConverted || 0} 
          icon={Target}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Campanhas
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Zap className="h-4 w-4" />
            Re-engajamento
          </TabsTrigger>
        </TabsList>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetCampaignForm(); setShowCampaignModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Campanha
            </Button>
          </div>

          {loadingCampaigns ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns?.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma campanha criada ainda.</p>
                </Card>
              ) : (
                campaigns?.map(campaign => (
                  <Card key={campaign.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{campaign.name}</h3>
                          <CampaignStatusBadge status={campaign.status} />
                          <CampaignTypeBadge type={campaign.type} />
                        </div>
                        <p className="text-sm text-muted-foreground">{campaign.description}</p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {AUDIENCE_OPTIONS.find(a => a.value === campaign.target_audience)?.label}
                          </span>
                          <span className="flex items-center gap-1">
                            <Send className="h-3 w-3" />
                            {campaign.stats?.sent || 0} enviados
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {campaign.stats?.opened || 0} abertos
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {campaign.status === 'draft' && (
                          <Button 
                            size="sm" 
                            onClick={() => executeCampaign.mutate(campaign.id)}
                            disabled={executeCampaign.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Enviar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEditCampaign(campaign)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-destructive"
                          onClick={() => deleteCampaign.mutate(campaign.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* Reengagement Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetRuleForm(); setShowRuleModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Regra
            </Button>
          </div>

          {loadingRules ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {rules?.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma regra de re-engajamento criada.</p>
                </Card>
              ) : (
                rules?.map(rule => (
                  <Card key={rule.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold">{rule.name}</h3>
                          <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                            {rule.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                          <Badge variant="outline">
                            {rule.action_type === 'email' && <Mail className="h-3 w-3 mr-1" />}
                            {rule.action_type === 'push' && <Bell className="h-3 w-3 mr-1" />}
                            {rule.action_type === 'both' && <Megaphone className="h-3 w-3 mr-1" />}
                            {rule.action_type === 'coupon' && <Gift className="h-3 w-3 mr-1" />}
                            {rule.action_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {TRIGGER_CONDITIONS.find(t => t.value === rule.trigger_condition)?.label}
                        </p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            {rule.stats?.triggered || 0} disparados
                          </span>
                          <span className="flex items-center gap-1">
                            <Send className="h-3 w-3" />
                            {rule.stats?.sent || 0} enviados
                          </span>
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {rule.stats?.converted || 0} convertidos
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Cooldown: {rule.cooldown_days} dias
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch 
                          checked={rule.is_active} 
                          onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, is_active: checked })}
                        />
                        <Button size="sm" variant="outline" onClick={() => openEditRule(rule)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-destructive"
                          onClick={() => deleteRule.mutate(rule.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Campaign Modal */}
      <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle>
            <DialogDescription>Configure sua campanha de marketing</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input 
                  value={campaignForm.name} 
                  onChange={e => setCampaignForm(f => ({ ...f, name: e.target.value }))} 
                  placeholder="Ex: Black Friday 2025"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select 
                  value={campaignForm.type} 
                  onValueChange={v => setCampaignForm(f => ({ ...f, type: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="push">Push Notification</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="both">Email + Push</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={campaignForm.description} 
                onChange={e => setCampaignForm(f => ({ ...f, description: e.target.value }))} 
                placeholder="Descrição da campanha..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Audiência</Label>
                <Select 
                  value={campaignForm.target_audience} 
                  onValueChange={v => setCampaignForm(f => ({ ...f, target_audience: v as 'all' | 'active' | 'inactive' | 'new' | 'churned' | 'custom' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Disparo</Label>
                <Select 
                  value={campaignForm.trigger_type} 
                  onValueChange={v => setCampaignForm(f => ({ ...f, trigger_type: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {campaignForm.trigger_type === 'scheduled' && (
              <div className="space-y-2">
                <Label>Data/Hora do Envio</Label>
                <Input 
                  type="datetime-local" 
                  value={campaignForm.scheduled_at} 
                  onChange={e => setCampaignForm(f => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
            )}

            {(campaignForm.type === 'push' || campaignForm.type === 'both') && (
              <>
                <div className="space-y-2">
                  <Label>Título do Push</Label>
                  <Input 
                    value={campaignForm.push_title} 
                    onChange={e => setCampaignForm(f => ({ ...f, push_title: e.target.value }))} 
                    placeholder="Ex: 🔥 Oferta Especial!"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem do Push</Label>
                  <Textarea 
                    value={campaignForm.push_body} 
                    onChange={e => setCampaignForm(f => ({ ...f, push_body: e.target.value }))} 
                    placeholder="Ex: Aproveite 50% de desconto hoje!"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL de destino</Label>
                  <Input 
                    value={campaignForm.push_url} 
                    onChange={e => setCampaignForm(f => ({ ...f, push_url: e.target.value }))} 
                    placeholder="/feed"
                  />
                </div>
              </>
            )}

            {(campaignForm.type === 'email' || campaignForm.type === 'both') && (
              <div className="space-y-2">
                <Label>Template de Email</Label>
                <Select 
                  value={campaignForm.email_template_id} 
                  onValueChange={v => setCampaignForm(f => ({ ...f, email_template_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignModal(false)}>Cancelar</Button>
            <Button 
              onClick={handleSaveCampaign} 
              disabled={createCampaign.isPending || updateCampaign.isPending || !campaignForm.name}
            >
              {editingCampaign ? 'Salvar' : 'Criar Campanha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rule Modal */}
      <Dialog open={showRuleModal} onOpenChange={setShowRuleModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar Regra' : 'Nova Regra de Re-engajamento'}</DialogTitle>
            <DialogDescription>Configure gatilhos automáticos para re-engajar usuários</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input 
                  value={ruleForm.name} 
                  onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} 
                  placeholder="Ex: Reativar Inativos 7d"
                />
              </div>
              <div className="space-y-2">
                <Label>Gatilho</Label>
                <Select 
                  value={ruleForm.trigger_condition} 
                  onValueChange={v => setRuleForm(f => ({ ...f, trigger_condition: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_CONDITIONS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={ruleForm.description} 
                onChange={e => setRuleForm(f => ({ ...f, description: e.target.value }))} 
                placeholder="Descrição da regra..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select 
                  value={ruleForm.action_type} 
                  onValueChange={v => setRuleForm(f => ({ ...f, action_type: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="push">Push Notification</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="both">Email + Push</SelectItem>
                    <SelectItem value="coupon">Gerar Cupom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cooldown (dias)</Label>
                <Input 
                  type="number" 
                  value={ruleForm.cooldown_days} 
                  onChange={e => setRuleForm(f => ({ ...f, cooldown_days: parseInt(e.target.value) || 7 }))}
                  min={1}
                />
              </div>
            </div>

            {(ruleForm.action_type === 'push' || ruleForm.action_type === 'both') && (
              <>
                <div className="space-y-2">
                  <Label>Título do Push</Label>
                  <Input 
                    value={ruleForm.push_title} 
                    onChange={e => setRuleForm(f => ({ ...f, push_title: e.target.value }))} 
                    placeholder="Ex: Sentimos sua falta! 💜"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem do Push</Label>
                  <Textarea 
                    value={ruleForm.push_body} 
                    onChange={e => setRuleForm(f => ({ ...f, push_body: e.target.value }))} 
                    placeholder="Ex: Volte e veja as novidades!"
                  />
                </div>
              </>
            )}

            {(ruleForm.action_type === 'email' || ruleForm.action_type === 'both') && (
              <div className="space-y-2">
                <Label>Template de Email</Label>
                <Select 
                  value={ruleForm.email_template_id} 
                  onValueChange={v => setRuleForm(f => ({ ...f, email_template_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {ruleForm.action_type === 'coupon' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Desconto (%)</Label>
                  <Input 
                    type="number" 
                    value={ruleForm.coupon_discount} 
                    onChange={e => setRuleForm(f => ({ ...f, coupon_discount: parseInt(e.target.value) || 10 }))}
                    min={1}
                    max={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Validade (dias)</Label>
                  <Input 
                    type="number" 
                    value={ruleForm.coupon_valid_days} 
                    onChange={e => setRuleForm(f => ({ ...f, coupon_valid_days: parseInt(e.target.value) || 7 }))}
                    min={1}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Prioridade (1-10)</Label>
              <Input 
                type="number" 
                value={ruleForm.priority} 
                onChange={e => setRuleForm(f => ({ ...f, priority: parseInt(e.target.value) || 5 }))}
                min={1}
                max={10}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleModal(false)}>Cancelar</Button>
            <Button 
              onClick={handleSaveRule} 
              disabled={createRule.isPending || updateRule.isPending || !ruleForm.name}
            >
              {editingRule ? 'Salvar' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
