import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { 
  LifeBuoy, 
  Clock, 
  CheckCircle2, 
  MessageSquare,
  Search,
  Send,
  Lightbulb,
  Bug,
  AlertTriangle,
  Gift,
  XCircle,
  Bell,
  Percent,
  Image as ImageIcon,
  X,
  Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAllTickets, useUpdateTicketStatus, useTicketCounts, type SupportTicket } from "@/hooks/useSupportTickets";
import { useAllFeedback, useUpdateFeedbackStatus, useFeedbackCounts, type UserFeedback } from "@/hooks/useUserFeedback";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useAudit } from "@/hooks/useAudit";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

const feedbackStatusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { 
    label: 'Pendente', 
    color: 'bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30',
    icon: <Clock className="h-3 w-3" />
  },
  analyzing: { 
    label: 'Em Análise', 
    color: 'bg-primary/10 text-primary border-primary/30',
    icon: <Search className="h-3 w-3" />
  },
  implemented: { 
    label: 'Implementado', 
    color: 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30',
    icon: <CheckCircle2 className="h-3 w-3" />
  },
  rejected: { 
    label: 'Rejeitado', 
    color: 'bg-destructive/10 text-destructive border-destructive/30',
    icon: <XCircle className="h-3 w-3" />
  },
};

const feedbackTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  suggestion: { 
    label: 'Sugestão', 
    color: 'text-primary',
    icon: <Lightbulb className="h-4 w-4" />
  },
  complaint: { 
    label: 'Reclamação', 
    color: 'text-[hsl(25,95%,53%)]',
    icon: <AlertTriangle className="h-4 w-4" />
  },
  bug: { 
    label: 'Bug', 
    color: 'text-destructive',
    icon: <Bug className="h-4 w-4" />
  },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-muted-foreground' },
  medium: { label: 'Média', color: 'text-[hsl(45,93%,47%)]' },
  high: { label: 'Alta', color: 'text-[hsl(25,95%,53%)]' },
  urgent: { label: 'Urgente', color: 'text-destructive' },
};

