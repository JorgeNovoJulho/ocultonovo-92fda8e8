import { useState } from 'react';
import { ClipboardCheck, RotateCcw, Eye, Users, Crown, Sparkles, UserX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useQAChecklist, PlanType, ChecklistItem } from '@/hooks/useQAChecklists';
import { useImpersonation } from '@/hooks/useImpersonation';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { cn } from '@/lib/utils';

const PLAN_CONFIG: Record<PlanType, { label: string; icon: React.ElementType; color: string; description: string }> = {
  visitor: {
    label: 'Visitante',
    icon: UserX,
    color: 'text-muted-foreground',
    description: 'Usuário não autenticado (Spy Mode)',
  },
  free: {
    label: 'Gratuito',
    icon: Users,
    color: 'text-blue-500',
    description: 'Usuário cadastrado sem assinatura',
  },
  premium: {
    label: 'Premium',
    icon: Sparkles,
    color: 'text-purple-500',
    description: 'Assinante mensal com acesso completo',
  },
  vip: {
    label: 'VIP',
    icon: Crown,
    color: 'text-amber-500',
    description: 'Assinante VIP com benefícios exclusivos',
  },
};

function PlanChecklist({ planType }: { planType: PlanType }) {
  const { checklist, isLoading, toggleItem, resetChecklist, getProgress, isUpdating } = useQAChecklist(planType);
  const { impersonateUser, isLoading: isImpersonating } = useImpersonation();
  const { data: users } = useAdminUsers({ statusFilter: 'active' });

  const config = PLAN_CONFIG[planType];
  const Icon = config.icon;
  const progress = getProgress();

  // Find a test user with matching plan
  const testUser = users?.find(u => {
    if (planType === 'visitor') return false;
    return u.plan_type === planType || (planType === 'free' && !u.plan_type);
  });

  const handleTestAs = async () => {
    if (planType === 'visitor') {
      // For visitor, just navigate to spy mode
      window.open('/spy', '_blank');
      return;
    }

    if (testUser) {
      await impersonateUser({
        id: testUser.id,
        user_id: testUser.user_id,
        name: testUser.name,
        username: testUser.username || undefined,
        plan_type: testUser.plan_type || 'free',
        avatar_url: testUser.avatar_url || undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const checklistItems = checklist?.checklist_data 
    ? Object.values(checklist.checklist_data as Record<string, ChecklistItem>)
    : [];

  // Group by category
  const groupedItems = checklistItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  return (
    <div className="space-y-6">
      {/* Header with Progress */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg bg-muted', config.color)}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{config.label}</h3>
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">
              {progress.completed}/{progress.total} verificados
            </p>
            <Progress value={progress.percentage} className="w-32 h-2" />
          </div>
          <Badge variant={progress.percentage === 100 ? 'default' : 'secondary'}>
            {progress.percentage}%
          </Badge>
        </div>
      </div>

      <Separator />

      {/* Checklist Items by Category */}
      <div className="space-y-6">
        {Object.entries(groupedItems).map(([category, items]) => (
          <div key={category} className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {category}
            </h4>
            <div className="grid gap-2">
              {items.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    item.checked 
                      ? 'bg-primary/5 border-primary/30' 
                      : 'bg-card hover:bg-muted/50'
                  )}
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(item.id)}
                    disabled={isUpdating}
                  />
                  <span className={cn(
                    'flex-1 text-sm',
                    item.checked && 'line-through text-muted-foreground'
                  )}>
                    {item.label}
                  </span>
                  {item.checked && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      ✓
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Separator />

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="default"
          onClick={handleTestAs}
          disabled={isImpersonating || (planType !== 'visitor' && !testUser)}
          className="gap-2"
        >
          <Eye className="h-4 w-4" />
          {planType === 'visitor' ? 'Abrir Spy Mode' : `Testar como ${config.label}`}
        </Button>
        
        <Button
          variant="outline"
          onClick={resetChecklist}
          disabled={isUpdating}
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Resetar Checklist
        </Button>
      </div>

      {planType !== 'visitor' && !testUser && (
        <p className="text-sm text-muted-foreground">
          ⚠️ Nenhum usuário com plano {config.label.toLowerCase()} encontrado para teste.
        </p>
      )}
    </div>
  );
}

export default function AdminQualityControlPage() {
  const [activeTab, setActiveTab] = useState<PlanType>('visitor');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ClipboardCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Centro de Controle de Qualidade</h1>
          <p className="text-muted-foreground">
            Valide funcionalidades críticas por tipo de plano
          </p>
        </div>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <CardTitle>Checklists por Plano</CardTitle>
          <CardDescription>
            Selecione um tipo de plano para verificar as funcionalidades correspondentes.
            Use o botão "Testar como" para impersonificar um usuário real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PlanType)}>
            <TabsList className="grid grid-cols-4 w-full mb-6">
              {(Object.keys(PLAN_CONFIG) as PlanType[]).map((plan) => {
                const config = PLAN_CONFIG[plan];
                const Icon = config.icon;
                return (
                  <TabsTrigger key={plan} value={plan} className="gap-2">
                    <Icon className={cn('h-4 w-4', config.color)} />
                    <span className="hidden sm:inline">{config.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(Object.keys(PLAN_CONFIG) as PlanType[]).map((plan) => (
              <TabsContent key={plan} value={plan}>
                <PlanChecklist planType={plan} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(PLAN_CONFIG) as PlanType[]).map((plan) => {
          const config = PLAN_CONFIG[plan];
          const Icon = config.icon;
          return (
            <Card key={plan} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setActiveTab(plan)}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn('p-2 rounded-lg bg-muted', config.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{config.label}</p>
                  <p className="text-xs text-muted-foreground">Ver checklist</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
