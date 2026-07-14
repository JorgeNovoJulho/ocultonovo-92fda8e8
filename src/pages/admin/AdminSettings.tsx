/**
 * Página de Configurações do Admin
 * Gerencia configurações globais do sistema, taxas, afiliados e dados de teste
 */
import { useState, useEffect } from "react";
import { 
  Settings, 
  AlertTriangle, 
  Power, 
  UserX, 
  Wallet,
  Save,
  Loader2,
  RefreshCw,
  Users,
  Trash2,
  Sparkles,
  ImageIcon,
  Heart,
  Rocket,
  CheckCircle,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSystemSettings, useUpdateSetting } from "@/hooks/useSystemSettings";
import { useGenerateSeedData, usePurgeSeedData, useSeedDataStats } from "@/hooks/useSeedData";
import { useAudit } from "@/hooks/useAudit";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseExternal";
import { BackupSection } from "@/components/admin/BackupSection";
import { BackupMonitoringDashboard } from "@/components/admin/BackupMonitoringDashboard";
import { FreePlanLimitsSection } from "@/components/admin/FreePlanLimitsSection";
import { PlanLimitsManagerCard } from "@/components/admin/PlanLimitsManagerCard";
import { UsageAnalyticsCard } from "@/components/admin/UsageAnalyticsCard";
import { OnlineCounterConfigCard } from "@/components/admin/OnlineCounterConfigCard";
import { KillSwitchCard } from "@/components/admin/KillSwitchCard";
import { FlashSaleCard } from "@/components/admin/FlashSaleCard";
import { AsaasTestPixCard } from "@/components/admin/AsaasTestPixCard";

