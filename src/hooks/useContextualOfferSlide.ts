/**
 * Oferta Contextual — Fase E
 * Sintetiza UM slide de oferta baseado no padrão de uso real
 * (clicks armazenados em localStorage pelo carrossel).
 * Sem queries, sem SQL, sem duplicação. Aparece como evolução natural.
 */
import { useMemo } from 'react';
import { useProfile } from './useProfile';
import type { DiscoverySlide, DiscoveryPlan } from '@/data/discoveryUniverseSlides';

const CLICKS_KEY = 'discovery_clicks_v1';

function readClicks(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CLICKS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function normalizePlan(plan: string | null | undefined): DiscoveryPlan {
  const p = (plan || 'free').toLowerCase();
  if (p === 'vip') return 'vip';
  if (p === 'premium' || p === 'standard') return 'premium';
  return 'free';
}

export function useContextualOfferSlide(): DiscoverySlide | null {
  const { profile } = useProfile();
  const plan = normalizePlan(profile?.plan_type);

  return useMemo<DiscoverySlide | null>(() => {
    const clicks = readClicks();

    // Heurística 1: usa muito salas (≥3) e é free → oferta VIP de salas
    if (plan === 'free' && (clicks['salas'] || 0) >= 3) {
      return {
        id: 'virtual-offer-rooms-vip',
        slug: 'offer-rooms-vip',
        title: 'Desbloqueie ambientes raros',
        description: 'Você sente o pulso das Salas. O VIP libera ambientes secretos, energia e prioridade.',
        ctaLabel: 'Ver Plano VIP',
        ctaRoute: '/subscriptions',
        icon: 'crown',
        category: 'plans',
        targetPlans: ['free', 'premium', 'vip'],
        priority: 950,
        isNew: false,
        campaignTag: '✦ Para você',
        campaignColor: '#a855f7',
      };
    }

    // Heurística 2: criou conteúdo (clicou em criar-post) → ative monetização
    if ((clicks['criar-post'] || 0) >= 2 && plan !== 'vip') {
      return {
        id: 'virtual-offer-monetize',
        slug: 'offer-monetize',
        title: 'Sua presença pode virar renda',
        description: 'Você já cria. Ative seu Canal VIP e monetize cada olhar atraído.',
        ctaLabel: 'Ativar Canal VIP',
        ctaRoute: '/subscriptions',
        icon: 'banknote',
        category: 'creator',
        targetPlans: ['free', 'premium', 'vip'],
        priority: 940,
        isNew: false,
        campaignTag: '🔥 Oferta inteligente',
        campaignColor: '#f59e0b',
      };
    }

    // Heurística 3: usa muito Aura Match (≥5) e nunca abriu chat → oferta de chat
    if ((clicks['aura-match'] || 0) >= 5 && (clicks['chat'] || 0) === 0) {
      return {
        id: 'virtual-offer-chat',
        slug: 'offer-chat',
        title: 'Suas conexões pedem mais',
        description: 'O Aura te trouxe presenças. Leve para o privado e aprofunde a conexão.',
        ctaLabel: 'Abrir Chat',
        ctaRoute: '/messages',
        icon: 'message-circle',
        category: 'social',
        targetPlans: ['free', 'premium', 'vip'],
        priority: 930,
        isNew: false,
        campaignTag: '💬 Próximo passo',
        campaignColor: '#ec4899',
      };
    }

    return null;
  }, [profile?.plan_type]);
}
