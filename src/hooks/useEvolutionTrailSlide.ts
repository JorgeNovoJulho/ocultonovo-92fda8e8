/**
 * Trilha de Evolução — Fase C
 * Sintetiza UM "slide virtual" do próximo desbloqueio do usuário
 * baseado em dados que JÁ existem (Prestígio Social).
 * Sem novas queries pesadas, sem SQL, sem duplicar slides.
 *
 * O slide retornado é injetado no topo do carrossel apenas quando
 * houver dados reais — caso contrário retorna null e o carrossel
 * segue normalmente.
 */
import { useMemo } from 'react';
import { usePrestige } from './usePrestige';
import { useAuth } from './useAuth';
import type { DiscoverySlide } from '@/data/discoveryUniverseSlides';

export function useEvolutionTrailSlide(): DiscoverySlide | null {
  const { user } = useAuth();
  const { data } = usePrestige(user?.id || null);

  return useMemo<DiscoverySlide | null>(() => {
    if (!user?.id || !data || !data.next_name) return null;
    const pct = Math.max(0, Math.min(100, Math.round(data.progress_pct || 0)));
    const xpLeft = Math.max(0, Math.round(data.xp_to_next || 0));

    // Nome do próximo tier serve como "objetivo emocional"
    const nextTier = data.next_name;
    const goal =
      xpLeft > 0
        ? `Faltam ${xpLeft} XP para desbloquear ${nextTier} — ${pct}% do caminho`
        : `Você está prestes a desbloquear ${nextTier}`;

    return {
      id: 'virtual-evolution-trail',
      slug: 'evolution-trail',
      title: 'Sua Trilha de Evolução',
      description: `Sua presença está evoluindo. Próximo nível: ${nextTier}.`,
      ctaLabel: 'Ver Meu Prestígio',
      ctaRoute: '/profile',
      icon: 'flame',
      category: 'gamification',
      targetPlans: ['free', 'premium', 'vip'],
      priority: 999, // sempre primeiro
      isNew: false,
      missionLabel: 'Sua Evolução',
      missionGoal: goal,
      missionTarget: 100,
      campaignTag: `${pct}% • ${nextTier}`,
      campaignColor: data.glow_color || '#f59e0b',
    };
  }, [user?.id, data]);
}
