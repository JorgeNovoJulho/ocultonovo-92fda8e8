import { useState } from "react";
import { usePromotions, useCreatePromotion, useUpdatePromotion, useDeletePromotion, Promotion } from "@/hooks/usePromotions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Gift, Plus, Pencil, Trash2, Loader2, Megaphone, MessageCircle, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";
import { PromotionAnalyticsDashboard } from "@/components/admin/PromotionAnalyticsDashboard";

type FormData = Omit<Promotion, "id" | "created_at" | "updated_at" | "whatsapp_status" | "whatsapp_sent_count" | "whatsapp_error_count" | "whatsapp_sent_at">;

const emptyForm: FormData = {
  title: "",
  description: "",
  rules: "",
  type: "custom",
  reward_value: 0,
  is_active: false,
  banner_text: "",
  start_date: null,
  end_date: null,
  notify_whatsapp: false,
  whatsapp_audience: "all",
};

const typeLabels: Record<Promotion["type"], string> = {
  referral: "Indicação",
  cashback: "Cashback",
  bonus_plan: "Bônus de Plano",
  creator_commission: "Comissão Creator",
  custom: "Personalizada",
};

const waStatusConfig: Record<string, { label: string; color: string; icon: typeof Send }> = {
  idle: { label: "Não enviado", color: "text-muted-foreground", icon: Send },
  sending: { label: "Enviando...", color: "text-[hsl(45,93%,47%)]", icon: Loader2 },
  completed: { label: "Concluído", color: "text-emerald-400", icon: CheckCircle2 },
  error: { label: "Com erros", color: "text-destructive", icon: AlertTriangle },
};

