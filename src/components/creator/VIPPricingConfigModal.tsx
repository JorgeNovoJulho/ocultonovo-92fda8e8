import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Crown, CreditCard, Image, Video, MessageSquare, Sparkles, Gavel,
  Info, Save, Loader2, TrendingUp, Infinity as InfinityIcon, Plus, Trash2, Edit2,
  ChevronDown, ChevronUp, Upload, X, Check, FileText, Type,
  Key, Webhook, Wallet, Zap, HelpCircle, ExternalLink, CheckCircle2, AlertCircle, AlertTriangle,
  QrCode, Lock, Package, Search, Link2, ShieldCheck, Activity,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import type { CreatorPlan } from "@/hooks/useSubscriptionPlans";
import { useSplitConfig } from "@/hooks/useSplitConfig";
import { CreatePlanWizard } from "./CreatePlanWizard";
import { PlanSubscribeModal } from "@/components/PlanSubscribeModal";
import {
  insertCreatorPlan,
  updateCreatorPlan,
  fetchCreatorPlans,
  getAnnualDiscountPercent,
} from "@/lib/creatorPlanPersistence";
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';

// ── Constants (fallback caso ainda não tenha vindo do admin) ─────────────
const DEFAULT_PLATFORM_FEE = 0.20;
const DEFAULT_TAX_RESERVE = 0.06;
const DEFAULT_AFFILIATE_FEE = 0.05;
const MAX_PLANS = 5;

// ── Types ─────────────────────────────────────────────────────────────────
interface GlobalConfig {
  price_per_photo: number;
  price_per_video: number;
  price_per_message: number;
  super_dm_enabled: boolean;
  super_dm_min_price: number;
  auction_starting_price: number;
  auction_min_increment: number;
}

interface CreatorProfile {
  id: string;
  avatar_url: string | null;
  name: string | null;
  username: string | null;
}

interface VipPost {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  privacy_level: string;
  created_at: string;
}

type PlanDraft = Omit<CreatorPlan, "created_at" | "updated_at">;

const defaultGlobal: GlobalConfig = {
  price_per_photo: 9.90,
  price_per_video: 19.90,
  price_per_message: 4.90,
  super_dm_enabled: true,
  super_dm_min_price: 9.90,
  auction_starting_price: 19.90,
  auction_min_increment: 5.00,
};

// ── Small helpers ─────────────────────────────────────────────────────────
// Hook leve: retorna percentuais (0-1) vindos do admin master, com fallback seguro.
function useSplitPercents() {
  const { data } = useSplitConfig();
  const platform = (data?.platform_percent ?? DEFAULT_PLATFORM_FEE * 100) / 100;
  const tax = (data?.tax_percent ?? DEFAULT_TAX_RESERVE * 100) / 100;
  const affiliate = (data?.affiliate_percent ?? DEFAULT_AFFILIATE_FEE * 100) / 100;
  // Criador líquido = 100% - plataforma - impostos - afiliados
  // (afiliados são descontados do bruto antes de chegar ao criador, conforme regra)
  const net = Math.max(0, 1 - platform - tax - affiliate);
  return { platform, tax, affiliate, net };
}

function NetBadge({ gross }: { gross: number }) {
  const { net } = useSplitPercents();
  return (
    <span className="text-xs text-green-400 font-medium whitespace-nowrap">
      → líq. R$ {(gross * net).toFixed(2)}
    </span>
  );
}

// Tag reutilizável que reflete a configuração dinâmica do admin master
function FeeInfoTag({ variant = "blue" }: { variant?: "blue" | "green" }) {
  const { platform, tax, affiliate, net } = useSplitPercents();
  const fmt = (v: number) => `${(v * 100).toFixed(0)}%`;
  const isGreen = variant === "green";
  return (
    <div className={cn(
      "flex items-start gap-2.5 p-3 rounded-xl border",
      isGreen ? "bg-green-500/10 border-green-500/20" : "bg-blue-500/10 border-blue-500/20"
    )}>
      <Info className={cn("h-4 w-4 mt-0.5 shrink-0", isGreen ? "text-green-400" : "text-blue-400")} />
      <p className={cn("text-xs", isGreen ? "text-green-300" : "text-blue-300")}>
        Taxa plataforma: <strong>{fmt(platform)}</strong> · Impostos: <strong>{fmt(tax)}</strong>
        {affiliate > 0 && <> · Afiliados/Indicadores: <strong>{fmt(affiliate)}</strong></>}
        {" "}· Você recebe: <strong className="text-green-400">{fmt(net)} líquido</strong>
      </p>
    </div>
  );
}

function freeInput(
  value: number,
  onChange: (v: number) => void,
  onBlur?: () => void,
  min = 0,
  className = ""
) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        className={cn("pl-9 h-9 text-sm", className)}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
            const num = parseFloat(raw);
            onChange(isNaN(num) ? min : num);
          }
        }}
        onBlur={() => {
          if (value < min) onChange(min);
          onBlur?.();
        }}
      />
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <h3 className="font-semibold flex items-center gap-2 text-sm text-foreground/90">
      <Icon className="h-4 w-4 text-primary" />
      {children}
    </h3>
  );
}

function TutorialFieldHighlight({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-foreground">
        <div className="h-7 w-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold">{label}</p>
          <p className="text-[11px] text-muted-foreground">{note}</p>
        </div>
      </div>
      <div className="rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-[10px] text-primary break-all">
        {value}
      </div>
    </div>
  );
}

