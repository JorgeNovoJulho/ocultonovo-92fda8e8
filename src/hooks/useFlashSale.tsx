/**
 * Hook para Flash Sale - Desconto de emergência global
 * Ativa desconto temporário por 1 hora quando conversões caem
 */
import { useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSystemSettings, useUpdateSetting } from './useSystemSettings';
import { useAudit } from './useAudit';
import { toast } from '@/hooks/use-toast';

interface FlashSaleState {
  isActive: boolean;
  discount: number;
  expiresAt: Date | null;
  timeRemaining: number | null; // em segundos
}

export function useFlashSale() {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSetting();
  const { logAction } = useAudit();
  const queryClient = useQueryClient();

  // Calcular estado atual
  const state: FlashSaleState = useMemo(() => {
    if (!settings) {
      return {
        isActive: false,
        discount: 10,
        expiresAt: null,
        timeRemaining: null,
      };
    }

    const isActive = settings['flash_sale_active']?.value === 'true';
    const discount = parseInt(String(settings['flash_sale_discount']?.value || '10'));
    const expiresAtStr = settings['flash_sale_expires_at']?.value;
    const expiresAt = expiresAtStr && expiresAtStr !== 'null' 
      ? new Date(expiresAtStr as string) 
      : null;

    let timeRemaining: number | null = null;
    if (isActive && expiresAt) {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();
      timeRemaining = diff > 0 ? Math.floor(diff / 1000) : 0;
      
      // Se expirou, considerar inativo
      if (timeRemaining <= 0) {
        return {
          isActive: false,
          discount,
          expiresAt: null,
          timeRemaining: null,
        };
      }
    }

    return {
      isActive,
      discount,
      expiresAt,
      timeRemaining,
    };
  }, [settings]);

  // Ativar Flash Sale
  const activate = useMutation({
    mutationFn: async (options?: { discount?: number; durationMinutes?: number }) => {
      const discount = options?.discount || 10;
      const durationMinutes = options?.durationMinutes || 60;
      
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + durationMinutes);

      await Promise.all([
        updateSetting.mutateAsync({ key: 'flash_sale_active', value: true }),
        updateSetting.mutateAsync({ key: 'flash_sale_discount', value: discount }),
        updateSetting.mutateAsync({ key: 'flash_sale_expires_at', value: expiresAt.toISOString() }),
      ]);

      await logAction('flash_sale_activated', {
        targetResource: 'system_settings',
        details: { discount, durationMinutes, expiresAt: expiresAt.toISOString() },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: '🔥 Flash Sale Ativada!',
        description: `Desconto de ${state.discount}% ativo por 1 hora.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao ativar Flash Sale',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Desativar Flash Sale
  const deactivate = useMutation({
    mutationFn: async () => {
      await Promise.all([
        updateSetting.mutateAsync({ key: 'flash_sale_active', value: false }),
        updateSetting.mutateAsync({ key: 'flash_sale_expires_at', value: 'null' }),
      ]);

      await logAction('flash_sale_deactivated', {
        targetResource: 'system_settings',
        details: {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Flash Sale Desativada',
        description: 'Os preços voltaram ao normal.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao desativar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Atualizar desconto
  const updateDiscount = useCallback(async (newDiscount: number) => {
    await updateSetting.mutateAsync({ key: 'flash_sale_discount', value: newDiscount });
  }, [updateSetting]);

  // Aplicar desconto a um valor
  const applyDiscount = useCallback((originalPrice: number): number => {
    if (!state.isActive) return originalPrice;
    return originalPrice * (1 - state.discount / 100);
  }, [state.isActive, state.discount]);

  return {
    ...state,
    isLoading,
    activate: activate.mutate,
    deactivate: deactivate.mutate,
    updateDiscount,
    applyDiscount,
    isActivating: activate.isPending,
    isDeactivating: deactivate.isPending,
  };
}

// Hook para exibir banner de Flash Sale na UI
export function useFlashSaleBanner() {
  const { isActive, discount, timeRemaining } = useFlashSale();

  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes}min ${secs}s`;
  }, []);

  return {
    isActive,
    discount,
    timeRemainingFormatted: timeRemaining ? formatTime(timeRemaining) : null,
    message: isActive 
      ? `🔥 FLASH SALE: ${discount}% OFF - Termina em ${timeRemaining ? formatTime(timeRemaining) : '...'}` 
      : null,
  };
}
