/**
 * Templates prontos de frases para "Recursos" e "Restrições" de planos.
 * Usados no AdminPlansPage para preencher os textareas com 1 clique.
 */
export interface PlanTextTemplate {
  id: string;
  label: string;
  features: string[];
  restrictions: string[];
}

export const PLAN_TEXT_TEMPLATES: PlanTextTemplate[] = [
  {
    id: "free-base",
    label: "Free — Padrão",
    features: [
      "Feed completo com até 10 posts sem blur por dia",
      "Mensagens ilimitadas com correspondências",
      "Buscar perfis no Radar (limitado)",
      "Comentar em posts públicos",
      "Perfect Pair: até 10 rodadas de cards/dia",
      "Visualizar matches confirmados",
    ],
    restrictions: [
      "Sem Modo Fantasma",
      "Sem envio de áudio, vídeo ou câmera nativa no chat",
      "Sem responder usuários Premium/VIP",
      "Sem criar eventos VIP, leilões ou enquetes",
      "Sem painel financeiro de criador",
      "Sem assinar planos pagos de criadores",
    ],
  },
  {
    id: "premium-base",
    label: "Premium — Padrão",
    features: [
      "Tudo do Free",
      "Modo Fantasma incluso (visitas anônimas)",
      "Áudio, vídeo e câmera nativa no chat",
      "Perfect Pair ilimitado",
      "Encontro Seguro com alertas via WhatsApp",
      "Visualizar e participar de eventos VIP",
      "Assinar planos pagos de criadores VIP",
      "Acesso ao painel financeiro pessoal",
    ],
    restrictions: [
      "Sem rendimentos de criador (saques)",
      "Sem criar conteúdo VIP monetizado",
    ],
  },
  {
    id: "vip-base",
    label: "VIP — Padrão",
    features: [
      "Tudo do Premium",
      "Selo VIP dourado e prioridade no feed",
      "Criar conteúdo VIP monetizado e Acervo VIP",
      "Rendimentos de criador (saques a partir de R$ 50)",
      "Criar eventos VIP, leilões e enquetes",
      "Broadcasts em massa e PPV agendado",
      "Comissão de afiliado (5%) por indicação",
    ],
    restrictions: [],
  },
  {
    id: "trial",
    label: "Trial / Promoção",
    features: [
      "Acesso temporário a todas as funções Premium",
      "Cancelamento a qualquer momento",
    ],
    restrictions: [
      "Após o período, conta volta automaticamente para Free",
      "Sem rendimentos de criador durante o trial",
    ],
  },
];
