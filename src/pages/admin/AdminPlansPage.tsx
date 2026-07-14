import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Crown,
  Sparkles,
  Ghost,
  Edit,
  Check,
  X,
  DollarSign,
  Users,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Trash2,
  Zap,
  Shield,
  Star,
  Heart,
  Gift,
  Lock,
  Radar,
  GripVertical,
  Flame,
  RotateCcw,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { PLAN_TEXT_TEMPLATES } from "@/lib/planTextTemplates";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CSS } from '@dnd-kit/utilities';
import {
  useSubscriptionPlans,
  useUpdatePlan,
  useTogglePlanStatus,
  useCreatePlan,
  useDeletePlan,
  useReorderPlans,
  useGhostModeConfig,
  useUpdateGhostModeConfig,
  SubscriptionPlan,
} from "@/hooks/useSubscriptionPlans";
import {
  usePlatformAddons,
  useCreateAddon,
  useUpdateAddon,
  useToggleAddonStatus,
  useDeleteAddon,
  PlatformAddon,
} from "@/hooks/usePlatformAddons";
import {
  useEarlyBirdCounters,
  useUpdateEarlyBirdCounter,
  useResetEarlyBirdCounter,
  useCreateEarlyBirdCounter,
  useDeleteEarlyBirdCounter,
  EarlyBirdCounter,
} from "@/hooks/useEarlyBirdPromotion";
import { EarlyBirdMetricsDashboard } from "@/components/admin/EarlyBirdMetricsDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3 } from "lucide-react";
import {
  PLAN_FEATURE_CATALOG,
  getDefaultPlanLists,
  getDefaultPlanLimits,
  inferToggleState,
  applyToggleStateToLists,
  formatLimit,
  type PlanTypeKey,
} from "@/lib/planFeatureCatalog";
import { PlanPermissionsPreview } from "@/components/admin/PlanPermissionsPreview";
import { validatePlanForm, detectLimitConflicts, autoFixLimitConflicts, type PlanValidationIssue, type LimitConflict } from "@/lib/planValidation";
import { Copy, AlertTriangle, Info, ChevronDown, ChevronUp, Infinity as InfinityIcon, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Icons disponíveis para add-ons
const ADDON_ICONS = [
  { value: 'Ghost', label: 'Fantasma', icon: Ghost },
  { value: 'Sparkles', label: 'Sparkles', icon: Sparkles },
  { value: 'Shield', label: 'Escudo', icon: Shield },
  { value: 'Star', label: 'Estrela', icon: Star },
  { value: 'Heart', label: 'Coração', icon: Heart },
  { value: 'Gift', label: 'Presente', icon: Gift },
  { value: 'Lock', label: 'Cadeado', icon: Lock },
  { value: 'Radar', label: 'Radar', icon: Radar },
  { value: 'Zap', label: 'Raio', icon: Zap },
  { value: 'Crown', label: 'Coroa', icon: Crown },
];

// Render icon by name
const IconByName = ({ name, className }: { name: string; className?: string }) => {
  const iconData = ADDON_ICONS.find(i => i.value === name);
  if (!iconData) return <Sparkles className={className} />;
  const IconComponent = iconData.icon;
  return <IconComponent className={className} />;
};

// Componente sortable para cards de planos
interface SortablePlanCardProps {
  plan: SubscriptionPlan;
  children: React.ReactNode;
}

// Linha editável inline para itens de "Recursos" e "Restrições"
interface EditableLineProps {
  text: string;
  icon: React.ReactNode;
  onSave: (newText: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  isSaving?: boolean;
}
function EditableLine({ text, icon, onSave, onDelete, isSaving }: EditableLineProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => { setDraft(text); }, [text]);

  if (editing) {
    return (
      <li className="flex items-start gap-1.5 text-[11px]">
        {icon}
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) { onSave(draft.trim()); setEditing(false); } }
            if (e.key === 'Escape') { setDraft(text); setEditing(false); }
          }}
          className="h-6 text-[11px] px-1.5 py-0.5 flex-1 min-w-0"
          disabled={isSaving}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          disabled={isSaving || !draft.trim()}
          onClick={async () => { await onSave(draft.trim()); setEditing(false); }}
          title="Salvar"
        >
          <Check className="h-3 w-3 text-green-500" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={() => { setDraft(text); setEditing(false); }}
          title="Cancelar"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </Button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-1.5 text-[11px] text-muted-foreground">
      {icon}
      <span className="flex-1 break-words">{text}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground shrink-0"
        title="Editar texto"
      >
        <Edit className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (confirm('Remover este item?')) onDelete(); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
        title="Remover"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </li>
  );
}

// Wrapper sortable de uma linha (recurso/restrição) — usa um id estável
interface SortableTextLineProps {
  id: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}
function SortableTextLine({ id, children }: SortableTextLineProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0"
      title="Arrastar para reordenar"
      onClick={(e) => e.stopPropagation()}
    >
      <GripVertical className="h-3 w-3" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}

function SortablePlanCard({ plan, children }: SortablePlanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: plan.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="relative">
      {/* Handle de arrastar */}
      <div 
        {...listeners} 
        className="absolute top-2 left-2 z-10 p-1.5 rounded-md bg-muted/80 hover:bg-muted cursor-grab active:cursor-grabbing transition-colors"
        title="Arraste para reordenar"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}

