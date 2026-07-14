import React, { useState } from 'react';
import {
  FlaskConical,
  Plus,
  Play,
  Pause,
  Trophy,
  Trash2,
  Edit,
  BarChart3,
  Users,
  Target,
  TrendingUp,
  CheckCircle,
  Clock,
  Settings,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import {
  useABExperiments,
  useABExperiment,
  useCreateABExperiment,
  useUpdateABExperiment,
  useDeleteABExperiment,
  useToggleABExperiment,
  useCreateABVariant,
  useDeleteABVariant,
  useDeclareWinner,
  useABStats,
  type ABExperiment,
  type ABVariant,
} from '@/hooks/useABTesting';

const METRIC_OPTIONS = [
  { value: 'signup_conversion', label: 'Taxa de Cadastro' },
  { value: 'subscription_rate', label: 'Taxa de Assinatura' },
  { value: 'checkout_completion', label: 'Conclusão de Checkout' },
  { value: 'click_rate', label: 'Taxa de Cliques' },
  { value: 'engagement_rate', label: 'Taxa de Engajamento' },
  { value: 'revenue_per_user', label: 'Receita por Usuário' },
  { value: 'retention_7d', label: 'Retenção 7 dias' },
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

function ExperimentStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    running: 'bg-green-100 text-green-700 animate-pulse',
    paused: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-200 text-gray-600',
  };
  const labels: Record<string, string> = {
    draft: 'Rascunho',
    running: '🔴 Ativo',
    paused: 'Pausado',
    completed: 'Concluído',
    archived: 'Arquivado',
  };
  return <Badge className={styles[status] || styles.draft}>{labels[status] || status}</Badge>;
}

