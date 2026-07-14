import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Lightbulb, Paperclip, X, Send, Loader2, Clock, CheckCircle2, MessageSquare, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useMyTickets } from '@/hooks/useSupportTickets';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

interface SupportTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: 'new' | 'history';
}

import { EXTERNAL_SUPABASE_URL as SUPABASE_URL } from '@/lib/appConfig';
const MAX_CHARS = 500;

export function SupportTicketModal({ open, onOpenChange, initialTab }: SupportTicketModalProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mainTab, setMainTab] = useState<'new' | 'history'>(initialTab || 'new');

  // Sync initialTab when modal opens
  const prevOpenRef = useRef(false);
  if (open && !prevOpenRef.current && initialTab) {
    setMainTab(initialTab);
  }
  prevOpenRef.current = open;
  const [activeTab, setActiveTab] = useState<'problem' | 'suggestion'>('problem');
  const [description, setDescription] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  // Fetch user tickets only when history tab is active
  const { data: myTickets, isLoading: loadingTickets } = useMyTickets();

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo de 5MB.', variant: 'destructive' });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Formato inválido', description: 'Apenas imagens são permitidas.', variant: 'destructive' });
      return;
    }
    setAttachmentFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAttachmentPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const removeAttachment = useCallback(() => {
    setAttachmentFile(null);
    setAttachmentPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetForm = useCallback(() => {
    setDescription('');
    removeAttachment();
    setActiveTab('problem');
  }, [removeAttachment]);

  const handleSubmit = async () => {
    if (!description.trim() || !user?.id) {
      toast({ title: 'Preencha a descrição', variant: 'destructive' });
      return;
    }

    setIsSending(true);
    let attachmentUrl: string | null = null;

    try {
      if (attachmentFile) {
        const ext = attachmentFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('support_attachments')
          .upload(path, attachmentFile, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          toast({ title: 'Erro ao enviar anexo', description: uploadError.message, variant: 'destructive' });
          setIsSending(false);
          return;
        }
        attachmentUrl = `${SUPABASE_URL}/storage/v1/object/public/support_attachments/${path}`;
      }

      const subject = activeTab === 'problem' ? 'Reportar Problema' : 'Sugestão / Reclamação';
      const { error: insertError } = await (supabase as any)
        .from('support_tickets')
        .insert({
          user_id: user.id,
          subject,
          description: description.trim(),
          category: activeTab,
          attachment_url: attachmentUrl,
          priority: 'medium',
          status: 'open',
        });

      if (insertError) throw insertError;

      // Insert confirmation notification
      await (supabase as any).from('notifications').insert({
        user_id: user.id,
        type: 'system',
        title: 'Chamado Recebido',
        body: 'Sua solicitação foi registrada e será analisada pela nossa equipe.',
        data: { source: 'support_ticket' },
        is_read: false,
      });

      toast({ title: 'Enviado com sucesso!', description: 'Nossa equipe responderá em breve.' });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['my-tickets'] });
      setMainTab('history');
    } catch (err: any) {
      toast({ title: 'Erro ao enviar', description: err?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card/95 backdrop-blur-xl border-border/50 max-w-[calc(100vw-2rem)] sm:max-w-md z-[9999] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Central de Ajuda
            </DialogTitle>
          </DialogHeader>

          {/* Main Tabs: New ticket vs History */}
          <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as 'new' | 'history')}>
            <TabsList className="grid w-full grid-cols-2 bg-muted/50">
              <TabsTrigger value="new" className="gap-1.5 text-xs">
                <Send className="h-3.5 w-3.5" />
                Novo Chamado
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5 text-xs">
                <Clock className="h-3.5 w-3.5" />
                Meus Chamados
                {myTickets && myTickets.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {myTickets.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ===== NEW TICKET TAB ===== */}
            <TabsContent value="new" className="mt-3 space-y-3">
              {/* User Info */}
              <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50 text-xs space-y-0.5">
                <p>
                  <span className="font-medium text-foreground">{profile?.name || 'Usuário'}</span>
                  {profile?.username && <span className="text-muted-foreground"> @{profile.username}</span>}
                </p>
                <p className="text-muted-foreground text-[10px]">{user?.email}</p>
              </div>

              {/* Type Tabs */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'problem' | 'suggestion')}>
                <TabsList className="grid w-full grid-cols-2 bg-muted/30 h-8">
                  <TabsTrigger value="problem" className="gap-1 text-[11px] h-6 data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    Problema
                  </TabsTrigger>
                  <TabsTrigger value="suggestion" className="gap-1 text-[11px] h-6 data-[state=active]:bg-[hsl(142,76%,36%)]/15 data-[state=active]:text-[hsl(142,76%,36%)]">
                    <Lightbulb className="h-3 w-3" />
                    Sugestão
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Textarea
                placeholder={activeTab === 'problem' ? 'Descreva o problema...' : 'Sua sugestão ou reclamação...'}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_CHARS))}
                className="min-h-[100px] resize-none bg-muted/20 border-border/50 text-sm"
              />

              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50">
                  {description.length}/{MAX_CHARS}
                </Badge>
                <Button type="button" variant="outline" size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-1.5 text-xs border-border/50 h-7">
                  <Paperclip className="h-3 w-3" />
                  Anexar Print
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </div>

              {attachmentPreview && (
                <div className="relative rounded-lg overflow-hidden border border-border/50">
                  <img loading="lazy" decoding="async" src={attachmentPreview} alt="Anexo" className="w-full max-h-32 object-contain bg-black/10" />
                  <Button variant="destructive" size="icon"
                    className="absolute top-1 right-1 h-5 w-5 rounded-full"
                    onClick={removeAttachment} aria-label="Fechar">
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 border-border/50 h-9 text-xs" disabled={isSending}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={!description.trim() || isSending}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-primary-foreground font-semibold gap-1.5 h-9 text-xs">
                  {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {isSending ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </TabsContent>

            {/* ===== HISTORY TAB ===== */}
            <TabsContent value="history" className="mt-3">
              {loadingTickets ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !myTickets || myTickets.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum chamado enviado</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                  {myTickets.map((ticket) => {
                    const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';
                    const cat = (ticket as any).category;
                    const attachUrl = (ticket as any).attachment_url as string | null;
                    return (
                      <div key={ticket.id} className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {cat === 'suggestion' ? (
                              <Lightbulb className="h-3.5 w-3.5 text-[hsl(142,76%,36%)]" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            )}
                            <span className="text-[11px] font-medium">
                              {cat === 'suggestion' ? 'Sugestão' : 'Problema'}
                            </span>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              isResolved
                                ? 'bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] border-[hsl(142,76%,36%)]/30'
                                : 'bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30'
                            }`}
                          >
                            {isResolved ? (
                              <><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Respondido</>
                            ) : (
                              <><Clock className="h-2.5 w-2.5 mr-0.5" />Em Análise</>
                            )}
                          </Badge>
                        </div>

                        {/* User message */}
                        <p className="text-xs text-foreground/80 line-clamp-3">{ticket.description}</p>

                        {/* Attachment thumbnail */}
                        {attachUrl && (
                          <div
                            className="rounded overflow-hidden border border-border/30 cursor-pointer w-fit"
                            onClick={() => setFullscreenImage(attachUrl)}
                          >
                            <img decoding="async" src={attachUrl} alt="Anexo" className="h-16 w-24 object-cover" loading="lazy" />
                          </div>
                        )}

                        {/* Admin response */}
                        {ticket.admin_response && (
                          <div className="ml-3 pl-2.5 border-l-2 border-primary/40 space-y-1">
                            <p className="text-[10px] font-medium text-primary">Resposta do Suporte</p>
                            <p className="text-xs text-foreground/90">{ticket.admin_response}</p>
                            {ticket.resolved_at && (
                              <p className="text-[10px] text-muted-foreground">{formatDate(ticket.resolved_at)}</p>
                            )}
                          </div>
                        )}

                        <p className="text-[10px] text-muted-foreground/60">{formatDate(ticket.created_at)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Fullscreen image viewer */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center"
          onClick={() => setFullscreenImage(null)}
        >
          <Button variant="ghost" size="icon"
            className="absolute top-3 right-3 z-10 text-white/80 hover:text-white h-10 w-10"
            onClick={() => setFullscreenImage(null)}>
            <X className="h-6 w-6" />
          </Button>
          <img loading="lazy" decoding="async" src={fullscreenImage} alt="Anexo ampliado" className="max-w-full max-h-full object-contain p-4" />
        </div>
      )}
    </>
  );
}