export default function AdminPromotionsPage() {
  const { data: promotions, isLoading } = usePromotions();
  const createMut = useCreatePromotion();
  const updateMut = useUpdatePromotion();
  const deleteMut = useDeletePromotion();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [sendingWa, setSendingWa] = useState<string | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (p: Promotion) => {
    setEditing(p);
    setForm({
      title: p.title,
      description: p.description || "",
      rules: p.rules || "",
      type: p.type,
      reward_value: p.reward_value,
      is_active: p.is_active,
      banner_text: p.banner_text || "",
      start_date: p.start_date?.slice(0, 16) || null,
      end_date: p.end_date?.slice(0, 16) || null,
      notify_whatsapp: p.notify_whatsapp,
      whatsapp_audience: p.whatsapp_audience,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      banner_text: form.banner_text?.trim() || null,
    };
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createMut.mutateAsync(payload as any);
    }
    setFormOpen(false);
  };

  const handleToggle = (p: Promotion) => {
    updateMut.mutate({ id: p.id, is_active: !p.is_active });
  };

  const handleSendWhatsApp = async (promoId: string) => {
    setSendingWa(promoId);
    try {
      const { error } = await supabase.functions.invoke('send-promotion-whatsapp', {
        body: { promotion_id: promoId },
      });
      if (error) throw error;
      toast.success("Disparo WhatsApp iniciado! Acompanhe o status.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao disparar WhatsApp");
    } finally {
      setSendingWa(null);
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gift className="h-6 w-6 text-primary" />
            Gestão de Promoções
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie promoções, banners e disparos WhatsApp em tempo real.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Promoção
        </Button>
      </div>

      {/* Analytics Dashboard */}
      <PromotionAnalyticsDashboard />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !promotions?.length ? (
        <div className="text-center py-16 text-muted-foreground">Nenhuma promoção cadastrada.</div>
      ) : (
        <div className="grid gap-4">
          {promotions.map((p) => {
            const waCfg = waStatusConfig[p.whatsapp_status] || waStatusConfig.idle;
            const WaIcon = waCfg.icon;
            return (
              <div key={p.id} className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{p.title}</h3>
                      <Badge variant="outline" className="text-[10px]">{typeLabels[p.type]}</Badge>
                      {p.banner_text && (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px] gap-1">
                          <Megaphone className="h-3 w-3" /> Banner
                        </Badge>
                      )}
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}
                    {p.reward_value > 0 && (
                      <span className="text-xs text-emerald-400 font-medium">
                        Recompensa: {p.type === "cashback" ? `${p.reward_value}%` : `R$${p.reward_value}`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{p.is_active ? "Ativa" : "Inativa"}</span>
                      <Switch checked={p.is_active} onCheckedChange={() => handleToggle(p)} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteTarget(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* WhatsApp status row */}
                {p.notify_whatsapp && (
                  <div className="flex items-center gap-3 pt-2 border-t border-border/30">
                    <MessageCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <WaIcon className={`h-3.5 w-3.5 ${waCfg.color} ${p.whatsapp_status === 'sending' ? 'animate-spin' : ''}`} />
                      <span className={`text-xs font-medium ${waCfg.color}`}>{waCfg.label}</span>
                      {(p.whatsapp_sent_count > 0 || p.whatsapp_error_count > 0) && (
                        <span className="text-[10px] text-muted-foreground">
                          ({p.whatsapp_sent_count} enviados{p.whatsapp_error_count > 0 ? `, ${p.whatsapp_error_count} erros` : ''})
                        </span>
                      )}
                      <Badge variant="outline" className="text-[10px] ml-auto">
                        {p.whatsapp_audience === 'all' ? 'Todos' : 'Apenas Gratuitos'}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs shrink-0"
                      disabled={p.whatsapp_status === 'sending' || sendingWa === p.id}
                      onClick={() => handleSendWhatsApp(p.id)}
                    >
                      {sendingWa === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {p.whatsapp_status === 'completed' ? 'Reenviar' : 'Disparar'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Promoção" : "Nova Promoção"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Cashback de Carnaval" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as Promotion["type"] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description || ""} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div>
              <Label>Regras</Label>
              <Textarea value={form.rules || ""} onChange={(e) => setForm(f => ({ ...f, rules: e.target.value }))} rows={2} placeholder="Condições e regras da promoção..." />
            </div>
            <div>
              <Label>Valor da Recompensa</Label>
              <Input type="number" value={form.reward_value} onChange={(e) => setForm(f => ({ ...f, reward_value: Number(e.target.value) }))} min={0} step={0.01} />
            </div>
            <div>
              <Label>Texto do Banner Global</Label>
              <Input value={form.banner_text || ""} onChange={(e) => setForm(f => ({ ...f, banner_text: e.target.value }))} placeholder="Deixe vazio para não exibir banner" />
              <p className="text-[11px] text-muted-foreground mt-1">Se vazio, nenhum banner será exibido.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início</Label>
                <Input type="datetime-local" value={form.start_date || ""} onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value || null }))} />
              </div>
              <div>
                <Label>Fim</Label>
                <Input type="datetime-local" value={form.end_date || ""} onChange={(e) => setForm(f => ({ ...f, end_date: e.target.value || null }))} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Ativar promoção</Label>
            </div>

            {/* WhatsApp Section */}
            <div className="border-t border-border/30 pt-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-semibold text-foreground">Notificação WhatsApp</span>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.notify_whatsapp} onCheckedChange={(v) => setForm(f => ({ ...f, notify_whatsapp: v }))} />
                <Label>Notificar via WhatsApp ao ativar</Label>
              </div>
              {form.notify_whatsapp && (
                <div>
                  <Label>Audiência</Label>
                  <Select value={form.whatsapp_audience} onValueChange={(v) => setForm(f => ({ ...f, whatsapp_audience: v as "all" | "free_only" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Usuários</SelectItem>
                      <SelectItem value="free_only">Apenas Usuários Gratuitos</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Apenas usuários com opt-in ativo receberão a mensagem (LGPD).
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.title.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir promoção?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => { if (deleteTarget) { deleteMut.mutate(deleteTarget); setDeleteTarget(null); } }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
