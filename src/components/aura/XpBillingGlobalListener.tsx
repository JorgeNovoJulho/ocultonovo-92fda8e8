import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useQuery } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/useUserRoles';

/**
 * XpBillingGlobalListener — Listener global para monitorar a Chave Geral de XP.
 * Expõe o estado global para outros componentes via window ou cache se necessário,
 * mas o uso principal aqui é garantir que o estado seja buscado.
 */
export function XpBillingGlobalListener() {
  const { data: isAdmin } = useIsAdmin();
  const { data: globalConfig } = useQuery({
    queryKey: ['aura-xp-global-config'],
    enabled: !!isAdmin, // só admin precisa do flag em window — UI gating não depende disso
    queryFn: async () => {
      const { data } = await supabase.from('aura_xp_global_config').select('billing_enabled').maybeSingle();
      return data;
    },
    // Config muda raramente — sem polling, cache 10 min, revalida no foco.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (globalConfig) {
      (window as any).__XP_BILLING_ENABLED = globalConfig.billing_enabled;
    }
  }, [globalConfig]);

  return null;
}
