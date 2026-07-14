/**
 * AdminAuraXpEconomyPage — Painel master para configurar a economia de XP.
 * Permite configurar custos de XP para ferramentas, menus e botões.
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Zap, Save, Menu, Wrench, MousePointer2, Settings2 } from 'lucide-react';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';

interface XpConfig {
  action_key: string;
  actor_cost: number;
  receiver_reward: number;
  enabled: boolean;
  description: string | null;
  category: string;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: any }> = {
  menu: { label: 'Menus Laterais', icon: Menu },
  tool: { label: 'Ferramentas', icon: Wrench },
  action_button: { label: 'Botões de Ação', icon: MousePointer2 },
  interaction: { label: 'Interações', icon: Zap },
};

const isAbortError = (err: unknown) => {
  const name = (err as any)?.name ?? '';
  const message = String((err as any)?.message ?? '');
  return name === 'AbortError' || /aborted|signal is aborted/i.test(message);
};

export default function AdminAuraXpEconomyPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: isMaster, isLoading: loadingMaster } = useIsMasterAdmin();
  
  const [globalBilling, setGlobalBilling] = useState<boolean>(true);
  const [configs, setConfigs] = useState<XpConfig[]>([]);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingItem, setSavingItem] = useState<string | null>(null);

  // Carregar configuração global
  const { data: globalConfig, refetch: refetchGlobal } = useQuery({
    queryKey: ['aura-xp-global-config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('aura_xp_global_config').select('*').maybeSingle();
      if (error) console.error('Error loading global config:', error);
      return data;
    },
  });

  // Carregar itens configuráveis
  const { data: itemsCatalog, isLoading: loadingItems, refetch: refetchItems } = useQuery({
    queryKey: ['aura-xp-admin-features'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('aura_xp_admin_features_list');
      if (error) {
        console.error('Error calling aura_xp_admin_features_list:', error);
        throw error;
      }
      return (data ?? []) as XpConfig[];
    },
  });

  useEffect(() => {
    if (globalConfig) setGlobalBilling(globalConfig.billing_enabled);
  }, [globalConfig]);

  useEffect(() => {
    if (itemsCatalog) setConfigs(itemsCatalog);
  }, [itemsCatalog]);

  if (loadingMaster) return <div className="p-12 text-center text-muted-foreground animate-pulse">Verificando permissões...</div>;
  if (!isMaster) return (
    <div className="container py-20 text-center space-y-4">
      <Zap className="h-12 w-12 text-destructive mx-auto opacity-20" />
      <h2 className="text-xl font-bold text-destructive">Acesso Negado</h2>
      <p className="text-muted-foreground">Esta área é restrita ao administrador master @ocultomaster.</p>
    </div>
  );

  const handleToggleGlobal = async (enabled: boolean) => {
    setSavingGlobal(true);
    setGlobalBilling(enabled);
    
    try {
      const { error } = await supabase
        .from('aura_xp_global_config')
        .update({ billing_enabled: enabled })
        .filter('billing_enabled', 'neq', enabled); // Try to update the row that has a different value
      
      if (error) throw error;
      
      toast({ 
        title: enabled ? '🚀 Economia de XP Ativada' : '🛑 Economia de XP Desativada',
        description: enabled ? 'Todas as cobranças individuais agora estão valendo.' : 'Todas as funções agora são gratuitas temporariamente.'
      });
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar chave geral', description: err.message, variant: 'destructive' });
      setGlobalBilling(!enabled);
    } finally {
      setSavingGlobal(false);
      refetchGlobal({ cancelRefetch: false, throwOnError: false }).catch((err) => {
        if (!isAbortError(err)) console.warn('[Aura XP Admin] Falha ao revalidar chave global:', err);
      });
    }
  };

  const updateConfigState = (key: string, patch: Partial<XpConfig>) => {
    setConfigs(prev => prev.map(c => c.action_key === key ? { ...c, ...patch } : c));
  };

  const refreshItemsSilently = async () => {
    try {
      await refetchItems({ cancelRefetch: false, throwOnError: false });
    } catch (err) {
      if (!isAbortError(err)) console.warn('[Aura XP Admin] Falha ao revalidar catálogo:', err);
    }
  };

  const saveConfig = async (config: XpConfig, overrides?: Partial<XpConfig>) => {
    const merged = { ...config, ...(overrides ?? {}) };
    setSavingItem(merged.action_key);

    updateConfigState(merged.action_key, merged);
    qc.setQueryData(['aura-xp-admin-features'], (prev: XpConfig[] | undefined) =>
      (prev ?? []).map((item) => item.action_key === merged.action_key ? { ...item, ...merged } : item)
    );

    try {
      const { error } = await (supabase as any).rpc('aura_xp_interaction_config_upsert', {
        p_action_key: merged.action_key,
        p_actor_cost: Number(merged.actor_cost),
        p_enabled: merged.enabled,
        p_category: merged.category,
        p_description: merged.description
      });

      if (error) throw error;

      toast({ title: '✅ Configuração salva', description: `${merged.description || merged.action_key} atualizado.` });
      void refreshItemsSilently();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err?.message || 'Falha ao salvar a configuração.', variant: 'destructive' });
      await refreshItemsSilently();
    } finally {
      setSavingItem(null);
    }
  };

  const handleToggleItem = (config: XpConfig, enabled: boolean) => {
    void saveConfig(config, { enabled });
  };

  const groupedConfigs = configs.reduce((acc, config) => {
    if (!acc[config.category]) acc[config.category] = [];
    acc[config.category].push(config);
    return acc;
  }, {} as Record<string, XpConfig[]>);

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-card border rounded-xl shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-400" />
            Economia de XP e Aura
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie cobranças de XP em todas as ferramentas e funcionalidades do sistema.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-muted/50 p-3 rounded-lg border">
          <div className="flex flex-col">
            <span className="text-sm font-bold">Chave Geral de XP</span>
            <span className="text-[10px] text-muted-foreground uppercase">Habilitar todas as cobranças</span>
          </div>
          <Switch 
            checked={globalBilling} 
            onCheckedChange={handleToggleGlobal}
            disabled={savingGlobal}
            className="data-[state=checked]:bg-amber-500"
          />
        </div>
      </header>

      <Tabs defaultValue="menu" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1 bg-muted/30">
          {Object.entries(CATEGORY_LABELS).map(([id, info]) => (
            <TabsTrigger key={id} value={id} className="gap-2 py-2">
              <info.icon className="h-4 w-4" />
              <span className="hidden md:inline">{info.label}</span>
              <span className="md:hidden">{info.label.split(' ')[0]}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.keys(CATEGORY_LABELS).map(catId => (
          <TabsContent key={catId} value={catId} className="space-y-4 mt-6">
            {loadingItems ? (
              <div className="p-12 text-center text-muted-foreground animate-pulse">
                Carregando catálogo de ferramentas...
              </div>
            ) : !groupedConfigs[catId]?.length ? (
              <div className="p-12 text-center border-2 border-dashed rounded-xl text-muted-foreground">
                Nenhum item encontrado para a categoria <strong>{CATEGORY_LABELS[catId].label}</strong>.
              </div>
            ) : null}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groupedConfigs[catId]?.map((config) => (
                <Card key={config.action_key} className="overflow-hidden border-border/60 hover:border-amber-500/30 transition-colors">
                  <div className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="font-bold text-sm uppercase tracking-tight">{config.action_key}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{config.description}</div>
                      </div>
                      <Switch 
                        checked={config.enabled} 
                        onCheckedChange={(v) => handleToggleItem(config, v)}
                        disabled={!globalBilling || savingItem === config.action_key}
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-500/70">XP</span>
                        <Input 
                          type="number" 
                          value={config.actor_cost}
                          onChange={(e) => updateConfigState(config.action_key, { actor_cost: parseInt(e.target.value) || 0 })}
                          className="pl-8 bg-muted/20 border-muted-foreground/20"
                          placeholder="Custo XP"
                          disabled={!globalBilling}
                        />
                      </div>
                      <Button 
                        size="sm" 
                        variant={config.enabled ? "default" : "outline"}
                        onClick={() => saveConfig(config)}
                        disabled={savingItem === config.action_key || !globalBilling}
                        className="gap-2 shrink-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Salvar
                      </Button>
                    </div>
                  </div>
                  {!globalBilling && (
                    <div className="bg-destructive/5 border-t px-4 py-1.5 flex items-center gap-2 text-[10px] text-destructive font-medium italic">
                      <Settings2 className="h-3 w-3" />
                      Cobranças suspensas pela Chave Geral
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
      
      <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/70 leading-relaxed">
        <strong>Nota do Sistema:</strong> Quando a "Chave Geral de XP" está desligada, o sistema ignora todas as cobranças de XP individuais listadas acima. 
        As preferências de cada item (valor e se está ativo) permanecem salvas para quando a chave for ligada novamente.
      </div>
    </div>
  );
}

