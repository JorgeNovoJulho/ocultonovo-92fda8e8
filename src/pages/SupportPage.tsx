import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LifeBuoy, 
  Plus, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  ChevronRight,
  Lightbulb,
  Bug,
  AlertTriangle,
  Gift,
  Search,
  XCircle,
  Sparkles,
  Heart,
  MessageCircle,
  Send,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMyTickets, useCreateTicket, type SupportTicket } from "@/hooks/useSupportTickets";
import { useMyFeedback, useCreateFeedback, type UserFeedback } from "@/hooks/useUserFeedback";
import { RevengePortnReportModal } from "@/components/privacy/RevengePortnReportModal";
import { cn } from "@/lib/utils";

// Configuração de status dos chamados
const ticketStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { 
    label: 'Aberto', 
    color: 'bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30',
    icon: <Clock className="h-3 w-3" />
  },
  in_progress: { 
    label: 'Em Andamento', 
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: <MessageSquare className="h-3 w-3" />
  },
  resolved: { 
    label: 'Resolvido', 
    color: 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30',
    icon: <CheckCircle2 className="h-3 w-3" />
  },
  closed: { 
    label: 'Fechado', 
    color: 'bg-muted text-muted-foreground border-border',
    icon: <CheckCircle2 className="h-3 w-3" />
  },
};

// Configuração de status do feedback
const feedbackStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  pending: { 
    label: 'Pendente', 
    color: 'bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30',
    icon: <Clock className="h-3 w-3" />,
    description: 'Aguardando análise do administrador'
  },
  analyzing: { 
    label: 'Em Análise', 
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: <Search className="h-3 w-3" />,
    description: 'O administrador está analisando seu feedback'
  },
  implemented: { 
    label: 'Implementado', 
    color: 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30',
    icon: <CheckCircle2 className="h-3 w-3" />,
    description: 'Seu feedback foi implementado!'
  },
  rejected: { 
    label: 'Rejeitado', 
    color: 'bg-destructive/10 text-destructive border-destructive/30',
    icon: <XCircle className="h-3 w-3" />,
    description: 'Infelizmente não foi possível implementar'
  },
};

// Novos tipos de feedback conforme solicitado
const feedbackTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode; description: string }> = {
  suggestion: { 
    label: 'Sugestão de Função', 
    color: 'text-primary',
    icon: <Lightbulb className="h-4 w-4" />,
    description: 'Sugira uma nova funcionalidade'
  },
  praise: { 
    label: 'Elogio', 
    color: 'text-[hsl(142,76%,36%)]',
    icon: <Heart className="h-4 w-4" />,
    description: 'Conte o que você gostou'
  },
  criticism: { 
    label: 'Crítica Construtiva', 
    color: 'text-[hsl(25,95%,53%)]',
    icon: <MessageCircle className="h-4 w-4" />,
    description: 'Ajude-nos a melhorar'
  },
};

// Categorias de chamado técnico
const ticketCategoryConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  technical: { 
    label: 'Técnico', 
    color: 'text-blue-400',
    icon: <Bug className="h-4 w-4" />
  },
  financial: { 
    label: 'Financeiro', 
    color: 'text-[hsl(45,93%,47%)]',
    icon: <AlertCircle className="h-4 w-4" />
  },
  report: { 
    label: 'Denúncia', 
    color: 'text-destructive',
    icon: <AlertTriangle className="h-4 w-4" />
  },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-muted-foreground' },
  medium: { label: 'Média', color: 'text-[hsl(45,93%,47%)]' },
  high: { label: 'Alta', color: 'text-[hsl(25,95%,53%)]' },
  urgent: { label: 'Urgente', color: 'text-destructive' },
};

