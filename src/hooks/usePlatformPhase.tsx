/**
 * usePlatformPhase — hook global do Beta Control.
 * Fonte da verdade: tabela platform_runtime_settings no Supabase EXTERNO.
 * Atualiza em tempo real via canal Realtime.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';

export type PlatformMode = 'beta' | 'production' | 'maintenance';

export interface PlatformRuntime {
  id: string;
  platform_mode: PlatformMode;
  beta_enabled: boolean;
  beta_free_has_premium_social: boolean;
  beta_founders_enabled: boolean;
  monetization_enabled: boolean;
  subscriptions_enabled: boolean;
  vip_channels_enabled: boolean;
  paid_content_enabled: boolean;
  payouts_enabled: boolean;
  safe_meetings_enabled: boolean;
  whatsapp_enabled: boolean;
  real_experiences_enabled: boolean;
  launch_checklist_required: boolean;
  beta_welcome_title: string;
  beta_welcome_message: string;
  updated_at: string;
  /** Data/hora UTC em que o período de testes (Beta) termina. Null = sem prazo. */
  beta_ends_at?: string | null;
  // Canal VIP — toggles de retenção/comunidade
  vip_narrative_enabled?: boolean;
  vip_continue_reading_enabled?: boolean;
  vip_pin_enabled?: boolean;
  vip_special_reactions_enabled?: boolean;
  vip_schedule_enabled?: boolean;
  vip_share_enabled?: boolean;
  vip_analytics_enabled?: boolean;
  vip_feed_cards_enabled?: boolean;
}

const DEFAULTS: PlatformRuntime = {
  id: 'default',
  platform_mode: 'beta',
  beta_enabled: true,
  beta_free_has_premium_social: true,
  beta_founders_enabled: true,
  monetization_enabled: false,
  subscriptions_enabled: false,
  vip_channels_enabled: false,
  paid_content_enabled: false,
  payouts_enabled: false,
  safe_meetings_enabled: false,
  whatsapp_enabled: false,
  real_experiences_enabled: false,
  launch_checklist_required: true,
  beta_welcome_title: 'Você entrou no Beta do Oculto',
  beta_welcome_message: 'Plataforma em testes. Premium social liberado temporariamente.',
  updated_at: new Date().toISOString(),
  vip_narrative_enabled: true,
  vip_continue_reading_enabled: true,
  vip_pin_enabled: true,
  vip_special_reactions_enabled: true,
  vip_schedule_enabled: true,
  vip_share_enabled: true,
  vip_analytics_enabled: true,
  vip_feed_cards_enabled: true,
};


const QUERY_KEY = ['platform-runtime'];

export function usePlatformPhase() {
  const qc = useQueryClient();

  const { data } = useQuery<PlatformRuntime>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_platform_runtime');
      if (!error && data) return data as PlatformRuntime;

      // Fail-open: a RPC é só conveniência de leitura. Se EXECUTE foi revogado,
      // usa a própria tabela de runtime para não quebrar feed/stories no boot.
      const tableResult = await (supabase as any)
        .from('platform_runtime_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (!tableResult.error && tableResult.data) {
        return { ...DEFAULTS, ...(tableResult.data as Partial<PlatformRuntime>) } as PlatformRuntime;
      }
      return DEFAULTS;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const unsub = subscribeTable(
      'platform_runtime_settings',
      () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
    );
    return () => unsub();
  }, [qc]);

  const runtime = data ?? DEFAULTS;
  const isBeta = runtime.platform_mode === 'beta';
  const isProduction = runtime.platform_mode === 'production';
  const isMaintenance = runtime.platform_mode === 'maintenance';

  // Janela ativa do período de testes (Beta).
  // - Sem `beta_ends_at`: ativo enquanto o modo for "beta".
  // - Com `beta_ends_at`: ativo apenas até a data limite.
  const betaEndsAt = runtime.beta_ends_at ? new Date(runtime.beta_ends_at) : null;
  const betaExpired = !!betaEndsAt && Number.isFinite(betaEndsAt.getTime()) && betaEndsAt.getTime() <= Date.now();
  const betaActive = isBeta && !betaExpired;

  return {
    runtime,
    isBeta,
    isProduction,
    isMaintenance,
    betaEndsAt,
    betaExpired,
    /** Beta ativo (modo beta E ainda dentro do prazo, se houver). */
    betaActive,
    /** FREE recebe Premium social temporariamente durante o beta */
    freeGetsPremiumSocial: betaActive && runtime.beta_free_has_premium_social,
    /** Monetização real (qualquer cobrança/saque/assinatura paga) */
    monetizationOn: runtime.monetization_enabled,
    subscriptionsOn: runtime.subscriptions_enabled,
    paidContentOn: runtime.paid_content_enabled,
    vipChannelsOn: runtime.vip_channels_enabled,
    payoutsOn: runtime.payouts_enabled,
    safeMeetingsOn: runtime.safe_meetings_enabled,
    whatsappOn: runtime.whatsapp_enabled,
    realExperiencesOn: runtime.real_experiences_enabled,
  };
}
