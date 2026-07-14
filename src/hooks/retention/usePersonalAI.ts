/**
 * usePersonalAI — Bloco 3 "IA Pessoal".
 *
 * Briefing pessoal baseado em DADOS REAIS já presentes nos hooks.
 * NÃO usa LLM. Regras explicáveis. Quando não houver sinal, gera sugestões
 * inteligentes para nunca ficar vazio.
 */
import { useMemo } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useTodayInOculto } from './useTodayInOculto';
import { useUserJourney } from './useUserJourney';

export interface PersonalAIItem {
  icon: string;
  text: string;
  href?: string;
}

export interface PersonalAIBriefing {
  greeting: string;
  name: string;
  items: PersonalAIItem[];
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function usePersonalAI(): PersonalAIBriefing {
  const { profile } = useProfile();
  const { data: today } = useTodayInOculto();
  const journey = useUserJourney();

  return useMemo<PersonalAIBriefing>(() => {
    const uname = (profile as any)?.username;
    const name = uname ? `@${uname}` : 'por aí';

    const items: PersonalAIItem[] = [];

    if (today?.counts.radarActive && today.counts.radarActive > 0) {
      items.push({
        icon: '📡',
        text: `${today.counts.radarActive} pessoa${today.counts.radarActive === 1 ? '' : 's'} ativa${today.counts.radarActive === 1 ? '' : 's'} no Radar agora`,
        href: '/radar',
      });
    }
    if (today?.counts.upcomingEvents) {
      items.push({
        icon: '🎉',
        text: `${today.counts.upcomingEvents} evento${today.counts.upcomingEvents === 1 ? '' : 's'} próximo${today.counts.upcomingEvents === 1 ? '' : 's'}`,
        href: '/events',
      });
    }
    if (today?.counts.newPlay) {
      items.push({
        icon: '🎬',
        text: `${today.counts.newPlay} novidade${today.counts.newPlay === 1 ? '' : 's'} no Oculto Play`,
        href: '/oculto-play',
      });
    }
    if (today?.counts.newCommunities) {
      items.push({
        icon: '🏘️',
        text: `${today.counts.newCommunities} tópico${today.counts.newCommunities === 1 ? '' : 's'} novo${today.counts.newCommunities === 1 ? '' : 's'} em comunidades`,
        href: '/comunidades',
      });
    }
    if (journey && journey.streakDays > 1) {
      items.push({
        icon: '🔥',
        text: `Sequência ativa: ${journey.streakDays} dias na sua Aura`,
        href: '/aura-match',
      });
    }
    if (journey && journey.auraLevel > 1) {
      items.push({
        icon: '✨',
        text: `Aura nível ${journey.auraLevel} · ${journey.auraXp} XP`,
        href: '/aura-match',
      });
    }

    // Fallback inteligente — nunca deixar vazio.
    if (items.length === 0) {
      items.push(
        { icon: '🧭', text: 'Explore o Radar e veja quem está perto', href: '/radar' },
        { icon: '💫', text: 'Faça check-in na Aura e ganhe XP hoje', href: '/aura-match' },
        { icon: '🏘️', text: 'Descubra comunidades alinhadas com você', href: '/comunidades' },
      );
    }

    return {
      greeting: `${greetingByHour()}, ${name}`,
      name,
      items: items.slice(0, 5),
    };
  }, [profile, today, journey]);
}