export default function AdminPlansPage() {
  const { data: plans, isLoading: plansLoading } = useSubscriptionPlans();
  const { data: addons, isLoading: addonsLoading } = usePlatformAddons();
  const { data: ghostConfig, isLoading: ghostLoading } = useGhostModeConfig();
  const { data: earlyBirdCounters, isLoading: earlyBirdLoading } = useEarlyBirdCounters();
  
  const updatePlan = useUpdatePlan();
  const togglePlanStatus = useTogglePlanStatus();
  const createPlan = useCreatePlan();
  const deletePlan = useDeletePlan();
  const reorderPlans = useReorderPlans();
  const updateGhostConfig = useUpdateGhostModeConfig();
  
  const createAddon = useCreateAddon();
  const updateAddon = useUpdateAddon();
  const toggleAddonStatus = useToggleAddonStatus();
  const deleteAddon = useDeleteAddon();

  // Early Bird hooks
  const updateEarlyBird = useUpdateEarlyBirdCounter();
  const resetEarlyBird = useResetEarlyBirdCounter();
  const createEarlyBird = useCreateEarlyBirdCounter();
  const deleteEarlyBird = useDeleteEarlyBirdCounter();

  // Sensors para drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Estado local para planos ordenados
  const [orderedPlans, setOrderedPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    if (plans) {
      setOrderedPlans([...plans].sort((a, b) => a.display_order - b.display_order));
    }
  }, [plans]);

  // Estados para modais de plano
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  
  // Estados para modais de add-on
  const [editingAddon, setEditingAddon] = useState<PlatformAddon | null>(null);
  const [isCreatingAddon, setIsCreatingAddon] = useState(false);
  const [deletingAddon, setDeletingAddon] = useState<PlatformAddon | null>(null);

  // Estados para Early Bird
  const [isCreatingEarlyBird, setIsCreatingEarlyBird] = useState(false);
  const [earlyBirdForm, setEarlyBirdForm] = useState({
    counter_type: '',
    max_count: 1000,
    bonus_months: 1,
    is_active: true,
  });
  const [resettingCounter, setResettingCounter] = useState<string | null>(null);
  const [deletingCounter, setDeletingCounter] = useState<EarlyBirdCounter | null>(null);

  // Form de plano
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    slug: '',
    plan_type: 'premium',
    price_monthly: 0,
    price_annual_per_month: 0,
    price_annual_total: 0,
    features: '',
    restrictions: '',
    display_order: 0,
    is_active: true,
    is_default: false,
    is_popular: false,
    cta_text: '',
  });

  // Toggles canônicos por funcionalidade (catálogo)
  const [featureToggles, setFeatureToggles] = useState<Record<string, boolean>>({});
  const [planLimits, setPlanLimits] = useState<Record<string, number>>({});
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);

  // Aplica toggles -> features/restrictions textuais (mesclando rótulos custom)
  const syncTogglesToText = (next: Record<string, boolean>, currentForm = planForm) => {
    const customFeat = currentForm.features.split('\n').map(s => s.trim()).filter(Boolean);
    const customRestr = currentForm.restrictions.split('\n').map(s => s.trim()).filter(Boolean);
    const { features, restrictions } = applyToggleStateToLists(next, customFeat, customRestr);
    setPlanForm({
      ...currentForm,
      features: features.join('\n'),
      restrictions: restrictions.join('\n'),
    });
  };

  // Form de add-on
  const [addonForm, setAddonForm] = useState({
    name: '',
    slug: '',
    description: '',
    price_monthly: 0,
    icon: 'Sparkles',
    is_active: true,
    compatible_plans: ['premium', 'vip'] as string[],
  });

  const [ghostPrice, setGhostPrice] = useState(9.99);

  // Sincronizar ghostPrice quando os dados chegarem
  useEffect(() => {
    if (ghostConfig?.price) {
      setGhostPrice(ghostConfig.price);
    }
  }, [ghostConfig?.price]);

  // Formatar valor em BRL
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Ícone por tipo de plano
  const getPlanIcon = (planType: string) => {
    switch (planType) {
      case 'free':
        return <Users className="h-4 w-4 sm:h-5 sm:w-5" />;
      case 'premium':
        return <Sparkles className="h-4 w-4 sm:h-5 sm:w-5" />;
      case 'vip':
        return <Crown className="h-4 w-4 sm:h-5 sm:w-5" />;
      default:
        return <Users className="h-4 w-4 sm:h-5 sm:w-5" />;
    }
  };

  // Cor por tipo de plano
  const getPlanColor = (planType: string) => {
    switch (planType) {
      case 'free':
        return 'bg-muted text-muted-foreground';
      case 'premium':
        return 'bg-[#FF007F]/20 text-[#FF007F]';
      case 'vip':
        return 'bg-amber-500/20 text-amber-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Abrir modal de edição de plano
  const handleEditPlan = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      slug: plan.slug,
      plan_type: plan.plan_type,
      price_monthly: plan.price_monthly,
      price_annual_per_month: plan.price_annual_per_month,
      price_annual_total: plan.price_annual_total,
      features: plan.features.join('\n'),
      restrictions: plan.restrictions.join('\n'),
      display_order: plan.display_order,
      is_active: plan.is_active,
      is_default: plan.is_default,
      is_popular: plan.is_popular,
      cta_text: plan.cta_text || '',
    });
    setFeatureToggles(inferToggleState(plan.features, plan.restrictions));
    const t = (plan.plan_type as PlanTypeKey) || 'premium';
    setPlanLimits({ ...getDefaultPlanLimits(t), ...(plan.limits || {}) });
  };

  const handleOpenCreatePlan = () => {
    const maxOrder = Math.max(...(plans?.map(p => p.display_order) || [0]), 0);
    const seedType: PlanTypeKey = 'premium';
    const seed = getDefaultPlanLists(seedType);
    setPlanForm({
      name: '',
      description: '',
      slug: '',
      plan_type: seedType,
      price_monthly: 29.90,
      price_annual_per_month: 24.90,
      price_annual_total: 24.90 * 12,
      features: seed.features.join('\n'),
      restrictions: seed.restrictions.join('\n'),
      display_order: maxOrder + 1,
      is_active: true,
      is_default: false,
      is_popular: false,
      cta_text: '',
    });
    const initState: Record<string, boolean> = {};
    PLAN_FEATURE_CATALOG.forEach((d) => { initState[d.key] = d.defaults[seedType]; });
    setFeatureToggles(initState);
    setPlanLimits(getDefaultPlanLimits(seedType));
    setIsCreatingPlan(true);
  };

  // Duplicar plano existente: abre modal de criação pré-preenchido
  const handleDuplicatePlan = (plan: SubscriptionPlan) => {
    setEditingPlan(null);
    setPlanForm({
      name: `${plan.name} (cópia)`,
      description: plan.description || '',
      slug: `${plan.slug}-copy`,
      plan_type: plan.plan_type,
      price_monthly: plan.price_monthly,
      price_annual_per_month: plan.price_annual_per_month,
      price_annual_total: plan.price_annual_total,
      features: plan.features.join('\n'),
      restrictions: plan.restrictions.join('\n'),
      display_order: (plans?.length || 0) + 1,
      is_active: false,
      is_default: false,
      is_popular: false,
      cta_text: plan.cta_text || '',
    });
    setFeatureToggles(inferToggleState(plan.features, plan.restrictions));
    const dt = (plan.plan_type as PlanTypeKey) || 'premium';
    setPlanLimits({ ...getDefaultPlanLimits(dt), ...(plan.limits || {}) });
    setIsCreatingPlan(true);
  };

  // Resetar toggles + listas para os defaults canônicos do tipo escolhido
  const handleResetToDefaults = (target?: PlanTypeKey) => {
    const t = (target || planForm.plan_type || 'premium') as PlanTypeKey;
    const next: Record<string, boolean> = {};
    PLAN_FEATURE_CATALOG.forEach((d) => { next[d.key] = d.defaults[t] ?? false; });
    setFeatureToggles(next);
    setPlanLimits(getDefaultPlanLimits(t));
    const seed = getDefaultPlanLists(t);
    setPlanForm((prev) => ({
      ...prev,
      plan_type: t,
      features: seed.features.join('\n'),
      restrictions: seed.restrictions.join('\n'),
    }));
  };

  // Validação ao vivo do formulário
  const validationIssues: PlanValidationIssue[] = (() => {
    if (!isCreatingPlan && !editingPlan) return [];
    const otherPlans = (plans || []).filter((p) => p.id !== editingPlan?.id);
    return validatePlanForm({
      planType: (planForm.plan_type || 'premium') as PlanTypeKey,
      toggles: featureToggles,
      priceMonthly: planForm.price_monthly,
      otherPlans,
    });
  })();
  const hasErrors = validationIssues.some((i) => i.level === 'error');

  // Detecção de conflitos entre toggles e limites numéricos
  const limitConflicts: LimitConflict[] = (() => {
    if (!isCreatingPlan && !editingPlan) return [];
    return detectLimitConflicts({
      planType: (planForm.plan_type || 'premium') as PlanTypeKey,
      toggles: featureToggles,
      limits: planLimits,
    });
  })();
  const hasConflictErrors = limitConflicts.some((c) => c.level === 'error');

  // Salvar plano (criar ou editar)
  const handleSavePlan = async () => {
    if (hasErrors || hasConflictErrors) return;
    const planData = {
      name: planForm.name,
      description: planForm.description || null,
      slug: planForm.slug,
      plan_type: planForm.plan_type,
      price_monthly: planForm.price_monthly,
      price_annual_per_month: planForm.price_annual_per_month,
      price_annual_total: planForm.price_annual_total || planForm.price_annual_per_month * 12,
      features: planForm.features.split('\n').filter(f => f.trim()),
      restrictions: planForm.restrictions.split('\n').filter(r => r.trim()),
      limits: planLimits,
      display_order: planForm.display_order,
      is_active: planForm.is_active,
      is_default: planForm.is_default,
      is_popular: planForm.is_popular,
      cta_text: planForm.cta_text || null,
    };

    if (editingPlan) {
      await updatePlan.mutateAsync({
        id: editingPlan.id,
        updates: planData,
      });
      setEditingPlan(null);
    } else {
      await createPlan.mutateAsync(planData);
      setIsCreatingPlan(false);
    }
  };

  // Deletar plano
  const handleDeletePlan = async () => {
    if (!deletingPlan) return;
    await deletePlan.mutateAsync(deletingPlan.id);
    setDeletingPlan(null);
  };

  // Toggle status do plano
  const handleToggleStatus = async (plan: SubscriptionPlan) => {
    await togglePlanStatus.mutateAsync({
      id: plan.id,
      isActive: !plan.is_active,
    });
  };

  // Abrir modal de edição de add-on
  const handleEditAddon = (addon: PlatformAddon) => {
    setEditingAddon(addon);
    setAddonForm({
      name: addon.name,
      slug: addon.slug,
      description: addon.description || '',
      price_monthly: addon.price_monthly,
      icon: addon.icon || 'Sparkles',
      is_active: addon.is_active,
      compatible_plans: addon.compatible_plans || ['premium', 'vip'],
    });
  };

  // Abrir modal de criação de add-on
  const handleOpenCreateAddon = () => {
    setAddonForm({
      name: '',
      slug: '',
      description: '',
      price_monthly: 9.99,
      icon: 'Sparkles',
      is_active: true,
      compatible_plans: ['premium', 'vip'],
    });
    setIsCreatingAddon(true);
  };

  // Salvar add-on
  const handleSaveAddon = async () => {
    const addonData = {
      name: addonForm.name,
      slug: addonForm.slug,
      description: addonForm.description || null,
      price_monthly: addonForm.price_monthly,
      icon: addonForm.icon,
      is_active: addonForm.is_active,
      compatible_plans: addonForm.compatible_plans,
    };

    if (editingAddon) {
      await updateAddon.mutateAsync({
        id: editingAddon.id,
        updates: addonData,
      });
      setEditingAddon(null);
    } else {
      await createAddon.mutateAsync(addonData);
      setIsCreatingAddon(false);
    }
  };

  // Deletar add-on
  const handleDeleteAddon = async () => {
    if (!deletingAddon) return;
    await deleteAddon.mutateAsync(deletingAddon.id);
    setDeletingAddon(null);
  };

  // Toggle compatible plan
  const toggleCompatiblePlan = (planType: string) => {
    setAddonForm(prev => ({
      ...prev,
      compatible_plans: prev.compatible_plans.includes(planType)
        ? prev.compatible_plans.filter(p => p !== planType)
        : [...prev.compatible_plans, planType],
    }));
  };

  // Salvar configuração do Modo Fantasma
  const handleSaveGhostConfig = async () => {
    await updateGhostConfig.mutateAsync({ price: ghostPrice });
  };

  // Toggle habilitação global do Modo Fantasma
  const handleToggleGhostEnabled = async () => {
    if (!ghostConfig) return;
    await updateGhostConfig.mutateAsync({ enabled: !ghostConfig.enabled });
  };

  // Handler de drag-and-drop
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = orderedPlans.findIndex(p => p.id === active.id);
      const newIndex = orderedPlans.findIndex(p => p.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(orderedPlans, oldIndex, newIndex);
        setOrderedPlans(newOrder);
        
        // Salvar nova ordem no banco
        reorderPlans.mutate(
          newOrder.map((plan, index) => ({
            id: plan.id,
            display_order: index,
          }))
        );
      }
    }
  };

  const isLoading = plansLoading || ghostLoading || addonsLoading || earlyBirdLoading;

  // Helper: formatar nome do contador
  const formatCounterTypeName = (type: string) => {
    const names: Record<string, string> = {
      monthly: 'Mensal',
      annual: 'Anual',
    };
    return names[type] || type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, ' ');
  };

  // Handler: salvar inline edição de Early Bird
  const handleSaveEarlyBird = async (counter: EarlyBirdCounter, field: string, value: any) => {
    await updateEarlyBird.mutateAsync({
      id: counter.id,
      updates: { [field]: value },
    });
  };

  // Handler: criar Early Bird
  const handleCreateEarlyBird = async () => {
    if (!earlyBirdForm.counter_type.trim()) return;
    await createEarlyBird.mutateAsync(earlyBirdForm);
    setIsCreatingEarlyBird(false);
    setEarlyBirdForm({ counter_type: '', max_count: 1000, bonus_months: 1, is_active: true });
  };

  // Handler: reset Early Bird
  const handleResetEarlyBird = async (counterId: string) => {
    await resetEarlyBird.mutateAsync(counterId);
    setResettingCounter(null);
  };

  // Handler: deletar Early Bird
  const handleDeleteEarlyBird = async () => {
    if (!deletingCounter) return;
    await deleteEarlyBird.mutateAsync(deletingCounter.id);
    setDeletingCounter(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
        <div>
          <Skeleton className="h-7 sm:h-8 w-48 sm:w-64 mb-2" />
          <Skeleton className="h-4 w-64 sm:w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 sm:h-80" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 p-2 sm:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Gestão de Planos e Add-ons</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure os planos de assinatura e add-ons da plataforma
          </p>
        </div>
        <Button
          onClick={handleOpenCreatePlan}
          className="bg-[#FF007F] hover:bg-[#FF007F]/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      {/* Grid de Planos com Drag-and-Drop */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GripVertical className="h-4 w-4" />
          <span>Arraste os cards para reordenar os planos</span>
          {reorderPlans.isPending && (
            <Loader2 className="h-3 w-3 animate-spin ml-2" />
          )}
        </div>
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedPlans.map(p => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {orderedPlans.map((plan) => {
                const isExpanded = expandedPlanId === plan.id;
                return (
                <SortablePlanCard key={plan.id} plan={plan}>
                  <Card
                    className={`relative transition-all cursor-pointer ${
                      !plan.is_active ? 'opacity-60' : ''
                    } ${isExpanded ? 'ring-2 ring-[#FF007F]/50' : ''}`}
                    onClick={(e) => {
                      // não expandir ao clicar nos botões/switch
                      if ((e.target as HTMLElement).closest('button,[role=switch],input,a')) return;
                      setExpandedPlanId(isExpanded ? null : plan.id);
                    }}
                  >
                    <CardHeader className="pb-3 sm:pb-4 p-4 sm:p-6 pl-10">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className={`${getPlanColor(plan.plan_type)} text-xs sm:text-sm`}>
                          {getPlanIcon(plan.plan_type)}
                          <span className="ml-1 capitalize">{plan.plan_type}</span>
                        </Badge>
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          <Switch
                            checked={plan.is_active}
                            onCheckedChange={() => handleToggleStatus(plan)}
                            disabled={togglePlanStatus.isPending}
                            aria-label={plan.is_active ? 'Desativar plano' : 'Ativar plano'}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicatePlan(plan)}
                            className="h-7 w-7 sm:h-8 sm:w-8"
                            title="Duplicar plano"
                          >
                            <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditPlan(plan)}
                            className="h-7 w-7 sm:h-8 sm:w-8"
                            title="Editar plano"
                          >
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                          {!plan.is_default && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingPlan(plan)}
                              className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                              title="Excluir plano"
                            >
                              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <CardTitle className="text-lg sm:text-xl mt-2">{plan.name}</CardTitle>
                      <CardDescription className="text-xs sm:text-sm line-clamp-2">{plan.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
                      {/* Preços */}
                      <div className="space-y-1 sm:space-y-2">
                        <div className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="text-muted-foreground">Mensal:</span>
                          <span className="font-semibold text-[#FF007F]">
                            {formatCurrency(plan.price_monthly)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="text-muted-foreground">Anual/mês:</span>
                          <span className="font-semibold">
                            {formatCurrency(plan.price_annual_per_month)}
                          </span>
                        </div>
                      </div>

                      {!isExpanded && plan.features.length > 0 && (
                        <div className="space-y-1 sm:space-y-2">
                          <span className="text-xs sm:text-sm font-medium text-foreground">Recursos:</span>
                          <ul className="space-y-0.5 sm:space-y-1">
                            {plan.features.slice(0, 3).map((feature, i) => (
                              <li key={i} className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                                <Check className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                                <span className="line-clamp-1">{feature}</span>
                              </li>
                            ))}
                            {plan.features.length > 3 && (
                              <li className="text-[10px] sm:text-xs text-muted-foreground pl-4 sm:pl-5">
                                +{plan.features.length - 3} mais...
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      {!isExpanded && plan.restrictions.length > 0 && (
                        <div className="space-y-1 sm:space-y-2">
                          <span className="text-xs sm:text-sm font-medium text-foreground">Restrições:</span>
                          <ul className="space-y-0.5 sm:space-y-1">
                            {plan.restrictions.slice(0, 2).map((restriction, i) => (
                              <li key={i} className="flex items-start gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
                                <X className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                                <span className="line-clamp-1">{restriction}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {isExpanded && (
                        <div className="space-y-3 pt-1 border-t border-border/30">
                          {(() => {
                            const updateList = async (field: 'features' | 'restrictions', next: string[]) => {
                              await updatePlan.mutateAsync({ id: plan.id, updates: { [field]: next } as any });
                            };
                            const applyTemplate = async (tplId: string, mode: 'replace' | 'merge') => {
                              const tpl = PLAN_TEXT_TEMPLATES.find(t => t.id === tplId);
                              if (!tpl) return;
                              const nextFeatures = mode === 'replace'
                                ? tpl.features
                                : Array.from(new Set([...plan.features, ...tpl.features]));
                              const nextRestrictions = mode === 'replace'
                                ? tpl.restrictions
                                : Array.from(new Set([...plan.restrictions, ...tpl.restrictions]));
                              await updatePlan.mutateAsync({
                                id: plan.id,
                                updates: { features: nextFeatures, restrictions: nextRestrictions } as any,
                              });
                              toast({ title: 'Template aplicado', description: `${tpl.label} (${mode === 'replace' ? 'substituiu' : 'mesclou'})` });
                            };
                            const handleDragEnd = (field: 'features' | 'restrictions', list: string[]) => (e: DragEndEvent) => {
                              const { active, over } = e;
                              if (!over || active.id === over.id) return;
                              const oldIndex = list.findIndex((_, i) => `${field}-${i}` === active.id);
                              const newIndex = list.findIndex((_, i) => `${field}-${i}` === over.id);
                              if (oldIndex < 0 || newIndex < 0) return;
                              updateList(field, arrayMove(list, oldIndex, newIndex));
                            };
                            return (
                              <>
                                {/* Templates rápidos */}
                                <div className="flex items-center justify-end">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={(e) => e.stopPropagation()}>
                                        <Wand2 className="h-3 w-3 mr-1" /> Aplicar template
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenuLabel className="text-xs">Substituir listas</DropdownMenuLabel>
                                      {PLAN_TEXT_TEMPLATES.map(t => (
                                        <DropdownMenuItem key={`r-${t.id}`} onClick={() => applyTemplate(t.id, 'replace')} className="text-xs">
                                          {t.label}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuLabel className="text-xs">Mesclar (sem duplicar)</DropdownMenuLabel>
                                      {PLAN_TEXT_TEMPLATES.map(t => (
                                        <DropdownMenuItem key={`m-${t.id}`} onClick={() => applyTemplate(t.id, 'merge')} className="text-xs">
                                          + {t.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground">Recursos liberados ({plan.features.length}):</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const txt = prompt('Novo recurso liberado:');
                                        if (txt && txt.trim()) updateList('features', [...plan.features, txt.trim()]);
                                      }}
                                    >
                                      <Plus className="h-3 w-3 mr-0.5" /> Adicionar
                                    </Button>
                                  </div>
                                  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd('features', plan.features)}>
                                    <SortableContext items={plan.features.map((_, i) => `features-${i}`)} strategy={verticalListSortingStrategy}>
                                      <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto pr-1">
                                        {plan.features.map((f, i) => (
                                          <SortableTextLine key={`features-${i}`} id={`features-${i}`}>
                                            {(handle) => (
                                              <div className="flex items-start gap-1">
                                                {handle}
                                                <div className="flex-1 min-w-0">
                                                  <EditableLine
                                                    text={f}
                                                    icon={<Check className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />}
                                                    isSaving={updatePlan.isPending}
                                                    onSave={(v) => updateList('features', plan.features.map((x, j) => j === i ? v : x))}
                                                    onDelete={() => updateList('features', plan.features.filter((_, j) => j !== i))}
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </SortableTextLine>
                                        ))}
                                        {plan.features.length === 0 && (
                                          <li className="text-[11px] text-muted-foreground italic">Nenhum recurso liberado.</li>
                                        )}
                                      </ul>
                                    </SortableContext>
                                  </DndContext>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-foreground">Restrições ({plan.restrictions.length}):</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const txt = prompt('Nova restrição:');
                                        if (txt && txt.trim()) updateList('restrictions', [...plan.restrictions, txt.trim()]);
                                      }}
                                    >
                                      <Plus className="h-3 w-3 mr-0.5" /> Adicionar
                                    </Button>
                                  </div>
                                  <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd('restrictions', plan.restrictions)}>
                                    <SortableContext items={plan.restrictions.map((_, i) => `restrictions-${i}`)} strategy={verticalListSortingStrategy}>
                                      <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto pr-1">
                                        {plan.restrictions.map((r, i) => (
                                          <SortableTextLine key={`restrictions-${i}`} id={`restrictions-${i}`}>
                                            {(handle) => (
                                              <div className="flex items-start gap-1">
                                                {handle}
                                                <div className="flex-1 min-w-0">
                                                  <EditableLine
                                                    text={r}
                                                    icon={<X className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />}
                                                    isSaving={updatePlan.isPending}
                                                    onSave={(v) => updateList('restrictions', plan.restrictions.map((x, j) => j === i ? v : x))}
                                                    onDelete={() => updateList('restrictions', plan.restrictions.filter((_, j) => j !== i))}
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </SortableTextLine>
                                        ))}
                                        {plan.restrictions.length === 0 && (
                                          <li className="text-[11px] text-muted-foreground italic">Nenhuma restrição.</li>
                                        )}
                                      </ul>
                                    </SortableContext>
                                  </DndContext>
                                </div>
                              </>
                            );
                          })()}

                          {plan.limits && Object.keys(plan.limits).length > 0 && (
                            <div>
                              <span className="text-xs font-semibold text-foreground">Limites configurados:</span>
                              <ul className="mt-1 space-y-0.5">
                                {PLAN_FEATURE_CATALOG.flatMap((d) => d.limits || []).map((lim) => {
                                  if (!(lim.key in (plan.limits || {}))) return null;
                                  return (
                                    <li key={lim.key} className="flex items-center justify-between text-[11px] text-muted-foreground">
                                      <span className="truncate" title={lim.hint}>{lim.label}</span>
                                      <span className="font-mono text-foreground">{formatLimit(plan.limits[lim.key], lim.unit)}</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="default" className="flex-1 h-8 text-xs bg-[#FF007F] hover:bg-[#FF007F]/90" onClick={() => handleEditPlan(plan)}>
                              <Edit className="h-3 w-3 mr-1" /> Editar
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => handleDuplicatePlan(plan)}>
                              <Copy className="h-3 w-3 mr-1" /> Duplicar
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        {plan.is_default ? (
                          <Badge variant="outline" className="text-[10px]">Padrão</Badge>
                        ) : <span />}
                        <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                          {isExpanded ? (<><ChevronUp className="h-3 w-3" /> Recolher</>) : (<><ChevronDown className="h-3 w-3" /> Ver tudo</>)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </SortablePlanCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Seção Early Bird - Promoção 1000 Primeiros */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <Flame className="h-5 w-5 text-[#FF007F]" />
              Promoção Early Bird
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure vagas promocionais com meses bônus para os primeiros assinantes
            </p>
          </div>
        </div>

        <Tabs defaultValue="config" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="config" className="gap-2">
              <Flame className="h-4 w-4" />
              Configuração
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Métricas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setEarlyBirdForm({ counter_type: '', max_count: 1000, bonus_months: 1, is_active: true });
                  setIsCreatingEarlyBird(true);
                }}
                variant="outline"
                className="border-[#FF007F]/50 text-[#FF007F] hover:bg-[#FF007F]/10"
              >
                <Plus className="h-4 w-4 mr-2" />
                Nova Promoção
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {earlyBirdCounters?.map((counter) => {
                const progressPercent = (counter.current_count / counter.max_count) * 100;
                const remaining = counter.max_count - counter.current_count;
                const isStandardType = counter.counter_type === 'monthly' || counter.counter_type === 'annual';
                
                return (
                  <Card
                    key={counter.id}
                    className={`border-[#FF007F]/30 transition-all ${
                      !counter.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-[#FF007F]/20">
                            <Flame className="h-4 w-4 text-[#FF007F]" />
                          </div>
                          <div>
                            <CardTitle className="text-base">
                              {formatCounterTypeName(counter.counter_type)}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {counter.counter_type}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={counter.is_active}
                          onCheckedChange={(checked) => handleSaveEarlyBird(counter, 'is_active', checked)}
                          disabled={updateEarlyBird.isPending}
                        />
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-2 space-y-4">
                      {/* Progress */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Vagas ocupadas</span>
                          <span className="font-semibold">
                            {counter.current_count} / {counter.max_count}
                          </span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                        <p className="text-xs text-center text-muted-foreground">
                          {remaining > 0 ? (
                            <span className="text-[#FF007F] font-medium">{remaining} vagas restantes</span>
                          ) : (
                            <span className="text-destructive font-medium">Esgotado!</span>
                          )}
                        </p>
                      </div>

                      {/* Editable Fields */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Total Vagas</Label>
                          <Input
                            type="number"
                            min={counter.current_count}
                            value={counter.max_count}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              if (value >= counter.current_count) {
                                handleSaveEarlyBird(counter, 'max_count', value);
                              }
                            }}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Meses Bônus</Label>
                          <Input
                            type="number"
                            min={0}
                            value={counter.bonus_months}
                            onChange={(e) => handleSaveEarlyBird(counter, 'bonus_months', parseInt(e.target.value) || 0)}
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => setResettingCounter(counter.id)}
                          disabled={resetEarlyBird.isPending || counter.current_count === 0}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Zerar
                        </Button>
                        {!isStandardType && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingCounter(counter)}
                            disabled={deleteEarlyBird.isPending}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {/* Bonus Badge */}
                      <Badge variant="secondary" className="w-full justify-center">
                        <Gift className="h-3 w-3 mr-1" />
                        +{counter.bonus_months} {counter.bonus_months === 1 ? 'mês' : 'meses'} grátis
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="metrics">
            <EarlyBirdMetricsDashboard />
          </TabsContent>
        </Tabs>
      </div>

      {/* Seção de Add-ons */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">Add-ons da Plataforma</h2>
            <p className="text-sm text-muted-foreground">
              Recursos extras que podem ser adquiridos pelos usuários
            </p>
          </div>
          <Button
            onClick={handleOpenCreateAddon}
            variant="outline"
            className="border-[#FF007F]/50 text-[#FF007F] hover:bg-[#FF007F]/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Add-on
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {addons?.map((addon) => (
            <Card
              key={addon.id}
              className={`border-[#FF007F]/30 transition-all ${
                !addon.is_active ? 'opacity-60' : ''
              }`}
            >
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#FF007F]/20">
                      <IconByName name={addon.icon} className="h-5 w-5 text-[#FF007F]" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{addon.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">{addon.slug}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleAddonStatus.mutate({ id: addon.id, isActive: !addon.is_active })}
                      className="h-7 w-7"
                    >
                      {addon.is_active ? (
                        <Eye className="h-3 w-3 text-green-500" />
                      ) : (
                        <EyeOff className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditAddon(addon)}
                      className="h-7 w-7"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingAddon(addon)}
                      className="h-7 w-7 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {addon.description || 'Sem descrição'}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#FF007F]">
                    {formatCurrency(addon.price_monthly)}/mês
                  </span>
                  <div className="flex gap-1">
                    {addon.compatible_plans?.map((planType) => (
                      <Badge key={planType} variant="outline" className="text-[10px] capitalize">
                        {planType}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Configuração Modo Fantasma (legado) */}
      <Card className="border-[#FF007F]/30">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-[#FF007F]/20 w-fit">
              <Ghost className="h-5 w-5 sm:h-6 sm:w-6 text-[#FF007F]" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg">Configuração Modo Fantasma (Legado)</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configuração antiga do Modo Fantasma via system_settings
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 sm:space-y-6 p-4 sm:p-6 pt-0 sm:pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {/* Preço do Add-on */}
            <div className="space-y-2 sm:space-y-3">
              <Label htmlFor="ghost-price" className="text-sm">Preço do Add-on (por mês)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                  <Input
                    id="ghost-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={ghostPrice}
                    onChange={(e) => setGhostPrice(parseFloat(e.target.value) || 0)}
                    className="pl-8 sm:pl-10 text-sm h-9 sm:h-10"
                  />
                </div>
                <Button
                  onClick={handleSaveGhostConfig}
                  disabled={updateGhostConfig.isPending}
                  size="sm"
                  className="h-9 sm:h-10 px-3 sm:px-4"
                >
                  {updateGhostConfig.isPending ? (
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  ) : (
                    'Salvar'
                  )}
                </Button>
              </div>
            </div>

            {/* Toggle Global */}
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-sm">Oferta Ativa Globalmente</Label>
              <div className="flex items-center gap-2 sm:gap-3">
                <Switch
                  checked={ghostConfig?.enabled || false}
                  onCheckedChange={handleToggleGhostEnabled}
                  disabled={updateGhostConfig.isPending}
                />
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {ghostConfig?.enabled
                    ? 'Disponível no checkout'
                    : 'Oculto do checkout'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Criar/Editar Plano */}
      <Dialog 
        open={!!editingPlan || isCreatingPlan} 
        onOpenChange={(open) => {
          if (!open) {
            setEditingPlan(null);
            setIsCreatingPlan(false);
          }
        }}
      >
        <DialogContent className="w-[96vw] max-w-3xl max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border/40 shrink-0">
            <DialogTitle className="text-base sm:text-lg">
              {editingPlan ? 'Editar Plano' : 'Criar Novo Plano'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editingPlan
                ? `Atualize as informações do plano ${editingPlan.name}`
                : 'Preencha as informações do novo plano'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6">
            <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-name" className="text-xs sm:text-sm">Nome do Plano</Label>
                  <Input
                    id="plan-name"
                    value={planForm.name}
                    onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    placeholder="Ex: Premium Plus"
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-slug" className="text-xs sm:text-sm">Slug</Label>
                  <Input
                    id="plan-slug"
                    value={planForm.slug}
                    onChange={(e) => setPlanForm({ ...planForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    placeholder="premium-plus"
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="plan-description" className="text-xs sm:text-sm">Descrição</Label>
                <Input
                  id="plan-description"
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                  placeholder="Descrição breve do plano"
                  className="text-sm h-9 sm:h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-type" className="text-xs sm:text-sm">Tipo do Plano</Label>
                  <Select
                    value={planForm.plan_type}
                    onValueChange={(v) => {
                      const t = v as PlanTypeKey;
                      const nextToggles: Record<string, boolean> = {};
                      PLAN_FEATURE_CATALOG.forEach((d) => { nextToggles[d.key] = d.defaults[t] ?? false; });
                      setFeatureToggles(nextToggles);
                      setPlanLimits(getDefaultPlanLimits(t));
                      const seed = getDefaultPlanLists(t);
                      setPlanForm({
                        ...planForm,
                        plan_type: v,
                        features: seed.features.join('\n'),
                        restrictions: seed.restrictions.join('\n'),
                      });
                    }}
                  >
                    <SelectTrigger className="h-9 sm:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="vip">VIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-order" className="text-xs sm:text-sm">Ordem de Exibição</Label>
                  <Input
                    id="plan-order"
                    type="number"
                    min="0"
                    value={planForm.display_order}
                    onChange={(e) => setPlanForm({ ...planForm, display_order: parseInt(e.target.value) || 0 })}
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-monthly" className="text-xs sm:text-sm">Preço Mensal (R$)</Label>
                  <Input
                    id="plan-monthly"
                    type="number"
                    step="0.01"
                    min="0"
                    value={planForm.price_monthly}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, price_monthly: parseFloat(e.target.value) || 0 })
                    }
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-annual" className="text-xs sm:text-sm">Anual/Mês (R$)</Label>
                  <Input
                    id="plan-annual"
                    type="number"
                    step="0.01"
                    min="0"
                    value={planForm.price_annual_per_month}
                    onChange={(e) =>
                      setPlanForm({
                        ...planForm,
                        price_annual_per_month: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-annual-total" className="text-xs sm:text-sm">Total Anual (R$)</Label>
                  <Input
                    id="plan-annual-total"
                    type="number"
                    step="0.01"
                    min="0"
                    value={planForm.price_annual_total}
                    onChange={(e) =>
                      setPlanForm({ ...planForm, price_annual_total: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="Ex: 238.80"
                    className="text-sm h-9 sm:h-10"
                  />
                  <p className="text-[10px] text-muted-foreground">Cobrança única anual. Em branco = anual/mês × 12.</p>
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="plan-cta" className="text-xs sm:text-sm">Texto do botão (CTA)</Label>
                  <Input
                    id="plan-cta"
                    value={planForm.cta_text}
                    onChange={(e) => setPlanForm({ ...planForm, cta_text: e.target.value })}
                    placeholder="Ex: Assinar Premium"
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
              </div>
              {/* Toggles canônicos: ativar/desativar funções por plano */}
              <div className="space-y-2 rounded-lg border border-border/40 bg-muted/10 p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="text-xs sm:text-sm font-semibold">Funções e regras do plano</Label>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] text-muted-foreground mr-1">Resetar para:</span>
                    {(['free','premium','vip'] as PlanTypeKey[]).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] capitalize"
                        onClick={() => {
                          handleResetToDefaults(t);
                          // sincroniza textareas
                          const next: Record<string, boolean> = {};
                          PLAN_FEATURE_CATALOG.forEach((d) => { next[d.key] = d.defaults[t] ?? false; });
                          syncTogglesToText(next, { ...planForm, plan_type: t });
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Ative para liberar (vai para Recursos) ou desative para restringir (vai para Restrições).
                </p>
                <TooltipProvider delayDuration={200}>
                  <div className="space-y-3 pt-1">
                    {(['Conteúdo','Mensagens','Monetização','Engajamento','Privacidade','Diversos'] as const).map((cat) => {
                      const items = PLAN_FEATURE_CATALOG.filter((d) => d.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className="space-y-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{cat}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                            {items.map((def) => {
                              const checked = !!featureToggles[def.key];
                              return (
                                <div key={def.key} className="rounded-md border border-border/20 bg-background/40 p-2 space-y-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex items-center gap-1.5">
                                      <p className="text-xs sm:text-sm text-foreground truncate" title={def.description}>{def.label}</p>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button type="button" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Detalhes">
                                            <Info className="h-3 w-3" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs text-xs">
                                          {def.description}
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Switch
                                      checked={checked}
                                      onCheckedChange={(v) => {
                                        const next = { ...featureToggles, [def.key]: v };
                                        setFeatureToggles(next);
                                        syncTogglesToText(next);
                                      }}
                                    />
                                  </div>
                                  {def.limits && def.limits.length > 0 && (
                                    <div className={`grid grid-cols-1 gap-1.5 ${checked ? '' : 'opacity-50 pointer-events-none'}`}>
                                      {def.limits.map((lim) => {
                                        const value = planLimits[lim.key] ?? lim.defaults[(planForm.plan_type || 'premium') as PlanTypeKey];
                                        const isUnlimited = value === -1;
                                        return (
                                          <div key={lim.key} className="flex items-center gap-1.5">
                                            <Tooltip delayDuration={150}>
                                              <TooltipTrigger asChild>
                                                <Label className="text-[10px] text-muted-foreground flex-1 truncate cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                                                  {lim.label}
                                                </Label>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="max-w-sm text-xs space-y-2 p-3">
                                                <div className="font-semibold text-foreground">{lim.label}</div>
                                                <div className="text-muted-foreground leading-relaxed">{lim.hint}</div>
                                                <div className="border-t border-border/50 pt-2 space-y-0.5">
                                                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Padrões da plataforma</div>
                                                  <div className="grid grid-cols-3 gap-1 text-[11px]">
                                                    <div><span className="text-muted-foreground">Free:</span> <span className="font-mono text-foreground">{lim.defaults.free === -1 ? '∞' : lim.defaults.free}</span></div>
                                                    <div><span className="text-primary">Premium:</span> <span className="font-mono text-foreground">{lim.defaults.premium === -1 ? '∞' : lim.defaults.premium}</span></div>
                                                    <div><span className="text-amber-500">VIP:</span> <span className="font-mono text-foreground">{lim.defaults.vip === -1 ? '∞' : lim.defaults.vip}</span></div>
                                                  </div>
                                                </div>
                                                <div className="border-t border-border/50 pt-2 text-[10px] text-muted-foreground/80 leading-relaxed">
                                                  Unidade: <span className="font-mono text-foreground/80">{lim.unit}</span>. Use <span className="font-mono">-1</span> ou o botão <span className="font-mono">∞</span> para liberar sem limite. <span className="font-mono">0</span> bloqueia o recurso.
                                                </div>
                                              </TooltipContent>
                                            </Tooltip>
                                            <Input
                                              type="number"
                                              min={lim.min}
                                              value={isUnlimited ? '' : value}
                                              placeholder={isUnlimited ? '∞' : '0'}
                                              disabled={isUnlimited}
                                              onChange={(e) => {
                                                const v = e.target.value === '' ? 0 : parseInt(e.target.value);
                                                setPlanLimits((p) => ({ ...p, [lim.key]: isNaN(v) ? 0 : v }));
                                              }}
                                              className="h-7 w-20 text-[11px] px-2"
                                            />
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant={isUnlimited ? 'default' : 'outline'}
                                              className="h-7 px-2 text-[10px]"
                                              onClick={() => setPlanLimits((p) => ({ ...p, [lim.key]: isUnlimited ? (lim.defaults.free || 10) : -1 }))}
                                              title={isUnlimited ? 'Definir limite' : 'Tornar ilimitado'}
                                            >
                                              <InfinityIcon className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TooltipProvider>
              </div>

              {/* Pré-visualização ao vivo das permissões por plano */}
              <PlanPermissionsPreview
                editingType={(planForm.plan_type || 'premium') as PlanTypeKey}
                editingToggles={featureToggles}
              />

              {/* Painel de validação de combinações inválidas */}
              {validationIssues.length > 0 && (
                <div className={`rounded-lg border p-3 space-y-1.5 ${
                  hasErrors ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5'
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${hasErrors ? 'text-destructive' : 'text-amber-500'}`} />
                    <p className="text-xs sm:text-sm font-semibold">
                      {hasErrors
                        ? 'Combinação inválida — corrija para salvar'
                        : 'Avisos de coerência (não bloqueiam salvar)'}
                    </p>
                  </div>
                  <ul className="space-y-1 list-disc list-inside text-[11px] sm:text-xs">
                    {validationIssues.map((iss, i) => (
                      <li key={i} className={iss.level === 'error' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'}>
                        {iss.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Painel de conflitos entre toggles e limites numéricos */}
              {limitConflicts.length > 0 && (
                <div className={`rounded-lg border p-3 space-y-2 ${
                  hasConflictErrors ? 'border-destructive/40 bg-destructive/5' : 'border-amber-500/40 bg-amber-500/5'
                }`}>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`h-4 w-4 ${hasConflictErrors ? 'text-destructive' : 'text-amber-500'}`} />
                    <p className="text-xs sm:text-sm font-semibold">
                      {hasConflictErrors
                        ? `Conflito de limites detectado (${limitConflicts.filter(c => c.level === 'error').length}) — corrija para salvar`
                        : `Atenção: ${limitConflicts.length} aviso(s) sobre combinações de limites`}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={hasConflictErrors ? 'destructive' : 'outline'}
                      onClick={() => {
                        const fix = autoFixLimitConflicts({
                          planType: (planForm.plan_type || 'premium') as PlanTypeKey,
                          toggles: featureToggles,
                          limits: planLimits,
                        });
                        if (fix.changedKeys.length === 0) {
                          toast({ title: 'Nada a corrigir', description: 'Os limites já estão coerentes.' });
                          return;
                        }
                        setPlanLimits(fix.limits);
                        toast({
                          title: 'Limites corrigidos',
                          description: `${fix.changedKeys.length} campo(s) ajustado(s) para os defaults coerentes do plano ${planForm.plan_type?.toUpperCase()}.`,
                        });
                      }}
                      className="h-8 text-xs gap-1"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Corrigir automaticamente
                    </Button>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Toggles ativos com limite zero tornam a função inacessível mesmo aparecendo liberada.
                    Limites maiores que zero em funções desativadas são ignorados pelo sistema.
                  </p>
                  <ul className="space-y-2">
                    {limitConflicts.map((c, i) => (
                      <li key={i} className={`rounded-md border p-2 ${
                        c.level === 'error'
                          ? 'border-destructive/30 bg-destructive/5'
                          : c.level === 'warning'
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-border/40 bg-muted/30'
                      }`}>
                        <div className={`text-[11px] sm:text-xs font-semibold ${
                          c.level === 'error' ? 'text-destructive' : c.level === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
                        }`}>
                          {c.title}
                        </div>
                        <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          <span className="font-medium text-foreground/80">Impacto:</span> {c.impact}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="plan-features" className="text-xs sm:text-sm">Recursos (um por linha)</Label>
                <Textarea
                  id="plan-features"
                  rows={3}
                  value={planForm.features}
                  onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                  placeholder="Feed completo&#10;Mensagens ilimitadas&#10;Modo fantasma"
                  className="text-sm resize-none"
                />
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="plan-restrictions" className="text-xs sm:text-sm">Restrições (um por linha)</Label>
                <Textarea
                  id="plan-restrictions"
                  rows={2}
                  value={planForm.restrictions}
                  onChange={(e) => setPlanForm({ ...planForm, restrictions: e.target.value })}
                  placeholder="Sem modo fantasma&#10;Anúncios"
                  className="text-sm resize-none"
                />
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={planForm.is_active}
                    onCheckedChange={(v) => setPlanForm({ ...planForm, is_active: v })}
                  />
                  <Label className="text-xs sm:text-sm">Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={planForm.is_default}
                    onCheckedChange={(v) => setPlanForm({ ...planForm, is_default: v })}
                    disabled={editingPlan?.is_default}
                  />
                  <Label className="text-xs sm:text-sm">Plano Padrão</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={planForm.is_popular}
                    onCheckedChange={(v) => setPlanForm({ ...planForm, is_popular: v })}
                  />
                  <Label className="text-xs sm:text-sm">Popular (destaque)</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-border/40 shrink-0 bg-card/95">
            <Button 
              variant="outline" 
              onClick={() => {
                setEditingPlan(null);
                setIsCreatingPlan(false);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePlan}
              disabled={hasErrors || hasConflictErrors || updatePlan.isPending || createPlan.isPending || !planForm.name || !planForm.slug}
              className="w-full sm:w-auto bg-[#FF007F] hover:bg-[#FF007F]/90 order-1 sm:order-2"
            >
              {(updatePlan.isPending || createPlan.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editingPlan ? 'Salvar Alterações' : 'Criar Plano'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Criar/Editar Add-on */}
      <Dialog 
        open={!!editingAddon || isCreatingAddon} 
        onOpenChange={(open) => {
          if (!open) {
            setEditingAddon(null);
            setIsCreatingAddon(false);
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-border/40 shrink-0">
            <DialogTitle className="text-base sm:text-lg">
              {editingAddon ? 'Editar Add-on' : 'Criar Novo Add-on'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editingAddon
                ? `Atualize as informações do add-on ${editingAddon.name}`
                : 'Preencha as informações do novo add-on'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6">
            <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="addon-name" className="text-xs sm:text-sm">Nome</Label>
                  <Input
                    id="addon-name"
                    value={addonForm.name}
                    onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                    placeholder="Ex: Modo Turbo"
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="addon-slug" className="text-xs sm:text-sm">Slug</Label>
                  <Input
                    id="addon-slug"
                    value={addonForm.slug}
                    onChange={(e) => setAddonForm({ ...addonForm, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                    placeholder="modo-turbo"
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
              </div>

              <div className="space-y-1 sm:space-y-2">
                <Label htmlFor="addon-description" className="text-xs sm:text-sm">Descrição</Label>
                <Textarea
                  id="addon-description"
                  value={addonForm.description}
                  onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}
                  placeholder="Descrição do add-on..."
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="addon-price" className="text-xs sm:text-sm">Preço Mensal (R$)</Label>
                  <Input
                    id="addon-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={addonForm.price_monthly}
                    onChange={(e) => setAddonForm({ ...addonForm, price_monthly: parseFloat(e.target.value) || 0 })}
                    className="text-sm h-9 sm:h-10"
                  />
                </div>
                <div className="space-y-1 sm:space-y-2">
                  <Label htmlFor="addon-icon" className="text-xs sm:text-sm">Ícone</Label>
                  <Select
                    value={addonForm.icon}
                    onValueChange={(v) => setAddonForm({ ...addonForm, icon: v })}
                  >
                    <SelectTrigger className="h-9 sm:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADDON_ICONS.map((icon) => (
                        <SelectItem key={icon.value} value={icon.value}>
                          <div className="flex items-center gap-2">
                            <icon.icon className="h-4 w-4" />
                            <span>{icon.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Planos Compatíveis</Label>
                <div className="flex flex-wrap gap-2">
                  {['free', 'premium', 'vip'].map((planType) => (
                    <Badge
                      key={planType}
                      variant={addonForm.compatible_plans.includes(planType) ? 'default' : 'outline'}
                      className={`cursor-pointer capitalize ${
                        addonForm.compatible_plans.includes(planType)
                          ? 'bg-[#FF007F] hover:bg-[#FF007F]/80'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleCompatiblePlan(planType)}
                    >
                      {planType}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={addonForm.is_active}
                  onCheckedChange={(v) => setAddonForm({ ...addonForm, is_active: v })}
                />
                <Label className="text-xs sm:text-sm">Ativo</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-border/40 shrink-0 bg-card/95">
            <Button 
              variant="outline" 
              onClick={() => {
                setEditingAddon(null);
                setIsCreatingAddon(false);
              }}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveAddon}
              disabled={updateAddon.isPending || createAddon.isPending || !addonForm.name || !addonForm.slug}
              className="w-full sm:w-auto bg-[#FF007F] hover:bg-[#FF007F]/90 order-1 sm:order-2"
            >
              {(updateAddon.isPending || createAddon.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editingAddon ? 'Salvar Alterações' : 'Criar Add-on'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar Deletar Plano */}
      <AlertDialog open={!!deletingPlan} onOpenChange={(open) => !open && setDeletingPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Plano</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o plano "{deletingPlan?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePlan}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePlan.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar Deletar Add-on */}
      <AlertDialog open={!!deletingAddon} onOpenChange={(open) => !open && setDeletingAddon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Add-on</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o add-on "{deletingAddon?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAddon}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAddon.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal Criar Early Bird */}
      <Dialog open={isCreatingEarlyBird} onOpenChange={setIsCreatingEarlyBird}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-[#FF007F]" />
              Nova Promoção Early Bird
            </DialogTitle>
            <DialogDescription>
              Crie uma nova promoção com vagas limitadas e meses de bônus
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="eb-type">Tipo/Slug (identificador único)</Label>
              <Input
                id="eb-type"
                placeholder="ex: trimestral, black-friday, promocao-verao"
                value={earlyBirdForm.counter_type}
                onChange={(e) => setEarlyBirdForm({
                  ...earlyBirdForm,
                  counter_type: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                })}
              />
              <p className="text-xs text-muted-foreground">
                Use apenas letras minúsculas, números e hífens
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="eb-max">Total de Vagas</Label>
                <Input
                  id="eb-max"
                  type="number"
                  min={1}
                  value={earlyBirdForm.max_count}
                  onChange={(e) => setEarlyBirdForm({
                    ...earlyBirdForm,
                    max_count: parseInt(e.target.value) || 1000,
                  })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eb-bonus">Meses Bônus</Label>
                <Input
                  id="eb-bonus"
                  type="number"
                  min={0}
                  value={earlyBirdForm.bonus_months}
                  onChange={(e) => setEarlyBirdForm({
                    ...earlyBirdForm,
                    bonus_months: parseInt(e.target.value) || 0,
                  })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={earlyBirdForm.is_active}
                onCheckedChange={(v) => setEarlyBirdForm({ ...earlyBirdForm, is_active: v })}
              />
              <Label>Ativar imediatamente</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreatingEarlyBird(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateEarlyBird}
              disabled={createEarlyBird.isPending || !earlyBirdForm.counter_type.trim()}
              className="bg-[#FF007F] hover:bg-[#FF007F]/90"
            >
              {createEarlyBird.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Promoção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar Reset Early Bird */}
      <AlertDialog open={!!resettingCounter} onOpenChange={(open) => !open && setResettingCounter(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reiniciar Contagem</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja zerar a contagem de vagas ocupadas? Os usuários que já garantiram suas vagas manterão seus bônus, mas a contagem voltará a zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resettingCounter && handleResetEarlyBird(resettingCounter)}
              className="bg-[#FF007F] hover:bg-[#FF007F]/90"
            >
              {resetEarlyBird.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <RotateCcw className="h-4 w-4 mr-2" />
              Reiniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar Deletar Early Bird */}
      <AlertDialog open={!!deletingCounter} onOpenChange={(open) => !open && setDeletingCounter(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Promoção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar a promoção "{deletingCounter?.counter_type}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEarlyBird}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEarlyBird.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Trash2 className="h-4 w-4 mr-2" />
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
