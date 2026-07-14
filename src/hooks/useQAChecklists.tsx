import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export type PlanType = 'visitor' | 'free' | 'premium' | 'vip';

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  category: string;
}

export interface QAChecklist {
  id: string;
  admin_id: string;
  plan_type: PlanType;
  checklist_data: Record<string, ChecklistItem>;
  last_updated: string;
}

// Default checklist items per plan
export const DEFAULT_CHECKLIST_ITEMS: Record<PlanType, ChecklistItem[]> = {
  visitor: [
    { id: 'v1', label: 'Banner +18 aparece corretamente', checked: false, category: 'UI' },
    { id: 'v2', label: 'Feed Spy Mode funciona', checked: false, category: 'Funcionalidade' },
    { id: 'v3', label: 'Limite de 20 posts aplica blur', checked: false, category: 'Monetização' },
    { id: 'v4', label: 'CTA de cadastro aparece', checked: false, category: 'Conversão' },
    { id: 'v5', label: 'Barra de progresso Spy Mode visível', checked: false, category: 'UI' },
    { id: 'v6', label: 'Popup de conversão aparece', checked: false, category: 'Monetização' },
  ],
  free: [
    { id: 'f1', label: 'Login/Cadastro funciona', checked: false, category: 'Auth' },
    { id: 'f2', label: 'Limite de mensagens por dia aplicado', checked: false, category: 'Limites' },
    { id: 'f3', label: 'Conteúdo premium com blur', checked: false, category: 'Monetização' },
    { id: 'f4', label: 'Banner de upgrade visível', checked: false, category: 'Conversão' },
    { id: 'f5', label: 'Perfil editável', checked: false, category: 'Funcionalidade' },
    { id: 'f6', label: 'Stories visualizáveis', checked: false, category: 'Funcionalidade' },
    { id: 'f7', label: 'Notificações funcionando', checked: false, category: 'Funcionalidade' },
    { id: 'f8', label: 'Anúncios exibidos', checked: false, category: 'Monetização' },
  ],
  premium: [
    { id: 'p1', label: 'Desbloqueio de conteúdo OK', checked: false, category: 'Core' },
    { id: 'p2', label: 'Mensagens ilimitadas', checked: false, category: 'Core' },
    { id: 'p3', label: 'Badge premium visível', checked: false, category: 'UI' },
    { id: 'p4', label: 'Checkout PIX funcional', checked: false, category: 'Pagamento' },
    { id: 'p5', label: 'Checkout Cartão funcional', checked: false, category: 'Pagamento' },
    { id: 'p6', label: 'Radar funciona', checked: false, category: 'Funcionalidade' },
    { id: 'p7', label: 'Matches funcionando', checked: false, category: 'Funcionalidade' },
    { id: 'p8', label: 'Modo Fantasma disponível', checked: false, category: 'Feature' },
  ],
  vip: [
    { id: 'vip1', label: 'Todas features premium OK', checked: false, category: 'Core' },
    { id: 'vip2', label: 'Prioridade no Radar', checked: false, category: 'Feature' },
    { id: 'vip3', label: 'Badge VIP dourado visível', checked: false, category: 'UI' },
    { id: 'vip4', label: 'Sem anúncios', checked: false, category: 'Experience' },
    { id: 'vip5', label: 'Suporte prioritário', checked: false, category: 'Suporte' },
    { id: 'vip6', label: 'Destaque no perfil', checked: false, category: 'UI' },
    { id: 'vip7', label: 'Estatísticas avançadas', checked: false, category: 'Feature' },
  ],
};

function getDefaultChecklistData(planType: PlanType): Record<string, ChecklistItem> {
  const items = DEFAULT_CHECKLIST_ITEMS[planType];
  return items.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {} as Record<string, ChecklistItem>);
}

export function useQAChecklist(planType: PlanType) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: checklist, isLoading } = useQuery({
    queryKey: ['qa-checklist', planType, user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data, error } = await supabase
        .from('qa_checklists')
        .select('*')
        .eq('admin_id', user.id)
        .eq('plan_type', planType)
        .maybeSingle();

      if (error) throw error;

      // If no checklist exists, return default
      if (!data) {
        return {
          plan_type: planType,
          checklist_data: getDefaultChecklistData(planType),
          last_updated: new Date().toISOString(),
        };
      }

      // Merge with defaults to ensure all items exist
      const defaultData = getDefaultChecklistData(planType);
      const mergedData = { ...defaultData };
      
      const savedData = data.checklist_data as Record<string, unknown> | null;
      if (savedData && typeof savedData === 'object') {
        Object.keys(savedData).forEach(key => {
          if (mergedData[key] && savedData[key] && typeof savedData[key] === 'object') {
            const savedItem = savedData[key] as { checked?: boolean };
            mergedData[key] = {
              ...mergedData[key],
              checked: savedItem?.checked || false,
            };
          }
        });
      }

      return {
        ...data,
        checklist_data: mergedData,
      };
    },
    enabled: !!user,
  });

  const updateChecklist = useMutation({
    mutationFn: async (newData: Record<string, ChecklistItem>) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await (supabase as any)
        .from('qa_checklists')
        .upsert({
          admin_id: user.id,
          plan_type: planType,
          checklist_data: newData as unknown,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'admin_id,plan_type',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qa-checklist', planType] });
    },
  });

  const toggleItem = async (itemId: string) => {
    if (!checklist?.checklist_data) return;

    const currentData = checklist.checklist_data as Record<string, ChecklistItem>;
    const updatedData = {
      ...currentData,
      [itemId]: {
        ...currentData[itemId],
        checked: !currentData[itemId]?.checked,
      },
    };

    await updateChecklist.mutateAsync(updatedData);
  };

  const resetChecklist = async () => {
    const defaultData = getDefaultChecklistData(planType);
    await updateChecklist.mutateAsync(defaultData);
    toast({
      title: 'Checklist resetado',
      description: `O checklist de ${planType} foi limpo.`,
    });
  };

  const getProgress = () => {
    if (!checklist?.checklist_data) return { completed: 0, total: 0, percentage: 0 };
    
    const items = Object.values(checklist.checklist_data as Record<string, ChecklistItem>);
    const completed = items.filter(item => item.checked).length;
    const total = items.length;
    
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  };

  return {
    checklist,
    isLoading,
    toggleItem,
    resetChecklist,
    getProgress,
    isUpdating: updateChecklist.isPending,
  };
}