export default function AdminSettings() {
  const { data: settings, isLoading, refetch } = useSystemSettings();
  const updateSetting = useUpdateSetting();
  const generateSeedData = useGenerateSeedData();
  const purgeSeedData = usePurgeSeedData();
  const seedStats = useSeedDataStats();
  const { logAction } = useAudit();
  
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [isCheckingMilestone, setIsCheckingMilestone] = useState(false);
  
  // Estado para barra de progresso da geração de seed
  const [seedProgress, setSeedProgress] = useState({ stage: '', percent: 0 });

  const [localSettings, setLocalSettings] = useState({
    maintenanceMode: false,
    pauseSignups: false,
    blockWithdrawals: false,
    platformFee: 20,
    taxPercentage: 6,
    affiliateCommission: 5,
    minWithdrawal: 250,
    maxMonthlyWithdrawals: 3,
  });


  // Load seed stats on mount
  useEffect(() => {
    seedStats.mutate();
  }, []);

  useEffect(() => {
    if (settings) {
      setLocalSettings({
        maintenanceMode: settings['maintenance_mode']?.value === 'true',
        pauseSignups: settings['pause_signups']?.value === 'true',
        blockWithdrawals: settings['block_withdrawals']?.value === 'true',
        platformFee: parseFloat(String(settings['platform_fee_percentage']?.value || '20')),
        taxPercentage: parseFloat(String(settings['tax_percentage']?.value || '6')),
        affiliateCommission: parseFloat(String(settings['affiliate_commission_percentage']?.value || '5')),
        minWithdrawal: parseFloat(String(settings['min_withdrawal_amount']?.value || '250')),
        maxMonthlyWithdrawals: parseInt(String(settings['max_monthly_withdrawals']?.value || '3')),
      });
    }
  }, [settings]);

  const handleToggle = async (key: string, dbKey: string, value: boolean) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    
    try {
      await updateSetting.mutateAsync({ key: dbKey, value });
      
      const messages: Record<string, { on: string; off: string }> = {
        maintenance_mode: {
          on: "Modo manutenção ativado. Usuários verão tela de manutenção.",
          off: "Modo manutenção desativado. Plataforma funcionando normalmente.",
        },
        pause_signups: {
          on: "Novos cadastros pausados. Usuários não podem se registrar.",
          off: "Novos cadastros liberados.",
        },
        block_withdrawals: {
          on: "Saques bloqueados globalmente.",
          off: "Saques liberados.",
        },
      };

      toast({
        title: value ? "⚠️ Configuração Ativada" : "✓ Configuração Desativada",
        description: value ? messages[dbKey]?.on : messages[dbKey]?.off,
        variant: value ? "destructive" : "default",
      });
    } catch (error) {
      // Revert on error
      setLocalSettings(prev => ({ ...prev, [key]: !value }));
    }
  };

  const handleSaveNumericSettings = async () => {
    try {
      await Promise.all([
        updateSetting.mutateAsync({ 
          key: 'platform_fee_percentage', 
          value: localSettings.platformFee 
        }),
        updateSetting.mutateAsync({ 
          key: 'tax_percentage', 
          value: localSettings.taxPercentage 
        }),
        updateSetting.mutateAsync({ 
          key: 'affiliate_commission_percentage', 
          value: localSettings.affiliateCommission 
        }),
        updateSetting.mutateAsync({ 
          key: 'min_withdrawal_amount', 
          value: localSettings.minWithdrawal 
        }),
        updateSetting.mutateAsync({ 
          key: 'max_monthly_withdrawals', 
          value: localSettings.maxMonthlyWithdrawals 
        }),
      ]);

      toast({
        title: "Configurações salvas",
        description: "Taxas e valores atualizados com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configurações do Sistema</h1>
          <p className="text-muted-foreground">Controles globais da plataforma (persistidos no banco)</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </Button>
      </div>

      {/* System Toggles */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Power className="h-5 w-5" />
            Controles Globais
          </CardTitle>
          <CardDescription>
            Ative ou desative funcionalidades críticas da plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Maintenance Mode */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${localSettings.maintenanceMode ? 'bg-destructive/20' : 'bg-muted'}`}>
                <Settings className={`h-5 w-5 ${localSettings.maintenanceMode ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium">Modo Manutenção</p>
                <p className="text-sm text-muted-foreground">
                  Exibe tela de manutenção para todos os usuários
                </p>
              </div>
            </div>
            <Switch
              checked={localSettings.maintenanceMode}
              onCheckedChange={(checked) => handleToggle('maintenanceMode', 'maintenance_mode', checked)}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Pause Signups */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${localSettings.pauseSignups ? 'bg-[hsl(45,93%,47%)]/20' : 'bg-muted'}`}>
                <UserX className={`h-5 w-5 ${localSettings.pauseSignups ? 'text-[hsl(45,93%,47%)]' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium">Pausar Novos Cadastros</p>
                <p className="text-sm text-muted-foreground">
                  Impede novos usuários de se registrarem
                </p>
              </div>
            </div>
            <Switch
              checked={localSettings.pauseSignups}
              onCheckedChange={(checked) => handleToggle('pauseSignups', 'pause_signups', checked)}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Withdrawals */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${localSettings.blockWithdrawals ? 'bg-destructive/20' : 'bg-muted'}`}>
                <Wallet className={`h-5 w-5 ${localSettings.blockWithdrawals ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium">Bloquear Saques (Global)</p>
                <p className="text-sm text-muted-foreground">
                  Impede todos os criadores de solicitarem saques
                </p>
              </div>
            </div>
            <Switch
              checked={localSettings.blockWithdrawals}
              onCheckedChange={(checked) => handleToggle('blockWithdrawals', 'block_withdrawals', checked)}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Warning */}
          {(localSettings.maintenanceMode || localSettings.pauseSignups || localSettings.blockWithdrawals) && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Atenção</p>
                <p className="text-sm text-destructive/80">
                  Você tem configurações restritivas ativas que afetam os usuários.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kill Switch - Desconexão Forçada */}
      <KillSwitchCard />

      {/* Flash Sale - Desconto Temporário */}
      <FlashSaleCard />

      {/* Free Plan Limits */}
      <FreePlanLimitsSection />

      {/* Planos: permissões e limites por feature (free / premium / vip) */}
      <PlanLimitsManagerCard />

      {/* Observabilidade de uso/rate-limit */}
      <UsageAnalyticsCard />

      {/* Online Counter Configuration */}
      <OnlineCounterConfigCard />

      {/* Financial Settings */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Configurações Financeiras
          </CardTitle>
          <CardDescription>
            Taxas e valores da plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Split rule summary */}
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-sm font-medium mb-2">Regra de Split — Conteúdo Pago (PPV)</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="px-2 py-1 rounded bg-primary/10 text-primary font-semibold">
                {localSettings.platformFee}% Plataforma
              </span>
              <span className="px-2 py-1 rounded bg-orange-500/10 text-orange-500 font-semibold">
                {localSettings.taxPercentage}% Impostos
              </span>
              <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 font-semibold">
                {localSettings.affiliateCommission}% Afiliado (se houver)
              </span>
              <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 font-semibold">
                {Math.max(0, 100 - localSettings.platformFee - localSettings.taxPercentage)}% Criador
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="space-y-2">
              <Label>Taxa da Plataforma (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={localSettings.platformFee}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  platformFee: parseFloat(e.target.value) || 0 
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Porcentagem cobrada sobre cada transação
              </p>
            </div>
            <div className="space-y-2">
              <Label>Impostos (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={localSettings.taxPercentage}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  taxPercentage: parseFloat(e.target.value) || 0 
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Reserva tributária sobre conteúdo pago
              </p>
            </div>
            <div className="space-y-2">
              <Label>Comissão de Afiliados (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={localSettings.affiliateCommission}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  affiliateCommission: parseFloat(e.target.value) || 0 
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Por conteúdo vendido (se houver indicador)
              </p>
            </div>
            <div className="space-y-2">
              <Label>Saque Mínimo (R$)</Label>
              <Input
                type="number"
                min="0"
                value={localSettings.minWithdrawal}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  minWithdrawal: parseFloat(e.target.value) || 0 
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Valor mínimo para solicitar saque
              </p>
            </div>
            <div className="space-y-2">
              <Label>Saques Mensais (Máx)</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={localSettings.maxMonthlyWithdrawals}
                onChange={(e) => setLocalSettings(prev => ({ 
                  ...prev, 
                  maxMonthlyWithdrawals: parseInt(e.target.value) || 3 
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Limite de saques por mês
              </p>
            </div>
          </div>

          <Button 
            onClick={handleSaveNumericSettings} 
            className="gap-2"
            disabled={updateSetting.isPending}
          >
            {updateSetting.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Configurações Financeiras
          </Button>
        </CardContent>
      </Card>


      {/* Asaas Test PIX */}
      <AsaasTestPixCard />

      {/* Seed Data Management */}
      <Card className="bg-card border-[hsl(45,93%,47%)]/30">
        <CardHeader>
          <CardTitle className="text-lg text-[hsl(45,93%,47%)] flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Dados de Teste (Pioneiros)
          </CardTitle>
          <CardDescription>
            Gere perfis e posts de teste para popular a plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
              <Users className="h-6 w-6 mx-auto mb-2 text-emerald-500" />
              <p className="text-2xl font-bold">{seedStats.data?.profiles || 0}</p>
              <p className="text-xs text-muted-foreground">Perfis de Teste</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
              <ImageIcon className="h-6 w-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{seedStats.data?.posts || 0}</p>
              <p className="text-xs text-muted-foreground">Posts de Teste</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 text-center">
              <Heart className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{seedStats.data?.likes || 0}</p>
              <p className="text-xs text-muted-foreground">Likes de Teste</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-4">
            {/* Barra de Progresso */}
            {generateSeedData.isPending && seedProgress.stage && (
              <div className="space-y-2 p-4 rounded-lg bg-[hsl(45,93%,47%)]/5 border border-[hsl(45,93%,47%)]/30">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(45,93%,47%)] font-medium">{seedProgress.stage}</span>
                  <span className="text-muted-foreground">{seedProgress.percent}%</span>
                </div>
                <Progress value={seedProgress.percent} className="h-2" />
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => {
                  setSeedProgress({ stage: 'Iniciando...', percent: 0 });
                  generateSeedData.mutate({
                    onProgress: (stage, percent) => {
                      setSeedProgress({ stage, percent });
                    }
                  }, {
                    onSuccess: () => {
                      seedStats.mutate();
                      setSeedProgress({ stage: '', percent: 0 });
                    },
                    onError: () => {
                      setSeedProgress({ stage: '', percent: 0 });
                    }
                  });
                }}
                disabled={generateSeedData.isPending}
                className="flex-1 gap-2 bg-[hsl(45,93%,47%)] hover:bg-[hsl(45,93%,40%)] text-black"
              >
                {generateSeedData.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Gerar 50 Perfis Pioneiros
              </Button>

              <AlertDialog open={showPurgeConfirm} onOpenChange={setShowPurgeConfirm}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 border-destructive/50 text-destructive hover:bg-destructive/10"
                  disabled={(seedStats.data?.profiles || 0) === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Limpar Usuários de Teste
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Limpar Dados de Teste?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>
                      Esta ação irá remover permanentemente:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>{seedStats.data?.profiles || 0}</strong> perfis de teste</li>
                      <li><strong>{seedStats.data?.posts || 0}</strong> posts de teste</li>
                      <li><strong>{seedStats.data?.likes || 0}</strong> likes de teste</li>
                    </ul>
                    <p className="text-destructive font-medium mt-4">
                      ⚠️ Apenas dados marcados como "is_seed" serão removidos. Usuários reais NÃO serão afetados.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      purgeSeedData.mutate(undefined, {
                        onSuccess: () => {
                          seedStats.mutate();
                          setShowPurgeConfirm(false);
                        },
                      });
                    }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={purgeSeedData.isPending}
                  >
                    {purgeSeedData.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Confirmar Exclusão
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </div>

          {/* Manual Milestone Check Button */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-border/30">
            <Button
              variant="outline"
              onClick={async () => {
                setIsCheckingMilestone(true);
                try {
                  const { data, error } = await supabase.functions.invoke('check-growth-milestone');
                  
                  if (error) throw error;
                  
                  if (data.milestone_reached) {
                    toast({
                      title: "🎉 Meta Atingida!",
                      description: `${data.stats.seed_users_purged} perfis pioneiros removidos. Backup salvo.`,
                    });
                    seedStats.mutate();
                  } else {
                    toast({
                      title: "Progresso atual",
                      description: `${data.stats.real_users} de ${data.stats.target} usuários (${data.stats.progress})`,
                    });
                  }
                } catch (error) {
                  console.error('Error checking milestone:', error);
                  toast({
                    title: "Erro ao verificar",
                    description: "Não foi possível verificar a meta. Tente novamente.",
                    variant: "destructive",
                  });
                } finally {
                  setIsCheckingMilestone(false);
                }
              }}
              disabled={isCheckingMilestone || (seedStats.data?.profiles || 0) === 0}
              className="flex-1 gap-2"
            >
              {isCheckingMilestone ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              Verificar Meta 3:1 Manualmente
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            💡 Os perfis gerados possuem a tag <Badge variant="outline" className="text-xs">is_seed: true</Badge> e são invisíveis para usuários comuns no painel admin.
          </p>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="bg-card border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Zona de Perigo
          </CardTitle>
          <CardDescription>
            Ações irreversíveis que afetam toda a plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30">
            <div>
              <p className="font-medium">Limpar Cache Global</p>
              <p className="text-sm text-muted-foreground">
                Remove todo o cache da plataforma. Pode afetar performance temporariamente.
              </p>
            </div>
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
              Limpar Cache
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30">
            <div>
              <p className="font-medium">Resetar Sessões</p>
              <p className="text-sm text-muted-foreground">
                Desloga todos os usuários da plataforma imediatamente.
              </p>
            </div>
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
              Resetar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backup Monitoring Dashboard */}
      <Card>
        <CardContent className="pt-6">
          <BackupMonitoringDashboard />
        </CardContent>
      </Card>

      {/* Backup Section */}
      <BackupSection />
    </div>
  );
}