export default function AdminSupportPage() {
  const [activeTab, setActiveTab] = useState<'tickets' | 'feedback'>('tickets');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<UserFeedback | null>(null);
  const [adminResponse, setAdminResponse] = useState('');
  const [rewardCouponCode, setRewardCouponCode] = useState('');
  const [rewardDiscount, setRewardDiscount] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const { data: tickets, isLoading: loadingTickets } = useAllTickets(statusFilter);
  const { data: ticketCounts } = useTicketCounts();
  const { data: feedbacks, isLoading: loadingFeedbacks } = useAllFeedback(statusFilter);
  const { data: feedbackCounts } = useFeedbackCounts();
  const updateTicketStatus = useUpdateTicketStatus();
  const updateFeedbackStatus = useUpdateFeedbackStatus();
  const { logAction } = useAudit();
  const { unreadCount } = useAdminNotifications();

  // Filter tickets by category
  const filteredTickets = tickets?.filter(t => {
    if (categoryFilter === 'all') return true;
    const cat = (t as any).category;
    return cat === categoryFilter;
  });

  const handleUpdateTicketStatus = useCallback(async (ticketId: string, status: 'in_progress' | 'resolved' | 'closed') => {
    setIsSending(true);
    try {
      await updateTicketStatus.mutateAsync({
        ticketId,
        status,
        adminResponse: (status === 'resolved' || status === 'closed') ? adminResponse : undefined,
      });

      // Send notification to ticket owner when resolved/closed
      if ((status === 'resolved' || status === 'closed') && selectedTicket) {
        await (supabase as any).from('notifications').insert({
          user_id: selectedTicket.user_id,
          type: 'support_response',
          title: 'Resposta do Suporte',
          body: 'Oculto Master respondeu ao seu chamado.',
          data: { ticket_id: ticketId },
          is_read: false,
        });
      }

      await logAction(status === 'resolved' ? 'ticket_resolved' : 'ticket_closed', {
        targetResource: 'support_tickets',
        targetId: ticketId,
        details: { status },
      });

      toast({ title: 'Chamado atualizado com sucesso!' });
      setSelectedTicket(null);
      setAdminResponse('');
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [adminResponse, updateTicketStatus, logAction, selectedTicket]);

  const handleUpdateFeedbackStatus = useCallback(async (
    feedbackId: string, 
    status: 'analyzing' | 'implemented' | 'rejected'
  ) => {
    setIsSending(true);
    try {
      await updateFeedbackStatus.mutateAsync({
        feedbackId,
        status,
        adminResponse: adminResponse || undefined,
        rewardCouponCode: status === 'implemented' && rewardCouponCode ? rewardCouponCode : undefined,
        rewardDiscount: status === 'implemented' && rewardDiscount ? parseInt(rewardDiscount) : undefined,
      });

      await logAction('feedback_updated', {
        targetResource: 'user_feedback',
        targetId: feedbackId,
        details: { status, hasCoupon: !!rewardCouponCode },
      });

      toast({ title: 'Feedback atualizado!' });
      setSelectedFeedback(null);
      setAdminResponse('');
      setRewardCouponCode('');
      setRewardDiscount('');
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [adminResponse, rewardCouponCode, rewardDiscount, updateFeedbackStatus, logAction]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isLoading = loadingTickets || loadingFeedbacks;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Central de Suporte</h1>
          <p className="text-xs text-muted-foreground">Chamados e feedbacks</p>
        </div>
        {unreadCount > 0 && (
          <Badge className="bg-primary gap-1">
            <Bell className="h-3 w-3" />
            {unreadCount}
          </Badge>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setStatusFilter('all'); setCategoryFilter('all'); }}>
        <TabsList className="bg-muted/50 w-full">
          <TabsTrigger value="tickets" className="gap-1.5 flex-1 text-xs">
            <LifeBuoy className="h-3.5 w-3.5" />
            Chamados
            {(ticketCounts?.open || 0) > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {ticketCounts?.open}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5 flex-1 text-xs">
            <Lightbulb className="h-3.5 w-3.5" />
            Feedback
            {(feedbackCounts?.pending || 0) > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {feedbackCounts?.pending}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ========== TICKETS TAB ========== */}
        <TabsContent value="tickets" className="mt-3 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'open', label: 'Abertos', count: ticketCounts?.open || 0, color: 'text-[hsl(45,93%,47%)]' },
              { key: 'in_progress', label: 'Andamento', count: ticketCounts?.in_progress || 0, color: 'text-primary' },
              { key: 'resolved', label: 'Resolvidos', count: ticketCounts?.resolved || 0, color: 'text-[hsl(142,76%,36%)]' },
              { key: 'closed', label: 'Fechados', count: ticketCounts?.closed || 0, color: 'text-muted-foreground' },
            ].map(s => (
              <Card key={s.key} className="bg-card/50">
                <CardContent className="p-2 text-center">
                  <p className={cn("text-lg font-bold", s.color)}>{s.count}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList className="bg-muted/50 h-8">
                <TabsTrigger value="all" className="text-xs h-6 px-2">Todos</TabsTrigger>
                <TabsTrigger value="open" className="text-xs h-6 px-2">Abertos</TabsTrigger>
                <TabsTrigger value="resolved" className="text-xs h-6 px-2">Resolvidos</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={categoryFilter} onValueChange={setCategoryFilter}>
              <TabsList className="bg-muted/50 h-8">
                <TabsTrigger value="all" className="text-xs h-6 px-2">Tipo: Todos</TabsTrigger>
                <TabsTrigger value="problem" className="text-xs h-6 px-2">Problemas</TabsTrigger>
                <TabsTrigger value="suggestion" className="text-xs h-6 px-2">Sugestões</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tickets List */}
          {(!filteredTickets || filteredTickets.length === 0) ? (
            <Card className="bg-card/50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <LifeBuoy className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum chamado encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((ticket) => {
                const cat = (ticket as any).category;
                const hasAttachment = !!(ticket as any).attachment_url;
                return (
                  <Card 
                    key={ticket.id} 
                    className="bg-card/50 border-border/50 active:bg-card/80 transition-colors cursor-pointer"
                    onClick={() => { setSelectedTicket(ticket); setAdminResponse(''); }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={ticket.user_profile?.avatar_url || undefined} loading="lazy" />
                          <AvatarFallback className="text-xs">
                            {ticket.user_profile?.name?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-medium text-xs truncate max-w-[120px]">
                              {ticket.user_profile?.name || 'Usuário'}
                            </span>
                            <Badge variant="outline" className={cn("text-[10px] px-1 py-0", ticketStatusConfig[ticket.status]?.color)}>
                              {ticketStatusConfig[ticket.status]?.label}
                            </Badge>
                            {cat && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {cat === 'problem' ? '🔴 Problema' : '💡 Sugestão'}
                              </Badge>
                            )}
                            {hasAttachment && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {ticket.description || ticket.subject}
                          </p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatDate(ticket.created_at)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ========== FEEDBACK TAB ========== */}
        <TabsContent value="feedback" className="mt-3 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Pendentes', count: feedbackCounts?.pending || 0, color: 'text-[hsl(45,93%,47%)]' },
              { label: 'Análise', count: feedbackCounts?.analyzing || 0, color: 'text-primary' },
              { label: 'Feitos', count: feedbackCounts?.implemented || 0, color: 'text-[hsl(142,76%,36%)]' },
              { label: 'Rejeitados', count: feedbackCounts?.rejected || 0, color: 'text-destructive' },
            ].map((s, i) => (
              <Card key={i} className="bg-card/50">
                <CardContent className="p-2 text-center">
                  <p className={cn("text-lg font-bold", s.color)}>{s.count}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="bg-muted/50 h-8">
              <TabsTrigger value="all" className="text-xs h-6 px-2">Todos</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs h-6 px-2">Pendentes</TabsTrigger>
              <TabsTrigger value="analyzing" className="text-xs h-6 px-2">Em Análise</TabsTrigger>
              <TabsTrigger value="implemented" className="text-xs h-6 px-2">Implementados</TabsTrigger>
            </TabsList>
          </Tabs>

          {(!feedbacks || feedbacks.length === 0) ? (
            <Card className="bg-card/50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10">
                <Lightbulb className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum feedback encontrado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {feedbacks.map((feedback) => {
                const typeInfo = feedbackTypeConfig[feedback.type];
                const statusInfo = feedbackStatusConfig[feedback.status];
                return (
                  <Card 
                    key={feedback.id} 
                    className="bg-card/50 border-border/50 active:bg-card/80 transition-colors cursor-pointer"
                    onClick={() => { setSelectedFeedback(feedback); setAdminResponse(''); }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={feedback.user_profile?.avatar_url || undefined} loading="lazy" />
                          <AvatarFallback className="text-xs">
                            {feedback.user_profile?.name?.charAt(0) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className="font-medium text-xs truncate max-w-[120px]">
                              {feedback.user_profile?.name || 'Usuário'}
                            </span>
                            {typeInfo && (
                              <span className={cn("flex items-center gap-0.5 text-[10px] font-medium", typeInfo.color)}>
                                {typeInfo.icon}
                                {typeInfo.label}
                              </span>
                            )}
                            {statusInfo && (
                              <Badge variant="outline" className={cn("text-[10px] px-1 py-0", statusInfo.color)}>
                                {statusInfo.label}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs font-medium truncate">{feedback.title}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatDate(feedback.created_at)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ========== TICKET DETAIL MODAL ========== */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedTicket.user_profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {selectedTicket.user_profile?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">
                      {selectedTicket.user_profile?.name || 'Usuário'}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px]", ticketStatusConfig[selectedTicket.status]?.color)}>
                      {ticketStatusConfig[selectedTicket.status]?.label}
                    </Badge>
                    <span className={cn("text-xs font-medium", priorityConfig[selectedTicket.priority]?.color)}>
                      {priorityConfig[selectedTicket.priority]?.label}
                    </span>
                  </div>
                </div>
                <DialogTitle className="text-base">{selectedTicket.subject}</DialogTitle>
                <p className="text-[10px] text-muted-foreground">{formatDate(selectedTicket.created_at)}</p>
              </DialogHeader>
              
              <div className="space-y-3 mt-2">
                {/* Description */}
                {selectedTicket.description && (
                  <div className="p-3 rounded-lg bg-muted/30 text-sm">
                    {selectedTicket.description}
                  </div>
                )}

                {/* Attachment preview */}
                {(selectedTicket as any).attachment_url && (
                  <div 
                    className="rounded-lg overflow-hidden border border-border/50 cursor-pointer"
                    onClick={() => setFullscreenImage((selectedTicket as any).attachment_url)}
                  >
                    <img decoding="async" 
                      src={(selectedTicket as any).attachment_url} 
                      alt="Anexo do chamado"
                      className="w-full max-h-48 object-contain bg-black/10"
                      loading="lazy"
                    />
                    <p className="text-[10px] text-center text-muted-foreground py-1">Toque para ampliar</p>
                  </div>
                )}

                {/* Response area */}
                {(selectedTicket.status === 'open' || selectedTicket.status === 'in_progress') ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Resposta</Label>
                      <Textarea
                        placeholder="Digite sua resposta..."
                        rows={3}
                        value={adminResponse}
                        onChange={(e) => setAdminResponse(e.target.value)}
                        className="resize-none text-sm"
                      />
                    </div>

                    <div className="flex gap-2">
                      {selectedTicket.status === 'open' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={isSending}
                          onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'in_progress')}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" />
                          Em Andamento
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="flex-1 text-xs bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,36%)]/90"
                        onClick={() => handleUpdateTicketStatus(selectedTicket.id, 'resolved')}
                        disabled={!adminResponse.trim() || isSending}
                      >
                        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                        Resolver
                      </Button>
                    </div>
                  </>
                ) : (
                  selectedTicket.admin_response && (
                    <div className="p-3 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30">
                      <Label className="text-[10px] text-[hsl(142,76%,36%)] font-medium">Resposta enviada</Label>
                      <p className="text-sm mt-1">{selectedTicket.admin_response}</p>
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== FEEDBACK DETAIL MODAL ========== */}
      <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto p-4">
          {selectedFeedback && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={selectedFeedback.user_profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {selectedFeedback.user_profile?.name?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">
                      {selectedFeedback.user_profile?.name || 'Usuário'}
                    </span>
                    {feedbackTypeConfig[selectedFeedback.type] && (
                      <span className={cn("flex items-center gap-0.5 text-xs", feedbackTypeConfig[selectedFeedback.type].color)}>
                        {feedbackTypeConfig[selectedFeedback.type].icon}
                        {feedbackTypeConfig[selectedFeedback.type].label}
                      </span>
                    )}
                  </div>
                </div>
                <DialogTitle className="text-base">{selectedFeedback.title}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-3 mt-2">
                {selectedFeedback.description && (
                  <div className="p-3 rounded-lg bg-muted/30 text-sm">
                    {selectedFeedback.description}
                  </div>
                )}

                {(selectedFeedback.status === 'pending' || selectedFeedback.status === 'analyzing') ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Resposta (opcional)</Label>
                      <Textarea
                        placeholder="Responda ao usuário..."
                        rows={3}
                        value={adminResponse}
                        onChange={(e) => setAdminResponse(e.target.value)}
                        className="resize-none text-sm"
                      />
                    </div>

                    <div className="p-3 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 space-y-2">
                      <div className="flex items-center gap-1.5 text-[hsl(45,93%,47%)]">
                        <Gift className="h-3.5 w-3.5" />
                        <span className="font-medium text-xs">Cupom de Recompensa</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Código</Label>
                          <Input
                            placeholder="OBRIGADO20"
                            value={rewardCouponCode}
                            onChange={(e) => setRewardCouponCode(e.target.value.toUpperCase())}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px]">Desconto (%)</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              min="1"
                              max="100"
                              placeholder="20"
                              value={rewardDiscount}
                              onChange={(e) => setRewardDiscount(e.target.value)}
                              className="h-8 text-xs"
                            />
                            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {selectedFeedback.status === 'pending' && (
                        <Button variant="outline" size="sm" className="flex-1 text-xs" disabled={isSending}
                          onClick={() => handleUpdateFeedbackStatus(selectedFeedback.id, 'analyzing')}>
                          <Search className="h-3.5 w-3.5 mr-1" />
                          Em Análise
                        </Button>
                      )}
                      <Button size="sm" className="flex-1 text-xs bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,36%)]/90" disabled={isSending}
                        onClick={() => handleUpdateFeedbackStatus(selectedFeedback.id, 'implemented')}>
                        {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                        Implementar
                      </Button>
                      <Button variant="destructive" size="sm" disabled={isSending}
                        onClick={() => handleUpdateFeedbackStatus(selectedFeedback.id, 'rejected')}>
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {selectedFeedback.admin_response && (
                      <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                        <Label className="text-[10px] text-primary font-medium">Resposta enviada</Label>
                        <p className="text-sm mt-1">{selectedFeedback.admin_response}</p>
                      </div>
                    )}
                    {selectedFeedback.reward_coupon_code && (
                      <div className="p-3 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                        <div className="flex items-center gap-1.5 text-[hsl(45,93%,47%)] mb-1">
                          <Gift className="h-3.5 w-3.5" />
                          <span className="font-medium text-xs">Cupom enviado</span>
                        </div>
                        <p className="font-mono font-bold text-sm">{selectedFeedback.reward_coupon_code}</p>
                        <p className="text-xs text-muted-foreground">{selectedFeedback.reward_discount}% de desconto</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========== FULLSCREEN IMAGE MODAL ========== */}
      {fullscreenImage && (
        <div 
          className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center"
          onClick={() => setFullscreenImage(null)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 z-10 text-white/80 hover:text-white h-10 w-10"
            onClick={() => setFullscreenImage(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          <img loading="lazy" decoding="async"
            src={fullscreenImage}
            alt="Anexo ampliado"
            className="max-w-full max-h-full object-contain p-4"
          />
        </div>
      )}
    </div>
  );
}
