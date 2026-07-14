/**
 * useExperienceSettings — leitura pública das configurações runtime
 * do painel Admin Master "Experiência do Oculto".
 *
 * Fallback robusto: se a RPC falhar (ex. SQL ainda não rodado), devolve
 * defaults seguros que mantêm o sistema funcionando.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import type { HomeViewMode, HomeSectionKey } from '@/config/homeSections';

export interface ExperienceSectionOverride {
  in_simple?: boolean;
  in_hidden_sessions?: boolean;
  customizable?: boolean;
  description?: string;
  guide_key?: string;
}

export interface ExperienceSettings {
  id: string;
  enabled: boolean;
  default_new_user_mode: HomeViewMode;
  default_existing_user_mode: HomeViewMode;
  force_migration_modal: boolean;
  hidden_sessions_enabled: boolean;
  hidden_sessions_title: string;
  hidden_sessions_description: string;
  modal_title: string;
  modal_description: string;
  simple_label: string;
  custom_label: string;
  complete_label: string;
  sections_config: Partial<Record<HomeSectionKey | string, ExperienceSectionOverride>>;
  hidden_sessions_order: string[];
}

export const DEFAULT_EXPERIENCE_SETTINGS: ExperienceSettings = {
  id: 'default',
  enabled: true,
  default_new_user_mode: 'simple',
  default_existing_user_mode: 'simple',
  force_migration_modal: true,
  hidden_sessions_enabled: true,
  hidden_sessions_title: 'Sessões Ocultas',
  hidden_sessions_description:
    'Explore stories, criadores, salas, eventos, Caixa Oculta, leilões e descobertas especiais.',
  modal_title: 'O Oculto ficou mais leve e inteligente ✨',
  modal_description:
    'Agora você pode escolher como deseja visualizar sua experiência dentro da plataforma.',
  simple_label: 'Modo Simples',
  custom_label: 'Modo Personalizado',
  complete_label: 'Universo Completo',
  sections_config: {},
  hidden_sessions_order: [],
};

export function useExperienceSettings() {
  return useQuery<ExperienceSettings>({
    queryKey: ['oculto-experience-settings-public'],
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).rpc('oculto_experience_settings_get');
        if (error || !data) return DEFAULT_EXPERIENCE_SETTINGS;
        return { ...DEFAULT_EXPERIENCE_SETTINGS, ...(data as ExperienceSettings) };
      } catch {
        return DEFAULT_EXPERIENCE_SETTINGS;
      }
    },
  });
}
