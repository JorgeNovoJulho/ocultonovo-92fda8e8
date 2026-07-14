import { useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Ticket,
  Percent,
  DollarSign,
  Loader2,
  Copy,
  Check,
  Calendar,
  Users,
  TrendingUp,
  Flame,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useSubscriptionCoupons,
  useCreateSubscriptionCoupon,
  useUpdateSubscriptionCoupon,
  useDeleteSubscriptionCoupon,
  useEarlyBirdCounters,
  useUpdateEarlyBirdCounter,
  SubscriptionCoupon,
} from '@/hooks/useEarlyBirdPromotion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AdminSubscriptionCouponsPage() {
  const { data: coupons, isLoading: couponsLoading } = useSubscriptionCoupons();
  const { data: earlyBirdCounters, isLoading: earlyBirdLoading } = useEarlyBirdCounters();
  const createCoupon = useCreateSubscriptionCoupon();
  const updateCoupon = useUpdateSubscriptionCoupon();
  const deleteCoupon = useDeleteSubscriptionCoupon();
  const updateEarlyBird = useUpdateEarlyBirdCounter();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<SubscriptionCoupon | null>(null);
  const [deletingCoupon, setDeletingCoupon] = useState<SubscriptionCoupon | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    discount_type: 'percentage' as 'percentage' | 'fixed',
    discount_value: 10,
    max_uses: '',
    is_first_subscription_only: true,
    valid_for_plans: ['monthly', 'annual', 'vip'] as string[],
    expires_at: '',
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      discount_type: 'percentage',
      discount_value: 10,
      max_uses: '',
      is_first_subscription_only: true,
      valid_for_plans: ['monthly', 'annual', 'vip'],
      expires_at: '',
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateCoupon = () => {
    createCoupon.mutate(
      {
        code: formData.code.toUpperCase(),
        name: formData.name,
        description: formData.description || undefined,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : undefined,
        is_first_subscription_only: formData.is_first_subscription_only,
        valid_for_plans: formData.valid_for_plans,
        expires_at: formData.expires_at || undefined,
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          resetForm();
        },
      }
    );
  };

  const handleUpdateCoupon = () => {
    if (!editingCoupon) return;

    updateCoupon.mutate(
      {
        id: editingCoupon.id,
        updates: {
          name: formData.name,
          description: formData.description || null,
          discount_type: formData.discount_type,
          discount_value: formData.discount_value,
          max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
          is_first_subscription_only: formData.is_first_subscription_only,
          valid_for_plans: formData.valid_for_plans,
          expires_at: formData.expires_at || null,
        },
      },
      {
        onSuccess: () => {
          setEditingCoupon(null);
          resetForm();
        },
      }
    );
  };

  const handleEdit = (coupon: SubscriptionCoupon) => {
    setFormData({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description || '',
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      max_uses: coupon.max_uses?.toString() || '',
      is_first_subscription_only: coupon.is_first_subscription_only,
      valid_for_plans: coupon.valid_for_plans,
      expires_at: coupon.expires_at || '',
    });
    setEditingCoupon(coupon);
  };

  const handleTogglePlan = (plan: string) => {
    setFormData(prev => ({
      ...prev,
      valid_for_plans: prev.valid_for_plans.includes(plan)
        ? prev.valid_for_plans.filter(p => p !== plan)
        : [...prev.valid_for_plans, plan],
    }));
  };

  if (couponsLoading || earlyBirdLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const monthlyCounter = earlyBirdCounters?.find(c => c.counter_type === 'monthly');
  const annualCounter = earlyBirdCounters?.find(c => c.counter_type === 'annual');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Ticket className="h-6 w-6 sm:h-7 sm:w-7 text-[#FF007F]" />
            Cupons de Assinatura
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie cupons promocionais e a oferta "1000 Primeiros"
          </p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-[#FF007F] hover:bg-[#FF007F]/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Cupom
        </Button>
      </div>

      <Tabs defaultValue="coupons" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="coupons" className="gap-2">
            <Ticket className="h-4 w-4" />
            Cupons
          </TabsTrigger>
          <TabsTrigger value="earlybird" className="gap-2">
            <Flame className="h-4 w-4" />
            Early Bird
          </TabsTrigger>
        </TabsList>

        {/* Tab Cupons */}
        <TabsContent value="coupons" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-foreground">
                  {coupons?.length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Total de Cupons</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-emerald-500">
                  {coupons?.filter(c => c.is_active).length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Cupons Ativos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-[#FF007F]">
                  {coupons?.reduce((acc, c) => acc + c.current_uses, 0) || 0}
                </div>
                <p className="text-xs text-muted-foreground">Usos Totais</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-[hsl(45,93%,47%)]">
                  {coupons?.filter(c => c.is_first_subscription_only).length || 0}
                </div>
                <p className="text-xs text-muted-foreground">Primeira Assinatura</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Cupons */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cupons Cadastrados</CardTitle>
            </CardHeader>
            <CardContent>
              {!coupons?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ticket className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum cupom cadastrado</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => setIsCreateOpen(true)}
                  >
                    Criar primeiro cupom
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {coupons.map(coupon => (
                    <div
                      key={coupon.id}
                      className={cn(
                        "flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border transition-all",
                        coupon.is_active
                          ? "bg-card border-border/50"
                          : "bg-muted/50 border-muted opacity-60"
                      )}
                    >
                      {/* Código */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-[#FF007F]/10 flex items-center justify-center">
                          {coupon.discount_type === 'percentage' ? (
                            <Percent className="h-5 w-5 text-[#FF007F]" />
                          ) : (
                            <DollarSign className="h-5 w-5 text-[#FF007F]" />
                          )}
                        </div>
                        <div>
                          <button
                            onClick={() => handleCopyCode(coupon.code)}
                            className="flex items-center gap-2 font-mono font-bold text-lg hover:text-[#FF007F] transition-colors"
                          >
                            {coupon.code}
                            {copiedCode === coupon.code ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Copy className="h-4 w-4 opacity-50" />
                            )}
                          </button>
                          <p className="text-sm text-muted-foreground">{coupon.name}</p>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[#FF007F] border-[#FF007F]/30">
                          {coupon.discount_type === 'percentage'
                            ? `${coupon.discount_value}% OFF`
                            : `R$ ${coupon.discount_value} OFF`}
                        </Badge>
                        {coupon.is_first_subscription_only && (
                          <Badge variant="secondary">1ª Assinatura</Badge>
                        )}
                        {coupon.max_uses && (
                          <Badge variant="outline">
                            {coupon.current_uses}/{coupon.max_uses} usos
                          </Badge>
                        )}
                        {coupon.expires_at && (
                          <Badge variant="outline" className="gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(coupon.expires_at), 'dd/MM/yy', { locale: ptBR })}
                          </Badge>
                        )}
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={coupon.is_active}
                          onCheckedChange={(checked) =>
                            updateCoupon.mutate({ id: coupon.id, updates: { is_active: checked } })
                          }
                          className="data-[state=checked]:bg-[#FF007F]"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(coupon)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeletingCoupon(coupon)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Early Bird */}
        <TabsContent value="earlybird" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Contador Mensal */}
            {monthlyCounter && (
              <Card className="border-[#FF007F]/30">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-[#FF007F]" />
                      Plano Mensal
                    </span>
                    <Switch
                      checked={monthlyCounter.is_active}
                      onCheckedChange={(checked) =>
                        updateEarlyBird.mutate({
                          id: monthlyCounter.id,
                          updates: { is_active: checked },
                        })
                      }
                      className="data-[state=checked]:bg-[#FF007F]"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-4xl font-black text-[#FF007F]">
                      {monthlyCounter.max_count - monthlyCounter.current_count}
                    </div>
                    <p className="text-sm text-muted-foreground">vagas restantes</p>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-[#FF007F] transition-all"
                        style={{
                          width: `${((monthlyCounter.max_count - monthlyCounter.current_count) / monthlyCounter.max_count) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {monthlyCounter.current_count} de {monthlyCounter.max_count} utilizados
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-[#FF007F]/10 border border-[#FF007F]/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Bônus</span>
                      <span className="text-lg font-bold text-[#FF007F]">
                        +{monthlyCounter.bonus_months} meses grátis
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Assinantes ganham {1 + monthlyCounter.bonus_months} meses pagando apenas 1
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Contador Anual */}
            {annualCounter && (
              <Card className="border-[hsl(45,93%,47%)]/30">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Flame className="h-5 w-5 text-[hsl(45,93%,47%)]" />
                      Plano Anual
                    </span>
                    <Switch
                      checked={annualCounter.is_active}
                      onCheckedChange={(checked) =>
                        updateEarlyBird.mutate({
                          id: annualCounter.id,
                          updates: { is_active: checked },
                        })
                      }
                      className="data-[state=checked]:bg-[hsl(45,93%,47%)]"
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-4xl font-black text-[hsl(45,93%,47%)]">
                      {annualCounter.max_count - annualCounter.current_count}
                    </div>
                    <p className="text-sm text-muted-foreground">vagas restantes</p>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-[hsl(45,93%,47%)] transition-all"
                        style={{
                          width: `${((annualCounter.max_count - annualCounter.current_count) / annualCounter.max_count) * 100}%`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {annualCounter.current_count} de {annualCounter.max_count} utilizados
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Bônus</span>
                      <span className="text-lg font-bold text-[hsl(45,93%,47%)]">
                        +{annualCounter.bonus_months} meses grátis
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Assinantes ganham {12 + annualCounter.bonus_months} meses pagando apenas 12
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Dica */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Settings className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Como funciona?</p>
                  <p>
                    Quando um usuário assina um plano, o sistema verifica automaticamente se há vagas
                    disponíveis na promoção "1000 Primeiros". Se houver, o usuário recebe os meses
                    bônus e a vaga é contabilizada.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal Criar/Editar Cupom */}
      <Dialog
        open={isCreateOpen || !!editingCoupon}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false);
            setEditingCoupon(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCoupon ? 'Editar Cupom' : 'Novo Cupom de Assinatura'}
            </DialogTitle>
            <DialogDescription>
              Cupons de assinatura funcionam apenas para planos, não para compra de mídia avulsa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!editingCoupon && (
              <div className="space-y-2">
                <Label>Código do Cupom</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="BEMVINDO10"
                  className="font-mono uppercase"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Nome do Cupom</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Boas-vindas 10%"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição (opcional)</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Desconto para novos assinantes"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Desconto</Label>
                <Select
                  value={formData.discount_type}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, discount_type: v as 'percentage' | 'fixed' }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor do Desconto</Label>
                <Input
                  type="number"
                  value={formData.discount_value}
                  onChange={(e) => setFormData(prev => ({ ...prev, discount_value: parseFloat(e.target.value) || 0 }))}
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Limite de Usos (opcional)</Label>
              <Input
                type="number"
                value={formData.max_uses}
                onChange={(e) => setFormData(prev => ({ ...prev, max_uses: e.target.value }))}
                placeholder="Sem limite"
                min={1}
              />
            </div>

            <div className="space-y-2">
              <Label>Data de Expiração (opcional)</Label>
              <Input
                type="datetime-local"
                value={formData.expires_at}
                onChange={(e) => setFormData(prev => ({ ...prev, expires_at: e.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <Label>Válido para Planos</Label>
              <div className="flex flex-wrap gap-4">
                {['monthly', 'annual', 'vip'].map(plan => (
                  <div key={plan} className="flex items-center gap-2">
                    <Checkbox
                      checked={formData.valid_for_plans.includes(plan)}
                      onCheckedChange={() => handleTogglePlan(plan)}
                    />
                    <Label className="text-sm font-normal capitalize">{plan}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Checkbox
                checked={formData.is_first_subscription_only}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, is_first_subscription_only: !!checked }))
                }
              />
              <div>
                <Label className="font-medium">Apenas primeira assinatura</Label>
                <p className="text-xs text-muted-foreground">
                  O cupom só funcionará para usuários que nunca assinaram antes
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false);
                setEditingCoupon(null);
                resetForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={editingCoupon ? handleUpdateCoupon : handleCreateCoupon}
              disabled={createCoupon.isPending || updateCoupon.isPending}
              className="bg-[#FF007F] hover:bg-[#FF007F]/90"
            >
              {(createCoupon.isPending || updateCoupon.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingCoupon ? 'Salvar' : 'Criar Cupom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão */}
      <AlertDialog open={!!deletingCoupon} onOpenChange={(open) => !open && setDeletingCoupon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cupom?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o cupom "{deletingCoupon?.code}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCoupon && deleteCoupon.mutate(deletingCoupon.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
