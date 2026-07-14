import React, { useState } from 'react';
import {
  MessageSquareHeart,
  Star,
  ThumbsUp,
  ThumbsDown,
  Meh,
  Plus,
  Eye,
  Trash2,
  Edit,
  BarChart3,
  Users,
  TrendingUp,
  MessageCircle,
  Lightbulb,
  CheckCircle,
  Clock,
  ArrowUp,
  Filter,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import {
  useNPSSurveys,
  useNPSResponses,
  useCreateNPSSurvey,
  useUpdateNPSSurvey,
  useDeleteNPSSurvey,
  useFeedbackResponses,
  useUpdateFeedbackStatus,
  useFeatureRequests,
  useUpdateFeatureRequest,
  useNPSStats,
  useFeedbackStats,
  useFeatureRequestStats,
  type NPSSurvey,
  type NPSResponse,
  type FeedbackResponse,
  type FeatureRequest,
} from '@/hooks/useFeedbackNPS';

function StatCard({ title, value, icon: Icon, description, trend }: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {trend === 'up' && <TrendingUp className="h-4 w-4 text-green-500" />}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function NPSScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">Sem dados</Badge>;
  
  let color = 'bg-red-100 text-red-700';
  if (score >= 50) color = 'bg-green-100 text-green-700';
  else if (score >= 0) color = 'bg-yellow-100 text-yellow-700';
  
  return <Badge className={color}>NPS: {score}</Badge>;
}

function CategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    promoter: 'bg-green-100 text-green-700',
    passive: 'bg-yellow-100 text-yellow-700',
    detractor: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    promoter: '😍 Promotor',
    passive: '😐 Neutro',
    detractor: '😞 Detrator',
  };
  return <Badge className={styles[category]}>{labels[category] || category}</Badge>;
}

function RequestStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    under_review: 'bg-blue-100 text-blue-700',
    planned: 'bg-purple-100 text-purple-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    pending: 'Pendente',
    under_review: 'Em Análise',
    planned: 'Planejado',
    in_progress: 'Em Progresso',
    completed: 'Concluído',
    declined: 'Recusado',
  };
  return <Badge className={styles[status]}>{labels[status] || status}</Badge>;
}

