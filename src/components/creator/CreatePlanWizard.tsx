/**
 * Wizard de Criação de Plano de Assinatura VIP — 4 etapas
 * Banco de Imagens (20) | Banco de Vídeos Curtos (5) | Vídeo Longo | Conteúdos Mistos
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Image as ImageIcon, Video, Film, Layers, Plus, X, Loader2, ChevronLeft, ChevronRight,
  Crown, CreditCard, QrCode, UserPlus, Lock,
} from "lucide-react";
import { useBetaGuard } from "@/hooks/useBetaGuard";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  smartImageUpload,
  smartVideoUpload,
  validateVideoDuration,
} from "@/lib/smartUpload";
import { cn } from "@/lib/utils";
import { insertCreatorPlan, updateCreatorPlan } from "@/lib/creatorPlanPersistence";

type PlanType = "image_bank" | "short_video_bank" | "long_video" | "mixed_content";

interface MediaItem {
  url: string;
  media_type: "image" | "video";
  duration_seconds?: number;
}

interface EditPlanData {
  id: string;
  title: string;
  bio: string | null;
  plan_type?: PlanType | null;
  monthly_price: number;
  annual_price: number | null;
  accepts_pix?: boolean | null;
  accepts_card?: boolean | null;
  affiliate_user_id?: string | null;
  media?: MediaItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  onCreated?: () => void;
  editPlan?: EditPlanData | null;
}

const TYPE_OPTIONS: Array<{
  value: PlanType;
  icon: typeof ImageIcon;
  title: string;
  desc: string;
  limit: string;
}> = [
  { value: "image_bank", icon: ImageIcon, title: "Banco de Imagens", desc: "Galeria fotográfica VIP", limit: "Até 20 fotos" },
  { value: "short_video_bank", icon: Video, title: "Banco de Vídeos Curtos", desc: "Vídeos de até 5 min cada", limit: "Até 5 vídeos" },
  { value: "long_video", icon: Film, title: "Vídeo Longo", desc: "Um único vídeo de longa duração", limit: "1 vídeo" },
  { value: "mixed_content", icon: Layers, title: "Canal de Mídia Exclusivo", desc: "Acesso contínuo ao canal VIP enquanto a assinatura estiver ativa", limit: "Ilimitado durante a vigência" },
];

const MAX_BY_TYPE: Record<PlanType, number> = {
  image_bank: 20,
  short_video_bank: 5,
  long_video: 1,
  mixed_content: 0,
};

export function CreatePlanWizard({ open, onOpenChange, profileId, onCreated, editPlan }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEditing = !!editPlan?.id;
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { isLocked: subsBetaLocked, lockedLabel: subsBetaLockedLabel } = useBetaGuard('subscriptions');

  // Step 1
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");

  // Step 2
  const [planType, setPlanType] = useState<PlanType>("mixed_content");

  // Step 3
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // Step 4
  const [monthlyPrice, setMonthlyPrice] = useState<string>("29.90");
  const [annualEnabled, setAnnualEnabled] = useState(false);
  const [annualPrice, setAnnualPrice] = useState<string>("299.00");
  const [annualDiscount, setAnnualDiscount] = useState<string>("16.67");
  const [acceptsPix, setAcceptsPix] = useState(true);
  const [acceptsCard, setAcceptsCard] = useState(true);
  const [affiliateUsername, setAffiliateUsername] = useState("");
  const [affiliateUserId, setAffiliateUserId] = useState<string | null>(null);
  const [checkingAffiliate, setCheckingAffiliate] = useState(false);

  const reset = () => {
    setStep(1); setTitle(""); setBio(""); setPlanType("mixed_content");
    setMedia([]); setMonthlyPrice("29.90"); setAnnualEnabled(false); setAnnualPrice("299.00");
    setAnnualDiscount("16.67");
    setAcceptsPix(true); setAcceptsCard(true); setAffiliateUsername(""); setAffiliateUserId(null);
  };

  const annualBaseTotal = useMemo(() => Math.max(0, Number(monthlyPrice || 0) * 12), [monthlyPrice]);
  const annualDiscountValue = useMemo(() => {
    const value = Number(annualDiscount || 0);
    return Math.min(99, Math.max(0, Number.isFinite(value) ? value : 0));
  }, [annualDiscount]);
  const annualPerMonth = useMemo(() => {
    const total = Number(annualPrice || 0);
    return total > 0 ? total / 12 : 0;
  }, [annualPrice]);

  // Pré-preencher ao abrir em modo edição
  useEffect(() => {
    if (!open) return;
    if (editPlan) {
      setStep(1);
      setTitle(editPlan.title || "");
      setBio(editPlan.bio || "");
      setPlanType((editPlan.plan_type as PlanType) || "mixed_content");
      setMedia(editPlan.media || []);
      setMonthlyPrice(String(editPlan.monthly_price ?? "29.90"));
      setAnnualEnabled(!!editPlan.annual_price);
      setAnnualPrice(String(editPlan.annual_price ?? "299.00"));
      const baseAnnual = Number(editPlan.monthly_price ?? 0) * 12;
      const existingAnnual = Number(editPlan.annual_price ?? 0);
      const derivedDiscount = baseAnnual > 0 && existingAnnual > 0
        ? Math.max(0, Math.min(99, Number((((baseAnnual - existingAnnual) / baseAnnual) * 100).toFixed(2))))
        : 16.67;
      setAnnualDiscount(String(derivedDiscount));
      setAcceptsPix(editPlan.accepts_pix ?? true);
      setAcceptsCard(editPlan.accepts_card ?? true);
      setAffiliateUserId(editPlan.affiliate_user_id || null);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editPlan?.id]);

  useEffect(() => {
    if (!annualEnabled) return;
    const discounted = annualBaseTotal * (1 - annualDiscountValue / 100);
    setAnnualPrice(discounted > 0 ? discounted.toFixed(2) : "0.00");
  }, [annualBaseTotal, annualDiscountValue, annualEnabled]);

  const close = () => {
    onOpenChange(false);
    setTimeout(reset, 200);
  };

  // ── Upload mídia ───────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || !user?.id) return;
    const max = MAX_BY_TYPE[planType];
    if (media.length >= max) { toast.error(`Limite atingido (${max})`); return; }

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (media.length >= max) break;

        if (planType === "image_bank") {
          if (!file.type.startsWith("image/")) { toast.error("Apenas imagens"); continue; }
          const r = await smartImageUpload(file, user.id, "plans", "plan-media");
          setMedia(prev => [...prev, { url: r.publicUrl, media_type: "image" }]);
        } else if (planType === "short_video_bank") {
          if (!file.type.startsWith("video/")) { toast.error("Apenas vídeos"); continue; }
          const v = await validateVideoDuration(file, 300);
          if (!v.valid) { toast.error(v.error || "Vídeo inválido"); continue; }
          const r = await smartVideoUpload(file, user.id, "plans", "plan-media");
          setMedia(prev => [...prev, { url: r.publicUrl, media_type: "video", duration_seconds: Math.round(v.duration) }]);
        } else if (planType === "long_video") {
          if (!file.type.startsWith("video/")) { toast.error("Apenas vídeos"); continue; }
          const v = await validateVideoDuration(file, Infinity);
          const r = await smartVideoUpload(file, user.id, "plans", "plan-media");
          setMedia([{ url: r.publicUrl, media_type: "video", duration_seconds: Math.round(v.duration) }]);
        }
      }
      toast.success("Mídia(s) adicionada(s)");
    } catch (e: any) {
      toast.error("Erro no upload", { description: e?.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeMedia = (i: number) => setMedia(prev => prev.filter((_, idx) => idx !== i));

  // ── Lookup afiliado ────────────────────────────────────
  const checkAffiliate = async () => {
    const u = affiliateUsername.trim().replace("@", "");
    if (!u) { setAffiliateUserId(null); return; }
    setCheckingAffiliate(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, username")
        .eq("username", u)
        .maybeSingle();
      if (data) {
        setAffiliateUserId((data as any).user_id);
        toast.success(`Afiliado: @${(data as any).username}`);
      } else {
        setAffiliateUserId(null);
        toast.error("Usuário não encontrado");
      }
    } finally { setCheckingAffiliate(false); }
  };

  // ── Salvar ─────────────────────────────────────────────
  const canAdvance = (): boolean => {
    if (step === 1) return title.trim().length >= 3;
    if (step === 2) return !!planType;
    if (step === 3) {
      if (planType === "mixed_content") return true;
      return media.length > 0;
    }
    if (step === 4) return Number(monthlyPrice) > 0 && (acceptsPix || acceptsCard);
    return false;
  };

  const submit = async () => {
    if (!user || !profileId) return;
    setSaving(true);
    try {
      const payload: any = {
        profile_id: profileId,
        title: title.trim(),
        bio: bio.trim() || null,
        monthly_price: Number(monthlyPrice),
        annual_price: annualEnabled ? Number(annualPrice) : null,
        is_enabled: true,
        plan_type: planType,
        accepts_pix: acceptsPix,
        accepts_card: acceptsCard,
        affiliate_user_id: affiliateUserId,
      };

      let planId: string;

      if (isEditing && editPlan) {
        await updateCreatorPlan(editPlan.id, payload);
        planId = editPlan.id;

        // Substituir mídias
        if (planType !== "mixed_content") {
          await (supabase as any).from("subscription_plan_media").delete().eq("plan_id", planId);
        }
      } else {
        payload.sort_order = 0;
        const created = await insertCreatorPlan(payload);
        planId = created.id;
      }

      // Insert media (não para mixed_content)
      if (planType !== "mixed_content" && media.length > 0) {
        const rows = media.map((m, i) => ({
          plan_id: planId,
          media_url: m.url,
          media_type: m.media_type,
          duration_seconds: m.duration_seconds ?? null,
          sort_order: i,
        }));
        const { error: mErr } = await (supabase as any)
          .from("subscription_plan_media")
          .insert(rows);
        if (mErr) throw mErr;
      }

      toast.success(isEditing ? "✅ Plano atualizado!" : "✅ Plano criado!", {
        description: `"${title}" ${isEditing ? "salvo com sucesso." : "disponível para assinaturas."}`,
      });
      // Invalidação global — garante que a vitrine, o canal VIP e o painel atualizem em tempo real
      queryClient.invalidateQueries({ queryKey: ["vitrine-plans"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      queryClient.invalidateQueries({ queryKey: ["creator-plans"] });
      queryClient.invalidateQueries({ queryKey: ["my-vip-plan"] });
      onCreated?.();
      close();
    } catch (e: any) {
      console.error("[CreatePlanWizard] erro:", e);
      toast.error(isEditing ? "Erro ao atualizar plano" : "Erro ao criar plano", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const acceptAttr =
    planType === "image_bank" ? "image/*" :
    planType === "short_video_bank" || planType === "long_video" ? "video/*" : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-400" />
            {isEditing ? "Editar Plano" : "Criar Plano de Assinatura"}
            <Badge variant="outline" className="ml-auto text-xs">Etapa {step} de 4</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Stepper visual */}
        <div className="flex gap-1 mb-2">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={cn("h-1 flex-1 rounded-full", n <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>

        {/* ─── Etapa 1: Identidade ─── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Título do Plano *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Acervo Premium" maxLength={60} />
            </div>
            <div className="space-y-1">
              <Label>Descrição curta</Label>
              <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="O que o assinante vai receber..." maxLength={280} rows={3} />
              <p className="text-xs text-muted-foreground text-right">{bio.length}/280</p>
            </div>
          </div>
        )}

        {/* ─── Etapa 2: Tipo ─── */}
        {step === 2 && (
          <div className="space-y-2">
            <Label className="text-sm">Tipo de Conteúdo *</Label>
            {TYPE_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const selected = planType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPlanType(opt.value)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors flex gap-3",
                    selected ? "border-primary bg-primary/10" : "border-border hover:border-border/80"
                  )}
                >
                  <div className={cn("p-2 rounded-md", selected ? "bg-primary/20" : "bg-muted")}>
                    <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{opt.title}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    <Badge variant="outline" className="mt-1 text-[10px]">{opt.limit}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Etapa 3: Mídias ─── */}
        {step === 3 && (
          <div className="space-y-3">
            {planType === "mixed_content" ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center space-y-2">
                <Layers className="h-8 w-8 text-primary mx-auto" />
                  <p className="text-sm font-medium">Canal de Mídia Exclusivo</p>
                <p className="text-xs text-muted-foreground">
                    O assinante terá acesso a tudo que você publicar neste canal VIP enquanto a assinatura estiver ativa.
                  Ao expirar, o conteúdo é bloqueado e a renovação é solicitada.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Mídias do Plano</Label>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      media.length === 0 && "border-yellow-500/40 text-yellow-500",
                      media.length > 0 && media.length < MAX_BY_TYPE[planType] && "border-primary/40 text-primary",
                      media.length >= MAX_BY_TYPE[planType] && "border-green-500/40 text-green-500"
                    )}
                  >
                    {media.length}/{MAX_BY_TYPE[planType]}
                    {media.length >= MAX_BY_TYPE[planType] && " · Limite"}
                  </Badge>
                </div>
                {media.length === 0 && (
                  <p className="text-xs text-yellow-500/90 -mt-1">
                    Adicione pelo menos 1 {planType === "image_bank" ? "imagem" : "vídeo"} para avançar.
                  </p>
                )}

                {media.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {media.map((m, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                        {m.media_type === "image" ? (
                          <img decoding="async" src={m.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <video src={m.url} className="w-full h-full object-cover" preload="metadata" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeMedia(i)}
                          className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {m.duration_seconds && (
                          <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1 rounded">
                            {Math.floor(m.duration_seconds / 60)}:{String(m.duration_seconds % 60).padStart(2, "0")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {media.length < MAX_BY_TYPE[planType] && (
                  <>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={acceptAttr}
                      multiple={planType !== "long_video"}
                      onChange={e => handleFiles(e.target.files)}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full"
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      {uploading ? "Enviando..." : `Adicionar ${planType === "image_bank" ? "imagens" : "vídeos"}`}
                    </Button>
                    {planType === "short_video_bank" && (
                      <p className="text-xs text-muted-foreground text-center">Máx 5 minutos por vídeo</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ─── Etapa 4: Preço & Pagamento ─── */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <Label className="text-sm flex items-center gap-2 mb-2">
                <Crown className="h-3.5 w-3.5 text-yellow-400" /> Preço da Assinatura
              </Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Mensal (obrigatório) *</Label>
                  <Input type="number" step="0.01" min="1" value={monthlyPrice} onChange={e => setMonthlyPrice(e.target.value)} placeholder="R$ 29,90" />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="ann" checked={annualEnabled} onCheckedChange={v => setAnnualEnabled(!!v)} />
                  <label htmlFor="ann" className="text-xs cursor-pointer">Oferecer plano anual com desconto</label>
                </div>
                {annualEnabled && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground">% de desconto sobre o anual</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="99"
                            value={annualDiscount}
                            onChange={e => setAnnualDiscount(e.target.value)}
                            placeholder="Ex: 16.67"
                            className="pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <Label className="text-[11px] text-muted-foreground">Total anual (auto)</Label>
                        <Input type="number" step="0.01" min="1" value={annualPrice} onChange={e => setAnnualPrice(e.target.value)} placeholder="R$ 299,00" />
                      </div>
                    </div>

                    {/* Preview em tempo real */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-yellow-500/20 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sem desconto</p>
                        <p className="text-xs font-medium line-through text-muted-foreground">
                          R$ {annualBaseTotal.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total anual</p>
                        <p className="text-sm font-bold text-yellow-400">
                          R$ {Number(annualPrice || 0).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Equivale a</p>
                        <p className="text-sm font-bold text-green-400">
                          R$ {annualPerMonth.toFixed(2)}<span className="text-[10px] text-muted-foreground">/mês</span>
                        </p>
                      </div>
                    </div>
                    {annualDiscountValue > 0 && annualBaseTotal > 0 && (
                      <p className="text-[11px] text-center text-green-500">
                        Economia de R$ {(annualBaseTotal - Number(annualPrice || 0)).toFixed(2)} ({annualDiscountValue.toFixed(2)}% off)
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm mb-2 block">Formas de Pagamento Aceitas *</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30">
                  <Checkbox checked={acceptsPix} onCheckedChange={v => setAcceptsPix(!!v)} />
                  <QrCode className="h-4 w-4 text-green-500" />
                  <span className="text-sm">PIX</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer hover:bg-muted/30">
                  <Checkbox checked={acceptsCard} onCheckedChange={v => setAcceptsCard(!!v)} />
                  <CreditCard className="h-4 w-4 text-blue-500" />
                  <span className="text-sm">Cartão de Crédito</span>
                </label>
              </div>
            </div>

            <div>
              <Label className="text-sm flex items-center gap-2 mb-1">
                <UserPlus className="h-3.5 w-3.5" /> Indicador / Afiliado <span className="text-xs text-muted-foreground">(opcional)</span>
              </Label>
              <div className="flex gap-2">
                <Input value={affiliateUsername} onChange={e => { setAffiliateUsername(e.target.value); setAffiliateUserId(null); }} placeholder="@username" />
                <Button type="button" variant="outline" size="sm" onClick={checkAffiliate} disabled={checkingAffiliate || !affiliateUsername.trim()}>
                  {checkingAffiliate ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
                </Button>
              </div>
              {affiliateUserId && <p className="text-xs text-green-500 mt-1">✓ Afiliado vinculado — receberá 5% de comissão</p>}
            </div>
          </div>
        )}

        {subsBetaLocked && step === 4 && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-200">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">{subsBetaLockedLabel}</div>
              <div className="text-amber-200/80">
                Você pode <strong>criar e editar</strong> seus planos VIP normalmente — eles ficam disponíveis para assinatura assim que a monetização for ligada no lançamento oficial.
              </div>
            </div>
          </div>
        )}
        {/* ─── Footer ─── */}
        <div className="flex gap-2 pt-3 border-t">
          {step > 1 && (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          {step < 4 ? (
            <Button type="button" onClick={() => setStep(step + 1)} disabled={!canAdvance()} className="ml-auto">
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={!canAdvance() || saving} className="ml-auto bg-gradient-to-r from-pink-500 to-purple-600">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Crown className="h-4 w-4 mr-2" />}
              {isEditing ? "Salvar Alterações" : "Criar Plano"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