// ── Content Selector for a Plan ───────────────────────────────────────────
function PlanContentSelector({
  planId,
  vipPosts,
  selectedPostIds,
  onSelectionChange,
}: {
  planId: string;
  vipPosts: VipPost[];
  selectedPostIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = vipPosts.filter(p => {
    if (!search.trim()) return true;
    return (p.content || "").toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (postId: string) => {
    if (selectedPostIds.includes(postId)) {
      onSelectionChange(selectedPostIds.filter(id => id !== postId));
    } else {
      onSelectionChange([...selectedPostIds, postId]);
    }
  };

  const selectAll = () => onSelectionChange(filtered.map(p => p.id));
  const clearAll = () => onSelectionChange([]);

  return (
    <div className="space-y-3 border border-primary/20 rounded-xl p-3 bg-muted/10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-xs flex items-center gap-1.5 font-semibold">
          <Package className="h-3.5 w-3.5 text-primary" />
          Conteúdos do plano
          {selectedPostIds.length > 0 && (
            <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-primary/30">
              {selectedPostIds.length} selecionado{selectedPostIds.length > 1 ? "s" : ""}
            </Badge>
          )}
        </Label>
        <div className="flex gap-1.5">
          <button onClick={selectAll} className="text-[10px] text-primary hover:underline">Todos</button>
          <span className="text-muted-foreground text-[10px]">·</span>
          <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:underline">Limpar</button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar conteúdo..."
          className="pl-8 h-8 text-xs"
        />
      </div>

      {vipPosts.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <Lock className="h-6 w-6 mx-auto mb-1 opacity-40" />
          <p className="text-xs">Nenhum conteúdo VIP encontrado no seu perfil.</p>
          <p className="text-[10px] mt-0.5">Crie posts com visibilidade VIP para adicioná-los aqui.</p>
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5" style={{ scrollbarWidth: "thin" }}>
          {filtered.map(post => {
            const isSelected = selectedPostIds.includes(post.id);
            const preview = post.content
              ? post.content.slice(0, 60) + (post.content.length > 60 ? "…" : "")
              : post.media_type === "video" ? "🎬 Vídeo VIP" : "📸 Foto VIP";

            return (
              <button
                key={post.id}
                onClick={() => toggle(post.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-all",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border/40 bg-muted/10 hover:border-border hover:bg-muted/20"
                )}
              >
                {/* Thumbnail */}
                <div className={cn(
                  "h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 text-lg",
                  post.media_type === "video" ? "bg-purple-500/20" : "bg-blue-500/20"
                )}>
                  {post.media_url ? (
                    <img loading="lazy" decoding="async" src={post.media_url} alt="" className="h-full w-full object-cover rounded-md" />
                  ) : post.media_type === "video" ? (
                    <Video className="h-4 w-4 text-purple-400" />
                  ) : (
                    <Image className="h-4 w-4 text-blue-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{preview}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(post.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    <span className="text-yellow-400">VIP</span>
                  </p>
                </div>

                <div className={cn(
                  "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  isSelected ? "bg-primary border-primary" : "border-border/60"
                )}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Conteúdos de outros planos ficam isolados. Ao pagar este plano, apenas estes itens serão liberados.
      </p>
    </div>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  profile,
  isEditing,
  onEdit,
  onDelete,
  isSaving,
  contentCount,
  onToggleStatus,
  onTestSubscribe,
}: {
  plan: PlanDraft;
  profile: CreatorProfile | null;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isSaving: boolean;
  contentCount: number;
  onToggleStatus: () => void;
  onTestSubscribe: () => void;
}) {
  const bannerStyle = plan.banner_url
    ? { backgroundImage: `url(${plan.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(135deg, hsl(var(--primary)/0.4), hsl(var(--secondary)/0.4))" };

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all",
      isEditing ? "border-primary" : "border-border/50"
    )}>
      {/* Banner */}
      <div className="h-20 relative flex items-end p-2.5" style={bannerStyle}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <Avatar className="h-10 w-10 border-2 border-white/80 shadow-lg relative z-10">
          <AvatarImage src={profile?.avatar_url ?? undefined} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
            {(profile?.name || profile?.username || "?")[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="ml-2 relative z-10 flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight truncate drop-shadow">{plan.title}</p>
          {plan.monthly_price > 0 && (
            <p className="text-white/80 text-xs drop-shadow">R$ {plan.monthly_price.toFixed(2)}/mês</p>
          )}
        </div>
        {contentCount > 0 && (
          <div className="relative z-10 mr-1">
            <Badge className="text-[10px] px-1.5 py-0 bg-yellow-500/30 text-yellow-300 border-yellow-500/30">
              {contentCount} conteúdo{contentCount > 1 ? "s" : ""}
            </Badge>
          </div>
        )}
        <div className="relative z-10 flex gap-1 ml-1">
          <button
            onClick={onEdit}
            className="h-7 w-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center backdrop-blur-sm transition-colors"
          >
            {isEditing ? <ChevronUp className="h-3.5 w-3.5 text-white" /> : <Edit2 className="h-3.5 w-3.5 text-white" />}
          </button>
          <button
            onClick={onDelete}
            disabled={isSaving}
            className="h-7 w-7 rounded-lg bg-red-500/30 hover:bg-red-500/50 flex items-center justify-center backdrop-blur-sm transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 text-white" />
          </button>
        </div>
      </div>
      {/* Prices + meta row */}
      {!isEditing && (
        <div className="px-3 py-2 bg-card/80 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>Mensal <strong className="text-foreground">R$ {plan.monthly_price.toFixed(2)}</strong></span>
            {plan.annual_price && (
              <span>
                Anual <strong className="text-foreground">R$ {plan.annual_price.toFixed(2)}</strong>
                {getAnnualDiscountPercent(plan.monthly_price, plan.annual_price) > 0 && (
                  <Badge variant="outline" className="ml-1 h-5 px-1.5 text-[10px] border-green-500/40 text-green-500 bg-green-500/10">
                    -{getAnnualDiscountPercent(plan.monthly_price, plan.annual_price)}%
                  </Badge>
                )}
              </span>
            )}
            {(plan as any).plan_type && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {({
                  image_bank: "Banco de Imagens",
                  short_video_bank: "Vídeos Curtos",
                  long_video: "Vídeo Longo",
                  mixed_content: "Conteúdos Mistos",
                } as Record<string, string>)[(plan as any).plan_type] || (plan as any).plan_type}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] h-5 px-1.5 ml-auto",
                plan.is_enabled
                  ? "border-green-500/40 text-green-500 bg-green-500/10"
                  : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {plan.is_enabled ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-border/30">
            <div className="flex items-center gap-2 text-xs">
              <Switch
                checked={!!plan.is_enabled}
                onCheckedChange={onToggleStatus}
                disabled={isSaving}
              />
              <span className="text-muted-foreground">{plan.is_enabled ? "Ativo" : "Inativo"}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs gap-1"
              onClick={onTestSubscribe}
            >
              <Sparkles className="h-3 w-3" /> Assinar agora
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan Editor ───────────────────────────────────────────────────────────
function PlanEditor({
  plan,
  profile,
  onChange,
  onBannerUpload,
  uploadingBanner,
  vipPosts,
  selectedPostIds,
  onContentChange,
}: {
  plan: PlanDraft;
  profile: CreatorProfile | null;
  onChange: (partial: Partial<PlanDraft>) => void;
  onBannerUpload: (file: File) => void;
  uploadingBanner: boolean;
  vipPosts: VipPost[];
  selectedPostIds: string[];
  onContentChange: (ids: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const annualMonthly = plan.annual_price ? plan.annual_price / 12 : null;
  const annualDiscount = plan.annual_price && plan.monthly_price > 0
    ? Math.round((1 - (plan.annual_price / 12) / plan.monthly_price) * 100)
    : 0;

  return (
    <div className="border border-primary/30 rounded-xl bg-muted/10 p-3 space-y-4">

      {/* Banner upload */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <Upload className="h-3 w-3 text-primary" /> Banner do plano
        </Label>
        <div
          className="relative h-24 rounded-lg overflow-hidden border border-dashed border-border cursor-pointer group"
          style={plan.banner_url
            ? { backgroundImage: `url(${plan.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: "linear-gradient(135deg, hsl(var(--primary)/0.2), hsl(var(--secondary)/0.2))" }}
          onClick={() => fileRef.current?.click()}
        >
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {uploadingBanner ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <>
                <Upload className="h-5 w-5 text-white" />
                <span className="text-xs text-white font-medium">Trocar banner</span>
              </>
            )}
          </div>
          {!plan.banner_url && !uploadingBanner && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <Upload className="h-5 w-5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Clique para adicionar banner</span>
            </div>
          )}
          <div className="absolute bottom-2 left-2">
            <Avatar className="h-8 w-8 border-2 border-white/80 shadow">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">{(profile?.name || "?")[0]}</AvatarFallback>
            </Avatar>
          </div>
          {plan.banner_url && (
            <button
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded bg-black/50 flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); onChange({ banner_url: null }); }}
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onBannerUpload(file);
          e.target.value = "";
        }} />
      </div>

      {/* Title */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <Type className="h-3 w-3 text-primary" /> Título do plano
        </Label>
        <Input
          placeholder="Ex: Plano Bronze 🥉"
          value={plan.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-9 text-sm"
          maxLength={60}
        />
      </div>

      {/* Bio */}
      <div className="space-y-1.5">
        <Label className="text-xs flex items-center gap-1.5">
          <FileText className="h-3 w-3 text-primary" /> Descrição
        </Label>
        <Textarea
          placeholder="O que os assinantes recebem neste plano?"
          value={plan.bio ?? ""}
          onChange={(e) => onChange({ bio: e.target.value })}
          className="text-sm resize-none"
          rows={2}
          maxLength={200}
        />
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Plano ativo</Label>
        <Switch checked={plan.is_enabled} onCheckedChange={(v) => onChange({ is_enabled: v })} />
      </div>

      {/* Prices */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preços</p>

        {/* Monthly */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <CreditCard className="h-3 w-3 text-primary" /> Mensal *
            </Label>
            <NetBadge gross={plan.monthly_price} />
          </div>
          {freeInput(plan.monthly_price, (v) => onChange({ monthly_price: v }), undefined, 0)}
        </div>

        {/* Annual */}
        <div className="space-y-1">
          <div className="flex items-center justify-between flex-wrap gap-1">
            <Label className="text-xs flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-green-400" /> Anual
              {annualDiscount > 0 && (
                <Badge className="text-xs bg-green-500/20 text-green-400 border-green-500/30 px-1 py-0">{annualDiscount}% off</Badge>
              )}
            </Label>
            {plan.annual_price ? <NetBadge gross={plan.annual_price} /> : <span className="text-xs text-muted-foreground">opcional</span>}
          </div>
          {freeInput(plan.annual_price ?? 0, (v) => onChange({ annual_price: v || null }), undefined, 0)}
          {annualMonthly && <p className="text-xs text-muted-foreground">≈ R$ {annualMonthly.toFixed(2)}/mês</p>}
        </div>

        {/* Lifetime */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <InfinityIcon className="h-3 w-3 text-yellow-400" /> Vitalício
            </Label>
            {plan.lifetime_price ? <NetBadge gross={plan.lifetime_price} /> : <span className="text-xs text-muted-foreground">opcional</span>}
          </div>
          {freeInput(plan.lifetime_price ?? 0, (v) => onChange({ lifetime_price: v || null }), undefined, 0)}
        </div>
      </div>

      {/* Content selector */}
      <PlanContentSelector
        planId={plan.id}
        vipPosts={vipPosts}
        selectedPostIds={selectedPostIds}
        onSelectionChange={onContentChange}
      />
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editPlanId?: string | null;
  initialTab?: string;
}

export function VIPPricingConfigModal({ open, onOpenChange, editPlanId, initialTab }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState<string | null>(null);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(defaultGlobal);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showWalletAlert, setShowWalletAlert] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || "planos");

  // VIP posts for content selection
  const [vipPosts, setVipPosts] = useState<VipPost[]>([]);
  // Map: planId => selected post ids
  const [planContentMap, setPlanContentMap] = useState<Record<string, string[]>>({});

  // ASAAS técnico foi removido da UI do criador (gerenciado pela plataforma).
  // Mantemos apenas o wallet id em estado local para refletir status read-only.
  const [asaasWalletId, setAsaasWalletId] = useState("");
  const { net: netPercent } = useSplitPercents();
  const netLabel = `${(netPercent * 100).toFixed(0)}% líquido`;

  // PIX
  const [pixKeyType, setPixKeyType] = useState<string>("email");
  const [pixKey, setPixKey] = useState("");
  const [savingPix, setSavingPix] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardEditPlan, setWizardEditPlan] = useState<any | null>(null);

  // Filtros da listagem de planos
  const [planSearch, setPlanSearch] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState<string>("all");
  const [planStatusFilter, setPlanStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Mock subscribe (testar fluxo do "Assinar agora")
  const [testSubscribePlan, setTestSubscribePlan] = useState<any | null>(null);

  const openCreatePlanWizard = useCallback(() => {
    if (!profile?.id) {
      sonnerToast.error("Aguarde o perfil carregar...");
      return;
    }
    if (plans.length >= MAX_PLANS) {
      sonnerToast.error(`Limite de ${MAX_PLANS} planos`);
      return;
    }
    setWizardEditPlan(null);
    setShowWizard(true);
  }, [plans.length, profile?.id]);

  const togglePlanStatus = useCallback(async (planId: string) => {
    const target = plans.find((p) => p.id === planId);
    if (!target) return;
    const next = !target.is_enabled;
    // UI otimista
    setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, is_enabled: next } : p));
    if (planId.startsWith("new-")) return;
    const { error } = await (supabase as any)
      .from("subscription_plans")
      .update({ is_enabled: next })
      .eq("id", planId);
    if (error) {
      // rollback
      setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, is_enabled: !next } : p));
      sonnerToast.error("Erro ao atualizar status", { description: error.message });
    } else {
      sonnerToast.success(next ? "Plano ativado" : "Plano desativado");
    }
  }, [plans]);

  const openTestSubscribe = useCallback((plan: PlanDraft) => {
    if (!profile) return;
    setTestSubscribePlan({
      id: plan.id,
      profile_id: profile.id,
      title: plan.title,
      bio: plan.bio,
      banner_url: plan.banner_url,
      monthly_price: plan.monthly_price,
      annual_price: plan.annual_price,
      lifetime_price: (plan as any).lifetime_price ?? null,
      is_enabled: plan.is_enabled,
      sort_order: plan.sort_order,
      creator: {
        id: profile.id,
        name: profile.name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        is_verified: false,
      },
    });
  }, [profile]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!open || !user?.id) return;
    loadAll();
  }, [open, user?.id]);

  useEffect(() => {
    if (editPlanId && !loading) {
      setEditingId(editPlanId);
    }
  }, [editPlanId, loading]);

  const loadAll = async () => {
    setLoading(true);
    try {
      setProfile(null);
      setPixKey("");
      setPixKeyType("email");
      setAsaasWalletId("");

      let pf: any = null;
      const profileSelects = [
        "id, avatar_url, name, username, min_super_dm_price, accept_super_dm",
        "id, avatar_url, name, username, min_super_dm_price",
        "id, avatar_url, name, username, accept_super_dm",
        "id, avatar_url, name, username",
      ];

      let profileQueryError: any = null;

      for (const selectClause of profileSelects) {
        const profileResult = await supabase
          .from("profiles")
          .select(selectClause)
          .eq("user_id", user!.id)
          .maybeSingle();

        if (!profileResult.error) {
          pf = profileResult.data;
          profileQueryError = null;
          break;
        }

        profileQueryError = profileResult.error;
        if (!/column|schema cache|does not exist/i.test(profileResult.error.message || "")) {
          break;
        }
      }

      if (profileQueryError) throw profileQueryError;

      if (!pf) return;

      const safeProfile = {
        id: pf.id,
        avatar_url: pf.avatar_url ?? null,
        name: pf.name ?? null,
        username: pf.username ?? null,
      };

      setProfile(safeProfile);

      // Load creator plans (resilient: fallback automático description<->bio)
      let loadedPlans: any[] = [];
      try {
        loadedPlans = await fetchCreatorPlans(pf.id);
      } catch (e: any) {
        console.warn("[VIPPricingConfigModal] fetchCreatorPlans falhou:", e?.message);
      }
      setPlans(loadedPlans);

      // Load VIP posts for content selection
      const { data: postsData } = await (supabase as any)
        .from("posts")
        .select("id, content, media_url, media_type, privacy_level, created_at")
        .eq("creator_id", pf.id)
        .eq("privacy_level", "vip")
        .order("created_at", { ascending: false });
      setVipPosts(postsData || []);

      // Load existing plan content associations
      if (loadedPlans.length > 0) {
        const planIds = loadedPlans.map((p: any) => p.id);
        const { data: contentItems } = await (supabase as any)
          .from("plan_content_items")
          .select("plan_id, post_id")
          .in("plan_id", planIds);

        if (contentItems) {
          const map: Record<string, string[]> = {};
          for (const item of contentItems) {
            if (!map[item.plan_id]) map[item.plan_id] = [];
            map[item.plan_id].push(item.post_id);
          }
          setPlanContentMap(map);
        }
      }

      // Load global pricing config
      const { data: pcData } = await (supabase as any)
        .from("creator_pricing_config")
        .select("*")
        .eq("profile_id", pf.id)
        .maybeSingle();

      if (pcData) {
        setGlobalConfig({
          price_per_photo: pcData.price_per_photo ?? 9.90,
          price_per_video: pcData.price_per_video ?? 19.90,
          price_per_message: pcData.price_per_message ?? 4.90,
          super_dm_enabled: pcData.super_dm_enabled ?? true,
          super_dm_min_price: pcData.super_dm_min_price ?? 9.90,
          auction_starting_price: pcData.auction_starting_price ?? 19.90,
          auction_min_increment: pcData.auction_min_increment ?? 5.00,
        });
        setPixKeyType(pcData.pix_key_type ?? "email");
        setPixKey(pcData.pix_key ?? "");
        setAsaasWalletId(pcData.asaas_wallet_id ?? "");
      } else {
        setGlobalConfig({
          ...defaultGlobal,
          super_dm_enabled: pf.accept_super_dm ?? true,
          super_dm_min_price: pf.min_super_dm_price ?? 9.90,
        });
        setPixKeyType("email");
        setPixKey("");
      }
    } catch (e: any) {
      console.error("[VIPPricingConfigModal.loadAll] erro:", e);
      sonnerToast.error("Erro ao carregar configurações", {
        description: e?.message ?? "Tente novamente em instantes.",
      });
    } finally {
      setLoading(false);
    }
  };

  // handleTestAsaasConnection removido — gerenciado pela plataforma.

  const addPlan = () => {
    if (!profile || plans.length >= MAX_PLANS) return;
    const newPlan: PlanDraft = {
      id: `new-${Date.now()}`,
      profile_id: profile.id,
      title: `Plano ${plans.length + 1}`,
      bio: null,
      banner_url: null,
      monthly_price: 29.90,
      annual_price: null,
      lifetime_price: null,
      is_enabled: true,
      sort_order: plans.length,
    };
    setPlans((prev) => [...prev, newPlan]);
    setPlanContentMap(prev => ({ ...prev, [newPlan.id]: [] }));
    setEditingId(newPlan.id);
  };

  const updatePlan = (id: string, partial: Partial<PlanDraft>) => {
    setPlans((prev) => prev.map((p) => p.id === id ? { ...p, ...partial } : p));
  };

  const updatePlanContent = (planId: string, postIds: string[]) => {
    setPlanContentMap(prev => ({ ...prev, [planId]: postIds }));
  };

  const deletePlan = async (id: string) => {
    if (id.startsWith("new-")) {
      setPlans((prev) => prev.filter((p) => p.id !== id));
      if (editingId === id) setEditingId(null);
      return;
    }
    const { error } = await (supabase as any).from("subscription_plans").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    setPlans((prev) => prev.filter((p) => p.id !== id));
    setPlanContentMap(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (editingId === id) setEditingId(null);
  };

  const uploadBanner = async (planId: string, file: File) => {
    setUploadingBanner(planId);
    try {
      const img = document.createElement("img");
      const objectUrl = URL.createObjectURL(file);
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = objectUrl; });
      const canvas = document.createElement("canvas");
      const MAX = 1200;
      let w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(objectUrl);
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/webp", 0.75));

      const path = `${profile!.id}/${planId}-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from("plan-banners").upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (upErr) throw upErr;

      const publicUrl = `${EXTERNAL_SUPABASE_URL}/storage/v1/object/public/plan-banners/${path}`;
      updatePlan(planId, { banner_url: `${publicUrl}?t=${Date.now()}` });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setUploadingBanner(null);
    }
  };

  const savePlanContent = async (planId: string, postIds: string[]) => {
    // Delete all existing for this plan, then re-insert
    await (supabase as any).from("plan_content_items").delete().eq("plan_id", planId);
    if (postIds.length > 0) {
      const rows = postIds.map(postId => ({ plan_id: planId, post_id: postId }));
      const { error } = await (supabase as any).from("plan_content_items").insert(rows);
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    // Criador só precisa configurar PIX. Wallet ASAAS é gerenciado automaticamente
    // pela plataforma (subconta criada via edge function pelo backend).
    if (plans.length > 0 && !pixKey.trim()) {
      setShowWalletAlert(true);
      return;
    }

    setSaving(true);
    try {
      for (let i = 0; i < plans.length; i++) {
        const p = plans[i];
        const isNew = p.id.startsWith("new-");
        const planInput = {
          profile_id: profile.id,
          title: p.title,
          bio: p.bio ?? null,
          banner_url: p.banner_url ?? null,
          monthly_price: p.monthly_price,
          annual_price: p.annual_price ?? null,
          lifetime_price: (p as any).lifetime_price ?? null,
          is_enabled: p.is_enabled,
          sort_order: i,
          plan_type: (p as any).plan_type ?? "mixed_content",
          accepts_pix: (p as any).accepts_pix ?? true,
          accepts_card: (p as any).accepts_card ?? true,
          affiliate_user_id: (p as any).affiliate_user_id ?? null,
        };

        let realPlanId = p.id;
        if (isNew) {
          const inserted = await insertCreatorPlan(planInput);
          realPlanId = inserted.id;
          setPlans((prev) => prev.map((pl) => pl.id === p.id ? { ...pl, id: inserted.id } : pl));
          const postIds = planContentMap[p.id] || [];
          setPlanContentMap(prev => {
            const next = { ...prev, [inserted.id]: postIds };
            delete next[p.id];
            return next;
          });
          await savePlanContent(realPlanId, postIds);
        } else {
          await updateCreatorPlan(p.id, planInput);
          await savePlanContent(realPlanId, planContentMap[realPlanId] || []);
        }
      }

      // Save global config — campos asaas_* deprecated no UI do criador.
      // Wallet/API key/webhook são gerenciados pelo backend (subconta automática).
      await (supabase as any)
        .from("creator_pricing_config")
        .upsert({
          profile_id: profile.id,
          ...globalConfig,
        }, { onConflict: "profile_id" });

      const { error: profileSyncError } = await supabase.from("profiles").update({
        accept_super_dm: globalConfig.super_dm_enabled,
        min_super_dm_price: globalConfig.super_dm_min_price,
      }).eq("id", profile.id);
      if (profileSyncError) {
        console.warn("[VIP config] profile sync:", profileSyncError.message);
      }

      await queryClient.invalidateQueries({ queryKey: ["creator-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["creator-plans", profile.id] });

      toast({ title: "✅ Configurações salvas!", description: "Seus planos foram atualizados." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setGlobal = (key: keyof GlobalConfig, value: number | boolean) =>
    setGlobalConfig((prev) => ({ ...prev, [key]: value }));

  const handleSavePix = async () => {
    if (!user?.id) {
      sonnerToast.error("Você precisa estar logado.");
      return;
    }
    const trimmed = pixKey.trim();
    if (!trimmed) {
      sonnerToast.error("Informe sua chave PIX");
      return;
    }
    setSavingPix(true);
    try {
      if (!profile?.id) {
        throw new Error("Perfil do criador ainda não foi carregado.");
      }

      const { error } = await (supabase as any)
        .from("creator_pricing_config")
        .upsert({ profile_id: profile.id, pix_key_type: pixKeyType, pix_key: trimmed }, { onConflict: "profile_id" });
      if (error) throw error;

      const { error: profileMirrorError } = await supabase
        .from("profiles")
        .update({ pix_key_type: pixKeyType, pix_key: trimmed } as any)
        .eq("user_id", user.id);
      if (profileMirrorError && !/pix_key_type|pix_key|schema cache/i.test(profileMirrorError.message)) {
        console.warn("[PIX save] profile mirror:", profileMirrorError.message);
      }

      setPixKey(trimmed);
      setPixKeyType(pixKeyType);
      sonnerToast.success("✅ Chave PIX salva!", {
        description: `${pixKeyType.toUpperCase()}: ${trimmed}`,
      });
      toast({ title: "✅ Chave PIX salva!", description: "Dados gravados no banco com sucesso." });
    } catch (e: any) {
      console.error("[PIX save] erro:", e);
      sonnerToast.error("Erro ao salvar PIX", { description: e?.message ?? "Tente novamente." });
      toast({ title: "Erro ao salvar PIX", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSavingPix(false);
    }
  };

  // handleSaveAsaas removido — pagamentos gerenciados pela plataforma.

  const handleSavePPV = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const { error: upErr } = await (supabase as any)
        .from("creator_pricing_config")
        .upsert({
          profile_id: profile.id,
          ...globalConfig,
        }, { onConflict: "profile_id" });
      if (upErr) throw upErr;

      await supabase.from("profiles").update({
        accept_super_dm: globalConfig.super_dm_enabled,
        min_super_dm_price: globalConfig.super_dm_min_price,
      } as any).eq("id", profile.id);

      sonnerToast.success("✅ Preços PPV & DM salvos!", {
        description: "Configurações gravadas no banco com sucesso.",
      });
      toast({ title: "✅ Preços PPV & DM salvos!", description: "Configurações gravadas no banco com sucesso." });
    } catch (e: any) {
      console.error("[PPV save] erro:", e);
      sonnerToast.error("Erro ao salvar", { description: e?.message ?? "Tente novamente." });
      toast({ title: "Erro ao salvar PPV", description: e?.message ?? "Tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const TABS = [
    { id: "planos", label: "Meus Planos" },
    { id: "preco", label: "PPV & DM" },
    { id: "pix", label: "🟢 Recebimento PIX" },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90dvh] flex flex-col p-0 gap-0 bg-card border-border overflow-hidden">
          {/* Fixed header */}
          <DialogHeader className="shrink-0 px-4 pt-4 pb-3 border-b border-border/40">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="p-1.5 rounded-lg bg-yellow-500/20 shrink-0">
                <Crown className="h-4 w-4 text-yellow-400" />
              </div>
              Configurar Canal VIP
            </DialogTitle>
            <DialogDescription className="text-xs">
              Crie até {MAX_PLANS} planos de assinatura e configure preços globais de PPV e Super DM.
            </DialogDescription>
            {/* Tab bar */}
            <div className="flex gap-1 pt-1 flex-wrap">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6" style={{ scrollbarWidth: "none" }}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* ══ TAB: PLANOS ══ */}
                {activeTab === "planos" && (
                  <div className="space-y-4">
                    {/* Fee info */}
                    <FeeInfoTag />


                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <SectionTitle icon={Crown}>
                          Planos de Assinatura
                          <Badge className="ml-1 text-xs bg-muted text-muted-foreground border-border px-1.5 py-0">
                            {plans.length}/{MAX_PLANS}
                          </Badge>
                        </SectionTitle>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={openCreatePlanWizard}
                          disabled={plans.length >= MAX_PLANS}
                        >
                          <Plus className="h-3 w-3" /> Novo plano
                        </Button>
                      </div>

                      {plans.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/60 py-8 flex flex-col items-center gap-2 text-muted-foreground">
                          <CreditCard className="h-8 w-8 opacity-40" />
                          <p className="text-sm">Nenhum plano criado ainda</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={openCreatePlanWizard}
                            className="gap-1 text-xs h-7"
                          >
                            <Plus className="h-3 w-3" /> Criar primeiro plano
                          </Button>
                        </div>
                      )}

                      {/* Filtros */}
                      {plans.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              value={planSearch}
                              onChange={(e) => setPlanSearch(e.target.value)}
                              placeholder="Buscar por título..."
                              className="pl-8 h-8 text-xs"
                            />
                          </div>
                          <Select value={planTypeFilter} onValueChange={setPlanTypeFilter}>
                            <SelectTrigger className="h-8 text-xs sm:w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos os tipos</SelectItem>
                              <SelectItem value="image_bank">Banco de Imagens</SelectItem>
                              <SelectItem value="short_video_bank">Vídeos Curtos</SelectItem>
                              <SelectItem value="long_video">Vídeo Longo</SelectItem>
                              <SelectItem value="mixed_content">Conteúdos Mistos</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={planStatusFilter} onValueChange={(v) => setPlanStatusFilter(v as any)}>
                            <SelectTrigger className="h-8 text-xs sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos status</SelectItem>
                              <SelectItem value="active">Ativos</SelectItem>
                              <SelectItem value="inactive">Inativos</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {(() => {
                        const filteredPlans = plans.filter((p) => {
                          if (planSearch.trim() && !(p.title || "").toLowerCase().includes(planSearch.toLowerCase())) return false;
                          if (planTypeFilter !== "all" && (p as any).plan_type !== planTypeFilter) return false;
                          if (planStatusFilter === "active" && !p.is_enabled) return false;
                          if (planStatusFilter === "inactive" && p.is_enabled) return false;
                          return true;
                        });
                        if (plans.length > 0 && filteredPlans.length === 0) {
                          return (
                            <div className="rounded-xl border border-dashed border-border/40 py-6 text-center text-xs text-muted-foreground">
                              Nenhum plano corresponde aos filtros.
                            </div>
                          );
                        }
                        return (
                          <div className="space-y-3">
                            {filteredPlans.map((plan) => (
                              <div key={plan.id}>
                                <PlanCard
                                  plan={plan}
                                  profile={profile}
                                  isEditing={false}
                                  onEdit={async () => {
                                    const { data: mediaData } = await (supabase as any)
                                      .from("subscription_plan_media")
                                      .select("media_url, media_type, duration_seconds")
                                      .eq("plan_id", plan.id)
                                      .order("sort_order", { ascending: true });
                                    setWizardEditPlan({
                                      id: plan.id,
                                      title: plan.title,
                                      bio: plan.bio,
                                      plan_type: (plan as any).plan_type ?? "mixed_content",
                                      monthly_price: plan.monthly_price,
                                      annual_price: plan.annual_price,
                                      accepts_pix: (plan as any).accepts_pix ?? true,
                                      accepts_card: (plan as any).accepts_card ?? true,
                                      affiliate_user_id: (plan as any).affiliate_user_id ?? null,
                                      media: (mediaData || []).map((m: any) => ({
                                        url: m.media_url,
                                        media_type: m.media_type,
                                        duration_seconds: m.duration_seconds ?? undefined,
                                      })),
                                    });
                                    setShowWizard(true);
                                  }}
                                  onDelete={() => deletePlan(plan.id)}
                                  isSaving={saving}
                                  contentCount={(planContentMap[plan.id] || []).length}
                                  onToggleStatus={() => togglePlanStatus(plan.id)}
                                  onTestSubscribe={() => openTestSubscribe(plan)}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* ══ TAB: PPV & DM ══ */}
                {activeTab === "preco" && (
                  <div className="space-y-6">
                    <FeeInfoTag />


                    {/* PPV Prices */}
                    <div className="space-y-3">
                      <SectionTitle icon={Image}>Preços por Conteúdo (PPV)</SectionTitle>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {([
                          { label: "Por Foto", icon: Image, key: "price_per_photo" },
                          { label: "Por Vídeo", icon: Video, key: "price_per_video" },
                          { label: "Por Mensagem", icon: MessageSquare, key: "price_per_message" },
                        ] as const).map(({ label, icon: Icon, key }) => (
                          <div key={key} className="space-y-1.5">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <Label className="text-xs flex items-center gap-1">
                                <Icon className="h-3 w-3 text-primary" /> {label}
                              </Label>
                              <NetBadge gross={globalConfig[key]} />
                            </div>
                            {freeInput(globalConfig[key], (v) => setGlobal(key, v))}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Super DM */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <SectionTitle icon={Sparkles}>Super DM</SectionTitle>
                        <Switch
                          checked={globalConfig.super_dm_enabled}
                          onCheckedChange={(v) => setGlobal("super_dm_enabled", v)}
                        />
                      </div>
                      <div className={cn(!globalConfig.super_dm_enabled && "opacity-40 pointer-events-none")}>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-yellow-400" /> Preço mínimo da Super DM
                            </Label>
                            <NetBadge gross={globalConfig.super_dm_min_price} />
                          </div>
                          {freeInput(globalConfig.super_dm_min_price, (v) => setGlobal("super_dm_min_price", v))}
                          <p className="text-xs text-muted-foreground">Usuários pagam para destacar mensagem no topo da sua inbox</p>
                        </div>
                      </div>
                    </div>

                    {/* Auctions */}
                    <div className="space-y-3">
                      <SectionTitle icon={Gavel}>Leilões</SectionTitle>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs flex items-center gap-1.5">
                              <Gavel className="h-3 w-3 text-primary" /> Lance inicial padrão
                            </Label>
                            <NetBadge gross={globalConfig.auction_starting_price} />
                          </div>
                          {freeInput(globalConfig.auction_starting_price, (v) => setGlobal("auction_starting_price", v))}
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Gavel className="h-3 w-3 text-primary" /> Incremento mínimo
                          </Label>
                          {freeInput(globalConfig.auction_min_increment, (v) => setGlobal("auction_min_increment", v))}
                          <p className="text-xs text-muted-foreground">Diferença mínima entre lances</p>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={handleSavePPV}
                      disabled={saving}
                      className="w-full h-10 bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar Preços PPV & DM
                    </Button>
                  </div>
                )}

                {/* ══ TAB: PIX ══ */}
                {activeTab === "pix" && (
                  <div className="space-y-5">
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <QrCode className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-green-300">Informe sua chave PIX para receber pagamentos — simples e sem complicação.</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Tipo de Chave PIX</Label>
                      <Select value={pixKeyType} onValueChange={setPixKeyType}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="cnpj">CNPJ</SelectItem>
                          <SelectItem value="telefone">Telefone</SelectItem>
                          <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Sua Chave PIX</Label>
                      <Input value={pixKey} onChange={e => setPixKey(e.target.value)}
                        placeholder={pixKeyType === "email" ? "seuemail@exemplo.com" : pixKeyType === "cpf" ? "000.000.000-00" : pixKeyType === "telefone" ? "+5511999999999" : "Chave PIX"}
                        className="h-9 text-sm" autoComplete="off" />
                      <p className="text-xs text-muted-foreground">Essa chave será usada para transferir seus ganhos automaticamente.</p>
                    </div>
                    {pixKey.trim() && (
                      <div className="p-3 rounded-xl bg-muted/20 border border-border/50 flex items-center gap-3">
                        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                        <p className="text-xs text-muted-foreground font-mono">{pixKeyType.toUpperCase()}: {pixKey}</p>
                      </div>
                    )}
                    <Button onClick={handleSavePix} disabled={savingPix || !pixKey.trim()}
                      className="w-full h-10 bg-gradient-to-r from-green-600 to-green-700 hover:opacity-90 gap-2">
                      {savingPix ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando…</> : <><Save className="h-4 w-4" />Salvar Chave PIX</>}
                    </Button>
                  </div>
                )}

                {/* ══ TAB: ASAAS ══ removida — ASAAS é invisível para criadores.
                    Pagamentos são gerenciados automaticamente pela plataforma. */}

              </>
            )}
          </div>

          {/* Fixed footer — only shown on planos tab */}
          {activeTab === "planos" && (
            <div className="shrink-0 px-4 pb-4 pt-2 border-t border-border/40">
              <Button
                onClick={handleSave}
                disabled={saving || loading}
                className="w-full bg-gradient-to-r from-primary to-secondary hover:opacity-90 h-10"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Salvar Configurações</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Tutorial ASAAS removido — pagamentos gerenciados pela plataforma */}

      {/* Wallet alert */}
      <AlertDialog open={showWalletAlert} onOpenChange={setShowWalletAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Configure o recebimento
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você criou planos de assinatura mas ainda não cadastrou sua chave PIX. Cadastre uma chave PIX para começar a receber. Os pagamentos são processados automaticamente pelo Oculto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setShowWalletAlert(false); setActiveTab("pix"); }}>
              Configurar PIX
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {profile && (
        <CreatePlanWizard
          open={showWizard}
          onOpenChange={(v) => { setShowWizard(v); if (!v) setWizardEditPlan(null); }}
          profileId={profile.id}
          editPlan={wizardEditPlan}
          onCreated={() => {
            loadAll();
            queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
            queryClient.invalidateQueries({ queryKey: ["vitrine-plans"] });
            queryClient.invalidateQueries({ queryKey: ["creator-plans"] });
            queryClient.invalidateQueries({ queryKey: ["my-vip-plan"] });
          }}
        />
      )}

      <PlanSubscribeModal
        open={!!testSubscribePlan}
        onOpenChange={(v) => { if (!v) setTestSubscribePlan(null); }}
        plan={testSubscribePlan}
      />
    </>
  );
}