export default function AdminFeedbackNPSPage() {
  const { data: isAdmin } = useIsMasterAdmin();
  const { data: surveys, isLoading: loadingSurveys } = useNPSSurveys();
  const { data: npsStats } = useNPSStats();
  const { data: feedbackStats } = useFeedbackStats();
  const { data: requestStats } = useFeatureRequestStats();
  const { data: feedbackResponses, isLoading: loadingFeedback } = useFeedbackResponses(null);
  const { data: featureRequests, isLoading: loadingRequests } = useFeatureRequests();

  const createSurvey = useCreateNPSSurvey();
  const updateSurvey = useUpdateNPSSurvey();
  const deleteSurvey = useDeleteNPSSurvey();
  const updateFeedbackStatus = useUpdateFeedbackStatus();
  const updateFeatureRequest = useUpdateFeatureRequest();

  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<NPSSurvey | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<FeatureRequest | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  
  const { data: surveyResponses } = useNPSResponses(selectedSurvey?.id || null);

  // Form state
  const [surveyForm, setSurveyForm] = useState({
    name: '',
    description: '',
    question: 'De 0 a 10, qual a probabilidade de você recomendar o Oculto para um amigo?',
    followup_question: 'O que motivou sua nota?',
    trigger_type: 'manual',
    show_frequency_days: 90,
    is_active: true,
  });

  const [requestForm, setRequestForm] = useState({
    status: '',
    priority: '',
    admin_response: '',
    estimated_release: '',
  });

  // isAdmin already derived from useIsMasterAdmin()

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const handleSaveSurvey = async () => {
    await createSurvey.mutateAsync(surveyForm);
    setShowSurveyModal(false);
    resetSurveyForm();
  };

  const resetSurveyForm = () => {
    setSurveyForm({
      name: '',
      description: '',
      question: 'De 0 a 10, qual a probabilidade de você recomendar o Oculto para um amigo?',
      followup_question: 'O que motivou sua nota?',
      trigger_type: 'manual',
      show_frequency_days: 90,
      is_active: true,
    });
  };

  const handleUpdateRequest = async () => {
    if (!selectedRequest) return;
    await updateFeatureRequest.mutateAsync({ id: selectedRequest.id, ...requestForm });
    setShowRequestModal(false);
    setSelectedRequest(null);
  };

  const openRequestModal = (request: FeatureRequest) => {
    setSelectedRequest(request);
    setRequestForm({
      status: request.status,
      priority: request.priority,
      admin_response: request.admin_response || '',
      estimated_release: request.estimated_release || '',
    });
    setShowRequestModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <MessageSquareHeart className="h-8 w-8 text-primary" />
            Feedback & NPS
          </h1>
          <p className="text-muted-foreground mt-1">
            Pesquisas de satisfação, feedback e sugestões de usuários
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard 
          title="NPS Médio" 
          value={npsStats?.avgNPS ?? 'N/A'} 
          icon={Star}
          description={`${npsStats?.totalResponses || 0} respostas`}
        />
        <StatCard 
          title="Nota Média" 
          value={npsStats?.avgScore ?? 'N/A'} 
          icon={BarChart3}
          description="de 0 a 10"
        />
        <StatCard 
          title="Feedbacks Novos" 
          value={feedbackStats?.new || 0} 
          icon={MessageCircle}
          description={`${feedbackStats?.total || 0} total`}
        />
        <StatCard 
          title="Sugestões Pendentes" 
          value={requestStats?.pending || 0} 
          icon={Lightbulb}
          description={`${requestStats?.totalVotes || 0} votos`}
        />
        <StatCard 
          title="Taxa Positiva" 
          value={`${feedbackStats?.positiveRate || 0}%`} 
          icon={ThumbsUp}
          trend="up"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="nps" className="space-y-4">
        <TabsList>
          <TabsTrigger value="nps" className="gap-2">
            <Star className="h-4 w-4" />
            NPS
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-2">
            <Lightbulb className="h-4 w-4" />
            Sugestões
          </TabsTrigger>
        </TabsList>

        {/* NPS Tab */}
        <TabsContent value="nps" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetSurveyForm(); setShowSurveyModal(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Pesquisa NPS
            </Button>
          </div>

          {loadingSurveys ? (
            <div className="space-y-4">
              {[1, 2].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {surveys?.map(survey => (
                <Card key={survey.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{survey.name}</h3>
                        <Badge variant={survey.is_active ? 'default' : 'secondary'}>
                          {survey.is_active ? 'Ativa' : 'Inativa'}
                        </Badge>
                        <NPSScoreBadge score={survey.nps_score} />
                      </div>
                      <p className="text-sm text-muted-foreground">{survey.description}</p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {survey.responses_count} respostas
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3" />
                          Média: {survey.avg_score?.toFixed(1) || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Frequência: {survey.show_frequency_days} dias
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => { setSelectedSurvey(survey); setShowResponseModal(true); }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Respostas
                      </Button>
                      <Switch 
                        checked={survey.is_active}
                        onCheckedChange={checked => updateSurvey.mutate({ id: survey.id, is_active: checked })}
                      />
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-destructive"
                        onClick={() => deleteSurvey.mutate(survey.id)}
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

        {/* Feedback Tab */}
        <TabsContent value="feedback" className="space-y-4">
          {loadingFeedback ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {feedbackResponses?.map(response => (
                  <Card key={response.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={response.status === 'new' ? 'default' : 'outline'}>
                            {response.status === 'new' ? '🆕 Novo' : response.status === 'reviewed' ? '✅ Revisado' : response.status}
                          </Badge>
                          {response.sentiment && (
                            <Badge className={
                              response.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                              response.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }>
                              {response.sentiment === 'positive' ? <ThumbsUp className="h-3 w-3 mr-1" /> :
                               response.sentiment === 'negative' ? <ThumbsDown className="h-3 w-3 mr-1" /> :
                               <Meh className="h-3 w-3 mr-1" />}
                              {response.sentiment}
                            </Badge>
                          )}
                          {response.rating && (
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map(i => (
                                <Star key={i} className={`h-3 w-3 ${i <= response.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-sm space-y-1">
                          {Object.entries(response.responses).map(([key, value]) => (
                            <p key={key}><span className="font-medium">{key}:</span> {String(value)}</p>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(response.created_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {response.status === 'new' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateFeedbackStatus.mutate({ id: response.id, status: 'reviewed' })}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        {/* Feature Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          {loadingRequests ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {featureRequests?.map(request => (
                <Card key={request.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{request.title}</h3>
                        <RequestStatusBadge status={request.status} />
                        <Badge variant="outline">{request.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
                      {request.admin_response && (
                        <p className="text-sm mt-2 p-2 bg-muted rounded">
                          <span className="font-medium">Resposta:</span> {request.admin_response}
                        </p>
                      )}
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-semibold text-primary">
                          <ArrowUp className="h-3 w-3" />
                          {request.votes_count} votos
                        </span>
                        <span>
                          {new Date(request.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {request.estimated_release && (
                          <span className="text-green-600">
                            Previsão: {request.estimated_release}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openRequestModal(request)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* NPS Survey Modal */}
      <Dialog open={showSurveyModal} onOpenChange={setShowSurveyModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Pesquisa NPS</DialogTitle>
            <DialogDescription>Configure sua pesquisa de satisfação</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input 
                value={surveyForm.name} 
                onChange={e => setSurveyForm(f => ({ ...f, name: e.target.value }))} 
                placeholder="Ex: NPS Q1 2025"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                value={surveyForm.description} 
                onChange={e => setSurveyForm(f => ({ ...f, description: e.target.value }))} 
              />
            </div>

            <div className="space-y-2">
              <Label>Pergunta Principal</Label>
              <Textarea 
                value={surveyForm.question} 
                onChange={e => setSurveyForm(f => ({ ...f, question: e.target.value }))} 
              />
            </div>

            <div className="space-y-2">
              <Label>Pergunta de Follow-up</Label>
              <Input 
                value={surveyForm.followup_question} 
                onChange={e => setSurveyForm(f => ({ ...f, followup_question: e.target.value }))} 
              />
            </div>

            <div className="space-y-2">
              <Label>Frequência (dias entre pesquisas para mesmo usuário)</Label>
              <Input 
                type="number"
                value={surveyForm.show_frequency_days} 
                onChange={e => setSurveyForm(f => ({ ...f, show_frequency_days: parseInt(e.target.value) || 90 }))} 
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Ativar imediatamente</Label>
              <Switch 
                checked={surveyForm.is_active}
                onCheckedChange={checked => setSurveyForm(f => ({ ...f, is_active: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSurveyModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveSurvey} disabled={createSurvey.isPending || !surveyForm.name}>
              Criar Pesquisa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NPS Responses Modal */}
      <Dialog open={showResponseModal} onOpenChange={setShowResponseModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Respostas: {selectedSurvey?.name}</DialogTitle>
            <div className="flex gap-2">
              <NPSScoreBadge score={selectedSurvey?.nps_score || null} />
              <Badge variant="outline">{selectedSurvey?.responses_count || 0} respostas</Badge>
            </div>
          </DialogHeader>
          
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {surveyResponses?.map(response => (
                <Card key={response.id} className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl font-bold">{response.score}</span>
                        <CategoryBadge category={response.category} />
                      </div>
                      {response.comment && (
                        <p className="text-sm text-muted-foreground">{response.comment}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(response.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </Card>
              ))}
              {!surveyResponses?.length && (
                <p className="text-center text-muted-foreground py-8">Nenhuma resposta ainda.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Feature Request Modal */}
      <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar Sugestão</DialogTitle>
            <DialogDescription>{selectedRequest?.title}</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded text-sm">
              {selectedRequest?.description}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select 
                  value={requestForm.status} 
                  onValueChange={v => setRequestForm(f => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="under_review">Em Análise</SelectItem>
                    <SelectItem value="planned">Planejado</SelectItem>
                    <SelectItem value="in_progress">Em Progresso</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="declined">Recusado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select 
                  value={requestForm.priority} 
                  onValueChange={v => setRequestForm(f => ({ ...f, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Resposta da Equipe</Label>
              <Textarea 
                value={requestForm.admin_response} 
                onChange={e => setRequestForm(f => ({ ...f, admin_response: e.target.value }))} 
                placeholder="Responda ao usuário sobre esta sugestão..."
              />
            </div>

            <div className="space-y-2">
              <Label>Previsão de Lançamento</Label>
              <Input 
                value={requestForm.estimated_release} 
                onChange={e => setRequestForm(f => ({ ...f, estimated_release: e.target.value }))} 
                placeholder="Ex: Q2 2025"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestModal(false)}>Cancelar</Button>
            <Button onClick={handleUpdateRequest} disabled={updateFeatureRequest.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