function VariantCard({ 
  variant, 
  isWinner,
  onDelete,
  onDeclareWinner,
  canDeclareWinner,
}: { 
  variant: ABVariant; 
  isWinner: boolean;
  onDelete: () => void;
  onDeclareWinner: () => void;
  canDeclareWinner: boolean;
}) {
  const conversionRate = variant.impressions > 0 
    ? ((variant.conversions / variant.impressions) * 100).toFixed(2)
    : '0.00';

  return (
    <Card className={`relative ${isWinner ? 'ring-2 ring-yellow-400' : ''} ${variant.is_control ? 'border-primary/50' : ''}`}>
      {isWinner && (
        <div className="absolute -top-2 -right-2">
          <Badge className="bg-yellow-500 text-black">
            <Trophy className="h-3 w-3 mr-1" />
            Vencedor
          </Badge>
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{variant.name}</CardTitle>
            {variant.is_control && <Badge variant="outline">Controle</Badge>}
          </div>
          <div className="flex gap-1">
            {canDeclareWinner && !isWinner && (
              <Button size="sm" variant="outline" onClick={onDeclareWinner}>
                <Trophy className="h-4 w-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {variant.description && (
          <CardDescription>{variant.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{variant.impressions}</p>
            <p className="text-xs text-muted-foreground">Impressões</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{variant.conversions}</p>
            <p className="text-xs text-muted-foreground">Conversões</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground">Taxa</p>
          </div>
        </div>
        
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span>Conversão</span>
            <span>{conversionRate}%</span>
          </div>
          <Progress value={parseFloat(conversionRate)} className="h-2" />
        </div>

        {variant.revenue > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              Receita: <span className="font-semibold text-foreground">R$ {variant.revenue.toFixed(2)}</span>
            </p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Peso: {variant.weight}%
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminABTestingPage() {
  const { data: isAdmin } = useIsMasterAdmin();
  const { data: experiments, isLoading } = useABExperiments();
  const { data: stats } = useABStats();
  
  const createExperiment = useCreateABExperiment();
  const updateExperiment = useUpdateABExperiment();
  const deleteExperiment = useDeleteABExperiment();
  const toggleExperiment = useToggleABExperiment();
  const createVariant = useCreateABVariant();
  const deleteVariant = useDeleteABVariant();
  const declareWinner = useDeclareWinner();

  const [showModal, setShowModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<ABExperiment | null>(null);
  const [viewingExperiment, setViewingExperiment] = useState<string | null>(null);
  
  const { data: experimentDetail } = useABExperiment(viewingExperiment);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    hypothesis: '',
    metric_key: 'signup_conversion',
    traffic_percentage: 100,
    target_sample_size: '',
  });

  const [variantForm, setVariantForm] = useState({
    name: '',
    description: '',
    is_control: false,
    weight: 50,
  });

  // isAdmin already derived from useIsMasterAdmin()

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const handleSaveExperiment = async () => {
    if (selectedExperiment) {
      await updateExperiment.mutateAsync({ id: selectedExperiment.id, ...form });
    } else {
      await createExperiment.mutateAsync({
        ...form,
        target_sample_size: form.target_sample_size ? parseInt(form.target_sample_size) : null,
      });
    }
    setShowModal(false);
    resetForm();
  };

  const handleAddVariant = async () => {
    if (!viewingExperiment) return;
    await createVariant.mutateAsync({
      experiment_id: viewingExperiment,
      ...variantForm,
    });
    setShowVariantModal(false);
    resetVariantForm();
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      hypothesis: '',
      metric_key: 'signup_conversion',
      traffic_percentage: 100,
      target_sample_size: '',
    });
    setSelectedExperiment(null);
  };

  const resetVariantForm = () => {
    setVariantForm({
      name: '',
      description: '',
      is_control: false,
      weight: 50,
    });
  };

  const openEditExperiment = (exp: ABExperiment) => {
    setSelectedExperiment(exp);
    setForm({
      name: exp.name,
      description: exp.description || '',
      hypothesis: exp.hypothesis || '',
      metric_key: exp.metric_key,
      traffic_percentage: exp.traffic_percentage,
      target_sample_size: exp.target_sample_size?.toString() || '',
    });
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FlaskConical className="h-8 w-8 text-primary" />
            A/B Testing
          </h1>
          <p className="text-muted-foreground mt-1">
            Otimize conversões com experimentos controlados
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Experimento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total de Experimentos" value={stats?.total || 0} icon={FlaskConical} />
        <StatCard 
          title="Ativos" 
          value={stats?.running || 0} 
          icon={Play}
          description="Coletando dados agora"
        />
        <StatCard title="Concluídos" value={stats?.completed || 0} icon={CheckCircle} />
        <StatCard title="Rascunhos" value={stats?.draft || 0} icon={Clock} />
      </div>

      {/* Tabs */}
      <Tabs value={viewingExperiment ? 'detail' : 'list'} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list" onClick={() => setViewingExperiment(null)}>
            Lista de Experimentos
          </TabsTrigger>
          {viewingExperiment && (
            <TabsTrigger value="detail">
              Detalhes do Experimento
            </TabsTrigger>
          )}
        </TabsList>

        {/* List Tab */}
        <TabsContent value="list" className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : experiments?.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum experimento criado ainda.</p>
              <p className="text-sm">Crie seu primeiro teste A/B para otimizar conversões!</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {experiments?.map(exp => (
                <Card key={exp.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{exp.name}</h3>
                        <ExperimentStatusBadge status={exp.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">{exp.description}</p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {METRIC_OPTIONS.find(m => m.value === exp.metric_key)?.label || exp.metric_key}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {exp.traffic_percentage}% do tráfego
                        </span>
                        {exp.start_date && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Iniciado {new Date(exp.start_date).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setViewingExperiment(exp.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                      {exp.status === 'draft' && (
                        <Button 
                          size="sm" 
                          onClick={() => toggleExperiment.mutate({ id: exp.id, action: 'start' })}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Iniciar
                        </Button>
                      )}
                      {exp.status === 'running' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => toggleExperiment.mutate({ id: exp.id, action: 'pause' })}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Pausar
                        </Button>
                      )}
                      {exp.status === 'paused' && (
                        <Button 
                          size="sm" 
                          onClick={() => toggleExperiment.mutate({ id: exp.id, action: 'start' })}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Retomar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEditExperiment(exp)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-destructive"
                        onClick={() => deleteExperiment.mutate(exp.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Detail Tab */}
        <TabsContent value="detail" className="space-y-4">
          {experimentDetail && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{experimentDetail.experiment.name}</h2>
                  <p className="text-muted-foreground">{experimentDetail.experiment.hypothesis}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setViewingExperiment(null)}>
                    Voltar
                  </Button>
                  <Button onClick={() => setShowVariantModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar Variante
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {experimentDetail.variants.map(variant => (
                  <VariantCard
                    key={variant.id}
                    variant={variant}
                    isWinner={experimentDetail.experiment.winner_variant_id === variant.id}
                    onDelete={() => deleteVariant.mutate(variant.id)}
                    onDeclareWinner={() => declareWinner.mutate({ 
                      experimentId: experimentDetail.experiment.id, 
                      variantId: variant.id 
                    })}
                    canDeclareWinner={
                      experimentDetail.experiment.status === 'running' && 
                      !experimentDetail.experiment.winner_variant_id
                    }
                  />
                ))}
              </div>

              {experimentDetail.variants.length === 0 && (
                <Card className="p-8 text-center text-muted-foreground">
                  <p>Nenhuma variante criada.</p>
                  <p className="text-sm">Adicione pelo menos 2 variantes (incluindo controle) para iniciar.</p>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Experiment Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedExperiment ? 'Editar Experimento' : 'Novo Experimento'}</DialogTitle>
            <DialogDescription>Configure seu teste A/B</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Experimento</Label>
              <Input 
                value={form.name} 
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
                placeholder="Ex: Teste CTA do Checkout"
              />
            </div>

            <div className="space-y-2">
              <Label>Hipótese</Label>
              <Textarea 
                value={form.hypothesis} 
                onChange={e => setForm(f => ({ ...f, hypothesis: e.target.value }))} 
                placeholder="Ex: Botão verde aumentará conversões em 15%"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={form.description} 
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} 
                placeholder="Descrição do experimento..."
              />
            </div>

            <div className="space-y-2">
              <Label>Métrica Principal</Label>
              <Select 
                value={form.metric_key} 
                onValueChange={v => setForm(f => ({ ...f, metric_key: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Porcentagem do Tráfego: {form.traffic_percentage}%</Label>
              <Slider 
                value={[form.traffic_percentage]} 
                onValueChange={([v]) => setForm(f => ({ ...f, traffic_percentage: v }))}
                min={1}
                max={100}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Define quantos usuários participarão do experimento
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tamanho da Amostra (opcional)</Label>
              <Input 
                type="number"
                value={form.target_sample_size} 
                onChange={e => setForm(f => ({ ...f, target_sample_size: e.target.value }))} 
                placeholder="Ex: 1000"
              />
              <p className="text-xs text-muted-foreground">
                Número mínimo de participantes antes de declarar vencedor
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button 
              onClick={handleSaveExperiment} 
              disabled={createExperiment.isPending || updateExperiment.isPending || !form.name}
            >
              {selectedExperiment ? 'Salvar' : 'Criar Experimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variant Modal */}
      <Dialog open={showVariantModal} onOpenChange={setShowVariantModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Variante</DialogTitle>
            <DialogDescription>Adicione uma variação ao experimento</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                value={variantForm.name} 
                onChange={e => setVariantForm(f => ({ ...f, name: e.target.value }))} 
                placeholder="Ex: Botão Verde"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={variantForm.description} 
                onChange={e => setVariantForm(f => ({ ...f, description: e.target.value }))} 
                placeholder="Descrição da variante..."
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Variante Controle</Label>
                <p className="text-xs text-muted-foreground">Versão original para comparação</p>
              </div>
              <Switch 
                checked={variantForm.is_control}
                onCheckedChange={checked => setVariantForm(f => ({ ...f, is_control: checked }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Peso: {variantForm.weight}%</Label>
              <Slider 
                value={[variantForm.weight]} 
                onValueChange={([v]) => setVariantForm(f => ({ ...f, weight: v }))}
                min={1}
                max={100}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Porcentagem de usuários que verão esta variante
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVariantModal(false)}>Cancelar</Button>
            <Button 
              onClick={handleAddVariant} 
              disabled={createVariant.isPending || !variantForm.name}
            >
              Adicionar Variante
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
