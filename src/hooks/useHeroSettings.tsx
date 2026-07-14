import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";

export interface HeroTexts {
  badge: string;
  main_title: string;
  paragraph: string;
  geo_line: string;
  cta_label: string;
  cta_primary: string;
  cta_secondary: string;
  // Legacy fields for backward compatibility
  title_line1?: string;
  title_line2?: string;
  subtitle?: string;
}

export interface TrustIndicators {
  online_count: boolean;
  anonymity_badge: boolean;
  age_verified_badge: boolean;
}

export interface HeroAdvancedSettings {
  id: string;
  background_type: 'gradient' | 'image' | 'video';
  background_image_url: string | null;
  background_video_url: string | null;
  audio_enabled: boolean;
  audio_track_day: string | null;
  audio_track_night: string | null;
  audio_default_volume: number;
  audio_visualizer_enabled: boolean;
  day_start_hour: number;
  night_start_hour: number;
  texts_day: HeroTexts;
  texts_night: HeroTexts;
  parallax_moon_speed: number;
  parallax_stars_speed: number;
  parallax_city_speed: number;
  stars_count: number;
  enable_floating_particles: boolean;
  moon_glow_intensity: number;
  moon_size: number;
  moon_position_x: number;
  moon_position_y: number;
  rotating_words: string[];
  typewriter_speed_ms: number;
  typewriter_pause_ms: number;
  enable_geo_replacement: boolean;
  geo_fallback_city: string;
  ab_test_enabled: boolean;
  ab_test_variant_b: Record<string, unknown> | null;
  trust_indicators: TrustIndicators;
  show_scroll_indicator: boolean;
  scroll_indicator_delay_ms: number;
  show_signups_today: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const defaultSettings: Omit<HeroAdvancedSettings, 'id' | 'created_at' | 'updated_at'> = {
  background_type: 'gradient',
  background_image_url: null,
  background_video_url: null,
  audio_enabled: false,
  audio_track_day: null,
  audio_track_night: null,
  audio_default_volume: 0.3,
  audio_visualizer_enabled: true,
  day_start_hour: 6,
  night_start_hour: 18,
  texts_day: {
    badge: "🚀 Lançamento Exclusivo",
    main_title: "OCULTO",
    paragraph: "A primeira plataforma que une **conteúdo exclusivo adulto +18** e **encontros reais**. Para criadores monetizarem seus conteudos, fazer renda extra e obter fãs. Para pessoas liberais interagirem entre si e promoverem encontros reais e realizar todos os seus **desejos** e **fantasias** mais ocultos.",
    geo_line: "Encontros reais em: {cidade}",
    cta_label: "COMECE AGORA GRÁTIS",
    cta_primary: "Criar Conta",
    cta_secondary: "Espiar"
  },
  texts_night: {
    badge: "🌙 Modo Noturno Ativo",
    main_title: "OCULTO",
    paragraph: "A primeira plataforma que une **conteúdo exclusivo adulto +18** e **encontros reais**. Para criadores monetizarem seus conteudos, fazer renda extra e obter fãs. Para pessoas liberais interagirem entre si e promoverem encontros reais e realizar todos os seus **desejos** e **fantasias** mais ocultos.",
    geo_line: "Encontros reais em: {cidade}",
    cta_label: "COMECE AGORA GRÁTIS",
    cta_primary: "Entrar",
    cta_secondary: "Espiar"
  },
  parallax_moon_speed: 0.15,
  parallax_stars_speed: 0.08,
  parallax_city_speed: 0.05,
  stars_count: 80,
  enable_floating_particles: true,
  moon_glow_intensity: 0.8,
  moon_size: 550,
  moon_position_x: 50,
  moon_position_y: 15,
  rotating_words: ["Ocultas", "Proibidas", "Secretas", "Íntimas"],
  typewriter_speed_ms: 100,
  typewriter_pause_ms: 2000,
  enable_geo_replacement: true,
  geo_fallback_city: "sua cidade",
  ab_test_enabled: false,
  ab_test_variant_b: {},
  trust_indicators: {
    online_count: true,
    anonymity_badge: true,
    age_verified_badge: true
  },
  show_scroll_indicator: true,
  scroll_indicator_delay_ms: 5000,
  show_signups_today: false,
  is_active: true
};

export function useHeroSettings() {
  return useQuery({
    queryKey: ['hero-advanced-settings'],
    queryFn: async (): Promise<HeroAdvancedSettings> => {
      try {
        const { data, error } = await supabase
          .from('hero_advanced_settings')
          .select('*')
          .limit(1)
          .single();

        if (error) {
          console.warn('[Oculto] hero_advanced_settings not available:', error.message);
          return {
            id: 'default',
            ...defaultSettings,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }

        // Parse JSONB fields
        return {
          ...data,
          texts_day: typeof data.texts_day === 'string' 
            ? JSON.parse(data.texts_day) 
            : data.texts_day || defaultSettings.texts_day,
          texts_night: typeof data.texts_night === 'string' 
            ? JSON.parse(data.texts_night) 
            : data.texts_night || defaultSettings.texts_night,
          rotating_words: typeof data.rotating_words === 'string' 
            ? JSON.parse(data.rotating_words) 
            : data.rotating_words || defaultSettings.rotating_words,
          trust_indicators: typeof data.trust_indicators === 'string' 
            ? JSON.parse(data.trust_indicators) 
            : data.trust_indicators || defaultSettings.trust_indicators,
          ab_test_variant_b: typeof data.ab_test_variant_b === 'string' 
            ? JSON.parse(data.ab_test_variant_b) 
            : data.ab_test_variant_b || {}
        } as HeroAdvancedSettings;
      } catch {
        return {
          id: 'default',
          ...defaultSettings,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: {
      id: 'default',
      ...defaultSettings,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    meta: {
      silentMissingTable: true,
    },
  });
}

export function useUpdateHeroSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<HeroAdvancedSettings, 'ab_test_variant_b'>> & { ab_test_variant_b?: Record<string, unknown> | null }) => {
      // Get current settings ID
      const { data: current } = await supabase
        .from('hero_advanced_settings')
        .select('id')
        .limit(1)
        .single();

      if (!current) {
        throw new Error('No hero settings found');
      }

      const { error } = await supabase
        .from('hero_advanced_settings')
        .update(updates as Record<string, unknown>)
        .eq('id', current.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hero-advanced-settings'] });
    }
  });
}

export function useTimeOfDay(settings?: HeroAdvancedSettings, override?: 'day' | 'night' | null) {
  if (override) return override;
  
  const hour = new Date().getHours();
  const dayStart = settings?.day_start_hour ?? 6;
  const nightStart = settings?.night_start_hour ?? 18;
  
  return hour >= dayStart && hour < nightStart ? 'day' : 'night';
}

export function useCurrentHeroTexts(
  settings?: HeroAdvancedSettings, 
  timeOverride?: 'day' | 'night' | null
) {
  const timeOfDay = useTimeOfDay(settings, timeOverride);
  
  if (!settings) {
    return timeOfDay === 'day' ? defaultSettings.texts_day : defaultSettings.texts_night;
  }
  
  return timeOfDay === 'day' ? settings.texts_day : settings.texts_night;
}
