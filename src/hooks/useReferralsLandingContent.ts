/**
 * useReferralsLandingContent — conteúdo editável da página /programa-indicacoes.
 * Persiste em landing_settings (key: referrals_landing). Realtime sync.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useEffect } from "react";
import { toast } from "sonner";

export interface ProgramItem {
  id: string;          // anchor id (ex.: "indicacoes-gerais")
  icon: string;        // lucide name
  name: string;
  tagline: string;
  commission: string;  // ex.: "5%" | "Até R$ 50"
  audience: string;    // ex.: "Todos os usuários"
  steps: string[];     // como participar
  earningsExample: string;
  ctaLabel: string;
  ctaRoute: string;    // rota interna
  badge?: string;      // "VIP" | "Novo" | etc
  visible?: boolean;
}

export interface FaqItem {
  q: string;
  a: string;
  visible?: boolean;
}

export interface ComparisonRow {
  program: string;
  commission: string;
  audience: string;
  payment: string;
  requirements: string;
}

export interface ReferralsLandingContent {
  published: boolean;
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaRoute: string;
    secondaryLabel?: string;
    secondaryRoute?: string;
  };
  howItWorks: {
    title: string;
    subtitle: string;
    steps: { icon: string; title: string; description: string }[];
  };
  programs: ProgramItem[];
  comparison: {
    title: string;
    rows: ComparisonRow[];
  };
  trustSeals: string[]; // ex.: "🔒 PIX em até 7 dias úteis"
  faq: {
    title: string;
    items: FaqItem[];
  };
  finalCta: {
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaRoute: string;
  };
}

export const DEFAULT_REFERRALS_LANDING: ReferralsLandingContent = {
  published: true,
  hero: {
    badge: "Programas de Indicação",
    title: "Indique. Compartilhe. Receba.",
    subtitle:
      "No OCULTO, todo mundo pode ganhar dinheiro indicando. Escolha o programa que combina com você — do link simples ao parceiro oficial de criadores.",
    ctaLabel: "Começar a indicar",
    ctaRoute: "/indicacoes",
    secondaryLabel: "Ver afiliados de canais",
    secondaryRoute: "/affiliates",
  },
  howItWorks: {
    title: "Como funciona em 3 passos",
    subtitle: "Simples, transparente e com pagamento via PIX.",
    steps: [
      {
        icon: "Link2",
        title: "Gere seu link",
        description: "Cada usuário tem um link único vinculado ao seu @username — pronto pra compartilhar.",
      },
      {
        icon: "Share2",
        title: "Compartilhe",
        description: "Envie pra amigos, redes sociais ou seu próprio público. Cada novo cadastro fica vinculado a você.",
      },
      {
        icon: "Wallet",
        title: "Receba via PIX",
        description: "Acompanhe seus ganhos em tempo real e saque direto pra sua chave PIX, sem burocracia.",
      },
    ],
  },
  programs: [
    {
      id: "indicacoes-gerais",
      icon: "Sparkles",
      name: "Indicações Gerais",
      tagline: "5% sobre cada primeira assinatura paga pelo seu link.",
      commission: "5%",
      audience: "Todos os usuários (Free, Premium, VIP)",
      steps: [
        "Defina um @username no seu perfil.",
        "Copie seu link em /indicacoes.",
        "Compartilhe com quem se interessar pelo OCULTO.",
        "Receba comissão quando a pessoa assinar Premium ou VIP.",
      ],
      earningsExample:
        "Exemplo: 10 indicados que assinarem o VIP (R$ 145,90) = R$ 72,95 no seu saldo.",
      ctaLabel: "Acessar meu link",
      ctaRoute: "/indicacoes",
      visible: true,
    },
    {
      id: "afiliados-canais",
      icon: "Crown",
      name: "Afiliados de Canais VIP",
      tagline: "Divulgue canais de criadores e ganhe comissão por venda aprovada.",
      commission: "Até 20%",
      audience: "Premium e VIP",
      steps: [
        "Candidate-se a um canal em /affiliates.",
        "Aguarde aprovação do criador.",
        "Receba seu link exclusivo do canal.",
        "Comissão é creditada a cada assinatura confirmada.",
      ],
      earningsExample:
        "Exemplo: 5 vendas de assinatura R$ 49,90 a 20% = R$ 49,90 por mês recorrente.",
      ctaLabel: "Ver canais disponíveis",
      ctaRoute: "/affiliates",
      badge: "Parceiros",
      visible: true,
    },
    {
      id: "madrinhas",
      icon: "Gift",
      name: "Madrinhas & Padrinhos",
      tagline: "Apadrinhe novos criadores e ganhe sobre as receitas deles.",
      commission: "15%",
      audience: "Criadores Premium/VIP verificados",
      steps: [
        "Convide criadores pelo seu link de Madrinha.",
        "O afilhado faz cadastro e ativa o plano de criador.",
        "Você recebe comissão sobre as receitas dele por 90 dias.",
        "Acompanhe tudo no painel de Madrinhas.",
      ],
      earningsExample:
        "Exemplo: 3 afilhadas faturando R$ 1.000/mês = R$ 450 pra você nos primeiros 90 dias.",
      ctaLabel: "Abrir painel Madrinhas",
      ctaRoute: "/indicacoes",
      badge: "Mentoria",
      visible: true,
    },
    {
      id: "pioneiros",
      icon: "ShieldCheck",
      name: "Pioneiros & Fundadores",
      tagline: "Garanta benefícios vitalícios entrando entre os primeiros 150.",
      commission: "Vitalício",
      audience: "Primeiros 150 cadastros",
      steps: [
        "Entre na lista de espera em /pioneiros.",
        "Convide amigos para subir posições.",
        "Receba acesso antecipado a todas as novidades.",
        "Mantenha benefícios exclusivos enquanto for membro ativo.",
      ],
      earningsExample:
        "Selo Pioneiro permanente + planos com desconto vitalício + acesso a betas fechados.",
      ctaLabel: "Entrar na lista",
      ctaRoute: "/pioneiros",
      badge: "Vagas limitadas",
      visible: true,
    },
    {
      id: "ranking",
      icon: "Trophy",
      name: "Ranking de Afiliados",
      tagline: "Suba de nível e apareça no Top mensal — totalmente opcional.",
      commission: "Bônus + visibilidade",
      audience: "Quem ativa o opt-in público",
      steps: [
        "Ative o ranking público em /affiliates.",
        "Acumule indicações e vendas.",
        "Suba de nível conforme metas (Bronze → Diamante).",
        "Top 10 ganha destaque e bônus mensais.",
      ],
      earningsExample:
        "Bônus extras de até R$ 500/mês para o Top 3 + selo dinâmico no perfil.",
      ctaLabel: "Ver meu nível",
      ctaRoute: "/affiliates",
      badge: "Opt-in",
      visible: true,
    },
    {
      id: "cupons",
      icon: "Tag",
      name: "Cupons de Parceiros",
      tagline: "Crie um código promocional próprio com desconto e comissão.",
      commission: "Negociável",
      audience: "Influenciadores e parceiros aprovados",
      steps: [
        "Solicite seu cupom em contato@oculto (ou pelo suporte).",
        "Cupom traz desconto pro comprador e comissão pra você.",
        "Comissões caem em saldo automaticamente após a venda.",
        "Acompanhe pelo painel de parceiros.",
      ],
      earningsExample:
        "Exemplo: cupom JOAO20 com 20% pro comprador + 20% de comissão pra você por venda.",
      ctaLabel: "Falar com o suporte",
      ctaRoute: "/support",
      badge: "B2B",
      visible: true,
    },
  ],
  comparison: {
    title: "Compare todos os programas",
    rows: [
      { program: "Indicações Gerais", commission: "5%", audience: "Todos", payment: "PIX em até 7d úteis", requirements: "Ter @username" },
      { program: "Afiliados de Canais", commission: "Até 20%", audience: "Premium/VIP", payment: "PIX recorrente", requirements: "Aprovação do criador" },
      { program: "Madrinhas", commission: "15% / 90 dias", audience: "Criadores", payment: "PIX recorrente", requirements: "Plano de criador ativo" },
      { program: "Pioneiros", commission: "Benefícios vitalícios", audience: "Primeiros 150", payment: "Selo + perks", requirements: "Lista de espera" },
      { program: "Ranking", commission: "Bônus mensal", audience: "Opt-in", payment: "Bônus em saldo", requirements: "Ativar opt-in" },
      { program: "Cupons", commission: "Negociável", audience: "B2B", payment: "PIX mensal", requirements: "Aprovação interna" },
    ],
  },
  trustSeals: [
    "🔒 LGPD — seus dados sob seu controle",
    "💸 PIX em até 7 dias úteis",
    "🛡️ Antifraude ativo 24/7",
    "📊 Painel em tempo real",
  ],
  faq: {
    title: "Perguntas frequentes",
    items: [
      { q: "Preciso pagar pra entrar nos programas?", a: "Não. Todos os programas de indicação do OCULTO são gratuitos. Alguns têm requisitos (como plano Premium ou aprovação do criador), mas nunca cobramos pra participar.", visible: true },
      { q: "Quando recebo minha comissão?", a: "Comissões são confirmadas após a primeira assinatura paga (ou venda aprovada, no caso de afiliados de canais). Saques via PIX são liberados em até 7 dias úteis após a solicitação.", visible: true },
      { q: "Existe limite de quanto eu posso ganhar?", a: "Não há teto de ganhos. Você pode indicar quantas pessoas quiser e acumular comissão de todas elas. O único limite é o número máximo de saques por mês, configurável no programa.", visible: true },
      { q: "Posso participar de mais de um programa ao mesmo tempo?", a: "Sim. Você pode usar o link de indicação geral, se candidatar a canais VIP, ser madrinha de criadores e ainda apostar no ranking — tudo simultaneamente.", visible: true },
      { q: "E se a pessoa indicada não assinar?", a: "Você não recebe comissão se não houver venda. Mas seu link continua ativo: se ela assinar dentro da janela de tracking (90 dias por padrão), a indicação ainda conta.", visible: true },
      { q: "Como funciona a comissão das Madrinhas?", a: "Você recebe 15% sobre as receitas dos criadores que você apadrinhar durante os primeiros 90 dias da conta deles. Depois disso, a comissão zera, mas o vínculo permanece pro histórico.", visible: true },
      { q: "Tem problema indicar pessoas conhecidas?", a: "Sem problema, desde que sejam pessoas reais e maiores de 18 anos. Autoindicação (criar conta pra si mesmo) e indicações do mesmo dispositivo/IP são bloqueadas pelo antifraude.", visible: true },
      { q: "Como vejo meu desempenho?", a: "Cada programa tem seu próprio painel: /indicacoes (geral), /affiliates (canais VIP) e /indicacoes (madrinhas). Tudo em tempo real, com gráficos e histórico completo.", visible: true },
    ],
  },
  finalCta: {
    title: "Pronto pra começar a ganhar?",
    subtitle: "Pegue seu link em menos de 1 minuto e comece a indicar hoje.",
    ctaLabel: "Gerar meu link agora",
    ctaRoute: "/indicacoes",
  },
};

const KEY = "referrals_landing";

export function useReferralsLandingContent() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["referrals-landing-content"],
    queryFn: async (): Promise<ReferralsLandingContent> => {
      const { data } = await (supabase as any)
        .from("landing_settings")
        .select("setting_value")
        .eq("setting_key", KEY)
        .maybeSingle();
      const stored = (data?.setting_value || {}) as Partial<ReferralsLandingContent>;
      // shallow merge nos blocos top-level, preservando defaults
      return {
        ...DEFAULT_REFERRALS_LANDING,
        ...stored,
        hero: { ...DEFAULT_REFERRALS_LANDING.hero, ...(stored.hero || {}) },
        howItWorks: { ...DEFAULT_REFERRALS_LANDING.howItWorks, ...(stored.howItWorks || {}) },
        comparison: { ...DEFAULT_REFERRALS_LANDING.comparison, ...(stored.comparison || {}) },
        faq: { ...DEFAULT_REFERRALS_LANDING.faq, ...(stored.faq || {}) },
        finalCta: { ...DEFAULT_REFERRALS_LANDING.finalCta, ...(stored.finalCta || {}) },
        programs: (stored.programs && stored.programs.length > 0) ? stored.programs : DEFAULT_REFERRALS_LANDING.programs,
        trustSeals: (stored.trustSeals && stored.trustSeals.length > 0) ? stored.trustSeals : DEFAULT_REFERRALS_LANDING.trustSeals,
      };
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const unsub = subscribeTable("landing_settings", (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.setting_key !== KEY) return;
      qc.invalidateQueries({ queryKey: ["referrals-landing-content"] });
    });
    return () => unsub();
  }, [qc]);

  return query;
}

export function useUpdateReferralsLanding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: ReferralsLandingContent) => {
      const { error } = await (supabase as any)
        .from("landing_settings")
        .upsert(
          { setting_key: KEY, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: "setting_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["referrals-landing-content"] });
      toast.success("Página de indicações atualizada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