export default function SupportPage() {
  // Aba "feedback" como padrão conforme solicitado
  const [activeTab, setActiveTab] = useState<'tickets' | 'feedback'>('feedback');
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [showNewFeedbackModal, setShowNewFeedbackModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(null);
  
  const [newTicket, setNewTicket] = useState({
    subject: '',
    description: '',
    category: 'technical' as 'technical' | 'financial' | 'report',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
  });

  const [newFeedback, setNewFeedback] = useState({
    type: 'suggestion' as 'suggestion' | 'praise' | 'criticism',
    title: '',
    description: '',
  });

  // Modal de denúncia de Revenge Porn
  const [showRevengeReportModal, setShowRevengeReportModal] = useState(false);

  const { data: tickets, isLoading: loadingTickets } = useMyTickets();
  const { data: feedbacks, isLoading: loadingFeedbacks } = useMyFeedback();
  const createTicket = useCreateTicket();
  const createFeedback = useCreateFeedback();

  const handleCreateTicket = async () => {
    if (!newTicket.subject.trim()) return;

    await createTicket.mutateAsync({
      subject: `[${ticketCategoryConfig[newTicket.category].label}] ${newTicket.subject}`,
      description: newTicket.description || undefined,
      priority: newTicket.priority,
    });

    setShowNewTicketModal(false);
    setNewTicket({ subject: '', description: '', category: 'technical', priority: 'medium' });
  };

  const handleCreateFeedback = async () => {
    if (!newFeedback.description.trim()) return;

    await createFeedback.mutateAsync({
      type: newFeedback.type === 'praise' ? 'suggestion' : newFeedback.type === 'criticism' ? 'complaint' : 'suggestion',
      title: `[${feedbackTypeConfig[newFeedback.type].label}] ${newFeedback.title || 'Feedback'}`,
      description: newFeedback.description || undefined,
    });

    setShowNewFeedbackModal(false);
    setNewFeedback({ type: 'suggestion', title: '', description: '' });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isLoading = loadingTickets || loadingFeedbacks;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Lightbulb className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Feedback & Suporte</h1>
            <p className="text-muted-foreground">
              Envie feedback, sugestões e chamados técnicos
            </p>
          </div>
        </div>
      </div>

      {/* Banner de Recompensa - Texto atualizado para "feedback" */}
      <Card className="bg-gradient-to-r from-[hsl(45,93%,47%)]/10 to-primary/10 border-[hsl(45,93%,47%)]/30">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/20">
            <Gift className="h-5 w-5 text-[hsl(45,93%,47%)]" />
          </div>
          <div>
            <h3 className="font-semibold text-[hsl(45,93%,47%)]">🎁 Participe e Ganhe!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Obrigado! Se seu <span className="font-semibold text-[hsl(45,93%,47%)]">feedback</span> for implementado, 
              você receberá um <span className="font-semibold text-primary">cupom de desconto exclusivo</span> como 
              agradecimento pela sua contribuição.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs com animação */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="w-full grid grid-cols-2 bg-muted/50">
          <TabsTrigger value="feedback" className="gap-2 data-[state=active]:bg-primary/20">
            <Lightbulb className="h-4 w-4" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="tickets" className="gap-2 data-[state=active]:bg-muted">
            <LifeBuoy className="h-4 w-4" />
            Suporte
          </TabsTrigger>
        </TabsList>

        {/* Aba Feedback - Agora é a principal */}
        <TabsContent value="feedback" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="feedback-tab"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Botões de tipo de feedback */}
              <div className="grid grid-cols-3 gap-2">
                <Button 
                  variant="outline" 
                  className="flex-col h-auto py-4 gap-2 hover:bg-primary/10 hover:border-primary/50 transition-all"
                  onClick={() => {
                    setNewFeedback(prev => ({ ...prev, type: 'suggestion' }));
                    setShowNewFeedbackModal(true);
                  }}
                >
                  <Lightbulb className="h-6 w-6 text-primary" />
                  <span className="text-xs font-medium">Sugestão</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-col h-auto py-4 gap-2 hover:bg-[hsl(142,76%,36%)]/10 hover:border-[hsl(142,76%,36%)]/50 transition-all"
                  onClick={() => {
                    setNewFeedback(prev => ({ ...prev, type: 'praise' }));
                    setShowNewFeedbackModal(true);
                  }}
                >
                  <Heart className="h-6 w-6 text-[hsl(142,76%,36%)]" />
                  <span className="text-xs font-medium">Elogio</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-col h-auto py-4 gap-2 hover:bg-[hsl(25,95%,53%)]/10 hover:border-[hsl(25,95%,53%)]/50 transition-all"
                  onClick={() => {
                    setNewFeedback(prev => ({ ...prev, type: 'criticism' }));
                    setShowNewFeedbackModal(true);
                  }}
                >
                  <MessageCircle className="h-6 w-6 text-[hsl(25,95%,53%)]" />
                  <span className="text-xs font-medium">Crítica</span>
                </Button>
              </div>

              {/* Botão principal de Feedback com Glow Neon Pink */}
              <Button 
                onClick={() => setShowNewFeedbackModal(true)}
                className="w-full h-14 bg-gradient-to-r from-primary to-[#FF007F] hover:opacity-90 text-white font-semibold text-base gap-2 shadow-[0_0_20px_rgba(255,0,127,0.5)] hover:shadow-[0_0_30px_rgba(255,0,127,0.7)] transition-all"
              >
                <Sparkles className="h-5 w-5" />
                Enviar Feedback
              </Button>

              {/* Lista de Feedbacks */}
              {(!feedbacks || feedbacks.length === 0) ? (
                <Card className="bg-card/50 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Lightbulb className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhum feedback enviado</h3>
                    <p className="text-muted-foreground text-center">
                      Tem uma sugestão ou elogio? Queremos ouvir você!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {feedbacks.map((feedback) => {
                    // Mapear tipos antigos para novos
                    const typeKey = feedback.type === 'complaint' ? 'criticism' : feedback.type === 'bug' ? 'suggestion' : 'suggestion';
                    const typeInfo = feedbackTypeConfig[typeKey] || feedbackTypeConfig.suggestion;
                    const statusInfo = feedbackStatusConfig[feedback.status];
                    
                    return (
                      <motion.div
                        key={feedback.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Card 
                          className={cn(
                            "bg-card/50 border-border/50 hover:bg-card/80 transition-all cursor-pointer",
                            feedback.reward_coupon_code && "ring-2 ring-[hsl(45,93%,47%)]/50"
                          )}
                          onClick={() => setSelectedFeedback(feedback)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={cn("flex items-center gap-1 text-xs font-medium", typeInfo.color)}>
                                    {typeInfo.icon}
                                    {typeInfo.label}
                                  </span>
                                  <Badge variant="outline" className={cn("text-xs", statusInfo.color)}>
                                    {statusInfo.icon}
                                    <span className="ml-1">{statusInfo.label}</span>
                                  </Badge>
                                  {feedback.reward_coupon_code && (
                                    <Badge className="bg-[hsl(45,93%,47%)] text-background text-xs gap-1">
                                      <Gift className="h-3 w-3" />
                                      Prêmio!
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="font-semibold truncate">{feedback.title}</h3>
                                {feedback.description && (
                                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                    {feedback.description}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-2">
                                  Enviado em {formatDate(feedback.created_at)}
                                </p>
                              </div>
                              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        {/* Aba Suporte/Chamados */}
        <TabsContent value="tickets" className="mt-4">
          <AnimatePresence mode="wait">
            <motion.div
              key="tickets-tab"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Botão de Denúncia de Revenge Porn - Canal Prioritário */}
              <Card className="bg-destructive/5 border-destructive/30">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-destructive/20">
                      <ShieldAlert className="h-5 w-5 text-destructive" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-destructive">Canal Prioritário</h3>
                        <Badge className="bg-destructive text-destructive-foreground text-[10px]">
                          URGENTE
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Solicitar remoção de conteúdo íntimo não autorizado (Revenge Porn)
                      </p>
                      <Button 
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowRevengeReportModal(true)}
                        className="gap-2"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        Denunciar Conteúdo
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button 
                onClick={() => setShowNewTicketModal(true)} 
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Abrir Chamado de Suporte
              </Button>

              {(!tickets || tickets.length === 0) ? (
                <Card className="bg-card/50 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <LifeBuoy className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Nenhum chamado aberto</h3>
                    <p className="text-muted-foreground text-center">
                      Precisa de ajuda técnica? Abra um chamado e nossa equipe responderá em breve.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <motion.div
                      key={ticket.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card 
                        className="bg-card/50 border-border/50 hover:bg-card/80 transition-all cursor-pointer"
                        onClick={() => setSelectedTicket(ticket)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className={cn("text-xs", ticketStatusConfig[ticket.status].color)}>
                                  {ticketStatusConfig[ticket.status].icon}
                                  <span className="ml-1">{ticketStatusConfig[ticket.status].label}</span>
                                </Badge>
                                <span className={cn("text-xs", priorityConfig[ticket.priority].color)}>
                                  {priorityConfig[ticket.priority].label}
                                </span>
                              </div>
                              <h3 className="font-semibold truncate">{ticket.subject}</h3>
                              {ticket.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  {ticket.description}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-2">
                                Aberto em {formatDate(ticket.created_at)}
                              </p>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>

      {/* Modal de Novo Chamado Técnico */}
      <Dialog open={showNewTicketModal} onOpenChange={setShowNewTicketModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              Novo Chamado
            </DialogTitle>
            <DialogDescription>
              Descreva seu problema técnico, financeiro ou denúncia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Categoria do chamado */}
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select
                value={newTicket.category}
                onValueChange={(value) => setNewTicket(prev => ({ ...prev, category: value as any }))}
              >
                <SelectTrigger className="focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">
                    <span className="flex items-center gap-2">
                      <Bug className="h-4 w-4 text-blue-400" />
                      Técnico
                    </span>
                  </SelectItem>
                  <SelectItem value="financial">
                    <span className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                      Financeiro
                    </span>
                  </SelectItem>
                  <SelectItem value="report">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                      Denúncia
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Assunto *</Label>
              <Input
                id="subject"
                placeholder="Resumo do problema"
                value={newTicket.subject}
                onChange={(e) => setNewTicket(prev => ({ ...prev, subject: e.target.value }))}
                className="focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Descreva em detalhes..."
                rows={4}
                value={newTicket.description}
                onChange={(e) => setNewTicket(prev => ({ ...prev, description: e.target.value }))}
                className="focus:ring-primary focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select
                value={newTicket.priority}
                onValueChange={(value) => setNewTicket(prev => ({ ...prev, priority: value as any }))}
              >
                <SelectTrigger className="focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNewTicketModal(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreateTicket}
                disabled={!newTicket.subject.trim() || createTicket.isPending}
              >
                {createTicket.isPending ? 'Enviando...' : 'Enviar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Novo Feedback */}
      <Dialog open={showNewFeedbackModal} onOpenChange={setShowNewFeedbackModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {feedbackTypeConfig[newFeedback.type].icon}
              <span className={feedbackTypeConfig[newFeedback.type].color}>
                {feedbackTypeConfig[newFeedback.type].label}
              </span>
            </DialogTitle>
            <DialogDescription>
              {feedbackTypeConfig[newFeedback.type].description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {/* Seletor de Tipo */}
            <div className="space-y-2">
              <Label>Tipo de Feedback</Label>
              <Select
                value={newFeedback.type}
                onValueChange={(value) => setNewFeedback(prev => ({ ...prev, type: value as any }))}
              >
                <SelectTrigger className="focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggestion">
                    <span className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-primary" />
                      Sugestão de Função
                    </span>
                  </SelectItem>
                  <SelectItem value="praise">
                    <span className="flex items-center gap-2">
                      <Heart className="h-4 w-4 text-[hsl(142,76%,36%)]" />
                      Elogio
                    </span>
                  </SelectItem>
                  <SelectItem value="criticism">
                    <span className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-[hsl(25,95%,53%)]" />
                      Crítica Construtiva
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Campo Principal */}
            <div className="space-y-2">
              <Label htmlFor="feedback-description">O que podemos melhorar? *</Label>
              <Textarea
                id="feedback-description"
                placeholder={
                  newFeedback.type === 'suggestion' ? 'Descreva sua ideia de nova funcionalidade...' :
                  newFeedback.type === 'praise' ? 'Conte o que você mais gostou...' :
                  'Nos ajude a entender o que pode melhorar...'
                }
                rows={5}
                value={newFeedback.description}
                onChange={(e) => setNewFeedback(prev => ({ ...prev, description: e.target.value }))}
                className="focus:ring-primary focus:border-primary"
              />
            </div>
            
            {/* Aviso de Recompensa */}
            {newFeedback.type === 'suggestion' && (
              <div className="p-3 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                <div className="flex items-center gap-2 text-[hsl(45,93%,47%)]">
                  <Gift className="h-4 w-4" />
                  <span className="text-sm font-medium">Feedbacks implementados ganham cupons!</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowNewFeedbackModal(false)}
              >
                Cancelar
              </Button>
              {/* Botão com Glow Neon Pink */}
              <Button
                className="flex-1 bg-gradient-to-r from-primary to-[#FF007F] hover:opacity-90 shadow-[0_0_15px_rgba(255,0,127,0.4)] hover:shadow-[0_0_25px_rgba(255,0,127,0.6)] transition-all gap-2"
                onClick={handleCreateFeedback}
                disabled={!newFeedback.description.trim() || createFeedback.isPending}
              >
                <Send className="h-4 w-4" />
                {createFeedback.isPending ? 'Enviando...' : 'Enviar Feedback'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes do Chamado */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={cn("text-xs", ticketStatusConfig[selectedTicket.status].color)}>
                    {ticketStatusConfig[selectedTicket.status].icon}
                    <span className="ml-1">{ticketStatusConfig[selectedTicket.status].label}</span>
                  </Badge>
                </div>
                <DialogTitle>{selectedTicket.subject}</DialogTitle>
                <DialogDescription>
                  Aberto em {formatDate(selectedTicket.created_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {selectedTicket.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Descrição</Label>
                    <p className="mt-1 text-sm">{selectedTicket.description}</p>
                  </div>
                )}
                
                {selectedTicket.admin_response && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <Label className="text-xs text-primary">Resposta da Equipe</Label>
                    </div>
                    <p className="text-sm">{selectedTicket.admin_response}</p>
                    {selectedTicket.resolved_at && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Respondido em {formatDate(selectedTicket.resolved_at)}
                      </p>
                    )}
                  </div>
                )}

                {!selectedTicket.admin_response && selectedTicket.status === 'open' && (
                  <div className="p-4 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                      <p className="text-sm text-[hsl(45,93%,47%)]">
                        Aguardando resposta da equipe
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Detalhes do Feedback */}
      <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="outline" className={cn("text-xs", feedbackStatusConfig[selectedFeedback.status].color)}>
                    {feedbackStatusConfig[selectedFeedback.status].icon}
                    <span className="ml-1">{feedbackStatusConfig[selectedFeedback.status].label}</span>
                  </Badge>
                </div>
                <DialogTitle>{selectedFeedback.title}</DialogTitle>
                <DialogDescription>
                  {feedbackStatusConfig[selectedFeedback.status].description}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {selectedFeedback.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Descrição</Label>
                    <p className="mt-1 text-sm">{selectedFeedback.description}</p>
                  </div>
                )}
                
                {selectedFeedback.admin_response && (
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <Label className="text-xs text-primary">Resposta da Equipe</Label>
                    </div>
                    <p className="text-sm">{selectedFeedback.admin_response}</p>
                  </div>
                )}

                {/* Cupom de Recompensa */}
                {selectedFeedback.reward_coupon_code && (
                  <div className="p-4 rounded-lg bg-gradient-to-r from-[hsl(45,93%,47%)]/20 to-primary/20 border border-[hsl(45,93%,47%)]/50">
                    <div className="flex items-center gap-2 mb-3">
                      <Gift className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                      <span className="font-semibold text-[hsl(45,93%,47%)]">🎉 Parabéns! Você ganhou um prêmio!</span>
                    </div>
                    <div className="p-3 rounded-lg bg-background/50 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Seu cupom de desconto</p>
                      <p className="text-2xl font-bold font-mono tracking-wider text-primary">
                        {selectedFeedback.reward_coupon_code}
                      </p>
                      <p className="text-sm text-[hsl(142,76%,36%)] mt-2">
                        {selectedFeedback.reward_discount}% de desconto
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      Use este cupom na sua próxima assinatura ou compra!
                    </p>
                  </div>
                )}

                {selectedFeedback.status === 'pending' && (
                  <div className="p-4 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                      <p className="text-sm text-[hsl(45,93%,47%)]">
                        Aguardando análise do administrador
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Enviado em {formatDate(selectedFeedback.created_at)}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Denúncia de Revenge Porn */}
      <RevengePortnReportModal
        open={showRevengeReportModal}
        onOpenChange={setShowRevengeReportModal}
      />
    </div>
  );
}
