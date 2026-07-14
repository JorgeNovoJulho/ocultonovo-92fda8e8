import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useEffect } from "react";
import { toast } from "sonner";

export interface HowStep {
  icon: string; // lucide name
  title: string;
  description: string;
}
export interface HowItWorksContent {
  badge: string;
  title: string;
  subtitle: string;
  steps: HowStep[];
}

export interface UniverseCard {
  icon: string; // lucide name
  title: string;
  description: string;
  vip?: boolean;
  visible?: boolean;
}
export interface UniverseGridContent {
  badge: string;
  title: string;
  subtitle: string;
  cards: UniverseCard[];
}

export interface DifferenceStat {
  value: string;
  label: string;
}
export interface DifferenceStatsContent {
  badge: string;
  title: string;
  subtitle: string;
  stats: DifferenceStat[];
  badges: string[];
}

export const DEFAULT_HOW_IT_WORKS: HowItWorksContent = {
  badge: "Como funciona",
  title: "Em 3 passos discretos",
  subtitle: "Cadastre-se, conecte-se e viva o que está oculto — sem expor sua identidade.",
  steps: [
    {
      icon: "UserPlus",
      title: "Crie seu perfil oculto",
      description:
        "Cadastro rápido, anônimo e seguro. Você decide o que mostrar e para quem — sem rosto, sem exposição.",
    },
    {
      icon: "Sparkles",
      title: "Encontre com Aura Match",
      description:
        "Nossa compatibilidade emocional invisível conecta você com pessoas que vibram na mesma frequência.",
    },
    {
      icon: "ShieldCheck",
      title: "Viva com segurança",
      description:
        "Salas privadas, encontros seguros com check-in no WhatsApp e total controle sobre sua privacidade.",
    },
  ],
};

export const DEFAULT_UNIVERSE_GRID: UniverseGridContent = {
  badge: "O Universo Oculto",
  title: "Tudo o que você precisa, num só lugar",
  subtitle:
    "Conexões, conteúdo exclusivo, monetização e experiências reais — com a discrição que só o OCULTO entrega.",
  cards: [
    {
      icon: "Crown",
      title: "Canais VIP",
      description: "Conteúdo exclusivo dos seus criadores favoritos: Diário VIP, mídias e ao vivo.",
      vip: true,
      visible: true,
    },
    {
      icon: "DollarSign",
      title: "Monetização",
      description: "Criadores ganham com assinaturas, PPV e conteúdo pago — split transparente.",
      vip: false,
      visible: true,
    },
    {
      icon: "Sparkles",
      title: "Aura Match",
      description: "Compatibilidade emocional invisível: você sente antes de saber por quê.",
      vip: false,
      visible: true,
    },
    {
      icon: "MessageCircle",
      title: "Salas de Bate-Papo",
      description: "Salas temáticas com presença anônima e moderação ativa em tempo real.",
      vip: false,
      visible: true,
    },
    {
      icon: "Compass",
      title: "Explorador de Misteriosos",
      description: "Descubra novos perfis perto de você, sem nunca expor sua identidade.",
      vip: false,
      visible: true,
    },
    {
      icon: "Notebook",
      title: "Diário VIP",
      description: "Posts ricos dos criadores: texto, mídia, links e bastidores exclusivos.",
      vip: true,
      visible: true,
    },
    {
      icon: "ShieldCheck",
      title: "Encontro Seguro",
      description: "Check-in com alerta automático no WhatsApp se algo sair do esperado.",
      vip: false,
      visible: true,
    },
    {
      icon: "Radar",
      title: "Radar ao Vivo",
      description: "Veja quem está disponível agora, sem revelar onde você está.",
      vip: false,
      visible: true,
    },
  ],
};

export const DEFAULT_DIFFERENCE_STATS: DifferenceStatsContent = {
  badge: "Por que OCULTO?",
  title: "A revolução discreta que você estava esperando",
  subtitle: "Tecnologia brasileira, privacidade real e uma comunidade que respeita seu mistério.",
  stats: [
    { value: "100%", label: "Brasileiro" },
    { value: "LGPD", label: "Conformidade total" },
    { value: "+18", label: "Verificado" },
    { value: "24/7", label: "Suporte ativo" },
  ],
  badges: ["🔒 Privacidade real", "✅ Perfis verificados", "🛡️ Anti-fake"],
};

const KEYS = {
  how: "how_it_works",
  universe: "universe_grid",
  difference: "difference_stats",
} as const;

type KnownKey = (typeof KEYS)[keyof typeof KEYS];

async function fetchMap() {
  const { data, error } = await (supabase as any)
    .from("landing_settings")
    .select("setting_key,setting_value")
    .in("setting_key", Object.values(KEYS));
  if (error) {
    console.warn("[useLandingSectionsContent]", error.message);
    return {} as Record<string, any>;
  }
  const map: Record<string, any> = {};
  for (const row of data || []) map[row.setting_key] = row.setting_value;
  return map;
}

export function useLandingSectionsContent() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["landing-sections-content"],
    queryFn: async () => {
      const map = await fetchMap();
      return {
        howItWorks: { ...DEFAULT_HOW_IT_WORKS, ...(map[KEYS.how] || {}) } as HowItWorksContent,
        universeGrid: { ...DEFAULT_UNIVERSE_GRID, ...(map[KEYS.universe] || {}) } as UniverseGridContent,
        differenceStats: {
          ...DEFAULT_DIFFERENCE_STATS,
          ...(map[KEYS.difference] || {}),
        } as DifferenceStatsContent,
      };
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const unsub = subscribeTable(
      "landing_settings",
      () => qc.invalidateQueries({ queryKey: ["landing-sections-content"] }),
    );
    return () => unsub();
  }, [qc]);

  return query;
}

export function useUpdateLandingSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: KnownKey; value: any }) => {
      const { error } = await (supabase as any)
        .from("landing_settings")
        .upsert(
          { setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: "setting_key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["landing-sections-content"] });
      toast.success("Seção atualizada em tempo real!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const LANDING_SECTION_KEYS = KEYS;
