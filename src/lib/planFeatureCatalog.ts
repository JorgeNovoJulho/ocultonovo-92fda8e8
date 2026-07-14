/**
 * Catálogo canônico das funções/regras dos planos da plataforma.
 * Fonte única de verdade para os toggles + limites numéricos do
 * modal de criar/editar plano no admin.
 */

export type PlanTypeKey = "free" | "premium" | "vip";

export interface NumericLimitDef {
  /** chave técnica do limite numérico (vai para plan.limits[key]) */
  key: string;
  /** rótulo curto */
  label: string;
  /** descrição/tooltip */
  hint: string;
  /** unidade exibida ao lado do input (ex: "posts", "msgs/dia") */
  unit: string;
  /** valor mínimo permitido (geralmente 0 ou -1 para ilimitado) */
  min: number;
  /** valor padrão por plano (-1 = ilimitado, 0 = bloqueado) */
  defaults: Record<PlanTypeKey, number>;
}

export interface PlanFeatureDef {
  /** chave técnica (estável) */
  key: string;
  /** rótulo curto que vai para o array features/restrictions do plano */
  label: string;
  /** descrição completa para tooltip / cards expandidos */
  description: string;
  /** categoria para agrupar visualmente */
  category:
    | "Conteúdo"
    | "Mensagens"
    | "Monetização"
    | "Engajamento"
    | "Privacidade"
    | "Diversos";
  /** estado padrão por plano (true = liberado, false = restrito) */
  defaults: Record<PlanTypeKey, boolean>;
  /** limites numéricos opcionais associados a essa função */
  limits?: NumericLimitDef[];
}

export const PLAN_FEATURE_CATALOG: PlanFeatureDef[] = [
  // ── Conteúdo & Engajamento ─────────────────────────────────
  {
    key: "feed_full",
    label: "Feed completo",
    description:
      "Acesso ao feed principal. No plano Free, posts além do limite ficam com BLUR para incentivar upgrade.",
    category: "Conteúdo",
    defaults: { free: true, premium: true, vip: true },
    limits: [
      {
        key: "posts_no_blur_per_day",
        label: "Posts sem BLUR / dia",
        hint: "Quantidade de posts visíveis sem desfoque por dia. -1 = ilimitado.",
        unit: "posts",
        min: -1,
        defaults: { free: 10, premium: -1, vip: -1 },
      },
      {
        key: "stories_per_day",
        label: "Stories visíveis / dia",
        hint: "Quantidade de stories que o usuário pode visualizar por dia.",
        unit: "stories",
        min: -1,
        defaults: { free: 20, premium: -1, vip: -1 },
      },
    ],
  },
  {
    key: "messages_unlimited",
    label: "Mensagens ilimitadas",
    description:
      "Permite enviar mensagens no chat sem limite diário. No Free, há um teto diário para incentivar upgrade.",
    category: "Mensagens",
    defaults: { free: false, premium: true, vip: true },
    limits: [
      {
        key: "max_messages_per_day",
        label: "Mensagens / dia",
        hint: "Máximo de mensagens enviadas por dia. -1 = ilimitado.",
        unit: "msgs/dia",
        min: -1,
        defaults: { free: 10, premium: -1, vip: -1 },
      },
    ],
  },
  {
    key: "chat_audio",
    label: "Enviar áudio no chat",
    description: "Permite gravar e enviar mensagens de áudio (até 60s).",
    category: "Mensagens",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "chat_video",
    label: "Enviar vídeo no chat",
    description: "Permite enviar vídeos diretamente no chat.",
    category: "Mensagens",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "chat_camera",
    label: "Câmera nativa no chat",
    description:
      "Acesso à câmera nativa para fotos/vídeos diretamente da conversa.",
    category: "Mensagens",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "reply_premium_vip",
    label: "Responder usuários Premium/VIP",
    description:
      "Permite que o usuário responda a Premium e VIP. Usuários Free, quando bloqueados, podem apenas receber.",
    category: "Mensagens",
    defaults: { free: false, premium: true, vip: true },
  },

  // ── Eventos / Leilões / Monetização ───────────────────────
  {
    key: "create_events",
    label: "Criar eventos VIP",
    description:
      "Permite criar eventos com lista VIP, RSVP, chat de grupo e avaliações pós-evento.",
    category: "Monetização",
    defaults: { free: false, premium: true, vip: true },
    limits: [
      {
        key: "max_events_per_month",
        label: "Eventos / mês",
        hint: "Quantidade de eventos que podem ser criados por mês.",
        unit: "eventos/mês",
        min: -1,
        defaults: { free: 0, premium: 5, vip: -1 },
      },
    ],
  },
  {
    key: "create_auctions",
    label: "Criar leilões",
    description:
      "Permite criar leilões em tempo real com anti-sniping (+2 min). VIP tem prioridade.",
    category: "Monetização",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "create_paid_content",
    label: "Publicar conteúdo pago / PPV",
    description:
      "Permite publicar conteúdo pago (Pay-Per-View). Apenas VIP por padrão.",
    category: "Monetização",
    defaults: { free: false, premium: false, vip: true },
  },
  {
    key: "create_coupons",
    label: "Criar cupons de desconto",
    description: "Criar cupons promocionais para fãs e seguidores.",
    category: "Monetização",
    defaults: { free: false, premium: false, vip: true },
  },
  {
    key: "create_goals",
    label: "Metas de arrecadação",
    description: "Criar campanhas de meta de arrecadação visíveis no perfil.",
    category: "Monetização",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "broadcasts",
    label: "Mensagens em massa (broadcast)",
    description:
      "Enviar mensagens em massa para fãs/seguidores, com agendamento.",
    category: "Monetização",
    defaults: { free: false, premium: true, vip: true },
    limits: [
      {
        key: "max_broadcasts_per_month",
        label: "Broadcasts / mês",
        hint: "Limite mensal de envios em massa.",
        unit: "envios/mês",
        min: -1,
        defaults: { free: 0, premium: 4, vip: -1 },
      },
    ],
  },

  // ── Super DM / Indicações ─────────────────────────────────
  {
    key: "send_super_dm",
    label: "Enviar Super DM",
    description:
      "Enviar mensagem destacada que pula a fila de inbox do destinatário.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
    limits: [
      {
        key: "super_dm_per_month",
        label: "Super DMs / mês",
        hint: "Quantos Super DMs grátis por mês. -1 = ilimitado.",
        unit: "DMs/mês",
        min: -1,
        defaults: { free: 0, premium: 5, vip: -1 },
      },
    ],
  },
  {
    key: "receive_super_dm",
    label: "Receber Super DM",
    description: "Recebe destaque visual quando alguém envia Super DM.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "referral_invites",
    label: "Programa Convide e Ganhe",
    description:
      "Acesso ao programa de afiliados com 5% de comissão recorrente.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "madrinha_program",
    label: "Programa Madrinhas",
    description: "Acesso ao programa especial Madrinhas com bônus exclusivos.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "radar_search",
    label: "Buscar no Radar",
    description:
      "Permite usar o Radar para encontrar perfis próximos. Free limita por dia.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
    limits: [
      {
        key: "max_radar_searches_per_day",
        label: "Buscas no Radar / dia",
        hint: "Limite de buscas no Radar por dia. -1 = ilimitado.",
        unit: "buscas/dia",
        min: -1,
        defaults: { free: 5, premium: -1, vip: -1 },
      },
    ],
  },
  {
    key: "see_likes",
    label: "Ver curtidas recebidas",
    description: "Visualiza sem blur quem curtiu o perfil/posts.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "see_followers",
    label: "Ver seguidores nominalmente",
    description:
      "Visualiza nomes/avatares dos seguidores (no Free vão borrados).",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "send_gifts",
    label: "Enviar presentes",
    description: "Enviar gifts pagos para criadores/usuários.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "comments",
    label: "Comentar em posts",
    description:
      "Permite comentar em posts. Bloqueado no Free para reduzir spam.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },

  // ── Privacidade ───────────────────────────────────────────
  {
    key: "private_profile",
    label: "Perfil privado",
    description: "Tornar o perfil privado, só seguidores aprovados acessam.",
    category: "Privacidade",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "hide_online",
    label: "Ocultar status online",
    description: "Esconder o indicador de online/última atividade.",
    category: "Privacidade",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "hide_age",
    label: "Ocultar idade",
    description: "Não exibir idade publicamente no perfil.",
    category: "Privacidade",
    defaults: { free: false, premium: false, vip: true },
  },
  {
    key: "hide_location",
    label: "Ocultar localização",
    description: "Não exibir cidade/distância no perfil ou Radar.",
    category: "Privacidade",
    defaults: { free: false, premium: false, vip: true },
  },
  {
    key: "anonymous_ranking",
    label: "Anônimo em rankings",
    description: "Aparecer como Anônimo em rankings públicos (top fãs etc).",
    category: "Privacidade",
    defaults: { free: false, premium: false, vip: true },
  },
  {
    key: "view_profile_visits",
    label: "Ver quem visitou o perfil",
    description: "Lista de visitantes recentes do perfil.",
    category: "Privacidade",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "ghost_mode_free",
    label: "Modo fantasma incluso",
    description:
      "Modo fantasma sem add-on. Quando desligado, vira add-on pago de R$ 9,90.",
    category: "Privacidade",
    defaults: { free: false, premium: false, vip: true },
  },

  // ── Perfect Pair / Matches ────────────────────────────────
  {
    key: "perfect_pair",
    label: "Perfect Pair (descoberta de pares)",
    description:
      "Acesso ao módulo Perfect Pair (swipe-style) para descobrir pares compatíveis em um raio de 200km. Free recebe rodadas limitadas por dia.",
    category: "Engajamento",
    defaults: { free: true, premium: true, vip: true },
    limits: [
      {
        key: "perfect_pair_rounds_per_day",
        label: "Rodadas de cards / dia",
        hint: "Quantas rodadas de cards do Perfect Pair o usuário pode ver por dia. -1 = ilimitado.",
        unit: "rodadas/dia",
        min: -1,
        defaults: { free: 10, premium: -1, vip: -1 },
      },
    ],
  },
  {
    key: "view_matches",
    label: "Visualizar matches",
    description:
      "Permite acessar a lista de matches confirmados e abrir o chat atômico criado.",
    category: "Engajamento",
    defaults: { free: true, premium: true, vip: true },
  },

  // ── Encontro Seguro ───────────────────────────────────────
  {
    key: "safety_checkin",
    label: "Encontro Seguro (check-in)",
    description:
      "Permite usar o sistema de Encontro Seguro com alertas via WhatsApp para contatos de emergência.",
    category: "Privacidade",
    defaults: { free: false, premium: true, vip: true },
  },

  // ── Eventos / Conteúdo VIP ────────────────────────────────
  {
    key: "view_events",
    label: "Visualizar eventos",
    description: "Permite ver a lista pública de eventos VIP da plataforma.",
    category: "Conteúdo",
    defaults: { free: true, premium: true, vip: true },
  },
  {
    key: "join_events",
    label: "Participar de eventos (RSVP)",
    description:
      "Permite confirmar presença, entrar no chat de grupo e avaliar eventos VIP.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "subscribe_creator_plans",
    label: "Assinar planos pagos de criadores VIP",
    description:
      "Permite assinar mensalidades pagas de criadores VIP (acervo, PPV, conteúdo exclusivo).",
    category: "Monetização",
    defaults: { free: false, premium: true, vip: true },
  },

  // ── Painel financeiro / Rendimentos ───────────────────────
  {
    key: "financial_dashboard",
    label: "Acesso ao painel financeiro",
    description:
      "Acesso à carteira, transações, faturas e relatórios financeiros pessoais.",
    category: "Monetização",
    defaults: { free: false, premium: true, vip: true },
  },
  {
    key: "creator_earnings",
    label: "Rendimentos de criador",
    description:
      "Acesso aos rendimentos como criador (extrato, saques mínimos R$ 50, vw_extrato_criador).",
    category: "Monetização",
    defaults: { free: false, premium: false, vip: true },
  },

  // ── Enquetes ──────────────────────────────────────────────
  {
    key: "create_polls",
    label: "Criar enquetes",
    description:
      "Permite criar enquetes nos posts/stories com fechamento automático e cache de votos.",
    category: "Engajamento",
    defaults: { free: false, premium: true, vip: true },
  },

  // ── Diversos ──────────────────────────────────────────────
  {
    key: "no_ads",
    label: "Sem anúncios",
    description: "Remove banners/anúncios da experiência.",
    category: "Diversos",
    defaults: { free: false, premium: true, vip: true },
  },
];

/** Mapa: key da feature → defs de limites (para UI). */
export const FEATURES_WITH_LIMITS: PlanFeatureDef[] = PLAN_FEATURE_CATALOG.filter(
  (d) => d.limits && d.limits.length > 0,
);

/** Defaults canônicos dos limites numéricos por tipo de plano. */
export function getDefaultPlanLimits(planType: PlanTypeKey): Record<string, number> {
  const limits: Record<string, number> = {};
  for (const def of PLAN_FEATURE_CATALOG) {
    if (!def.limits) continue;
    for (const l of def.limits) {
      limits[l.key] = l.defaults[planType];
    }
  }
  return limits;
}

/**
 * Devolve features/restrictions pré-preenchidas para um tipo de plano.
 */
export function getDefaultPlanLists(planType: PlanTypeKey): {
  features: string[];
  restrictions: string[];
} {
  const features: string[] = [];
  const restrictions: string[] = [];
  for (const def of PLAN_FEATURE_CATALOG) {
    if (def.defaults[planType]) features.push(def.label);
    else restrictions.push(def.label);
  }
  return { features, restrictions };
}

/**
 * Recalcula features/restrictions a partir de um mapa de toggles.
 * Itens livres (não no catálogo) preservam-se nas listas originais.
 */
export function applyToggleStateToLists(
  toggleState: Record<string, boolean>,
  freeformFeatures: string[],
  freeformRestrictions: string[],
): { features: string[]; restrictions: string[] } {
  const catalogLabels = new Set(PLAN_FEATURE_CATALOG.map((d) => d.label));
  const features = freeformFeatures.filter((f) => !catalogLabels.has(f));
  const restrictions = freeformRestrictions.filter(
    (r) => !catalogLabels.has(r),
  );
  for (const def of PLAN_FEATURE_CATALOG) {
    if (toggleState[def.key]) features.push(def.label);
    else restrictions.push(def.label);
  }
  return { features, restrictions };
}

/**
 * Infere o estado dos toggles a partir de listas atuais (features/restrictions).
 */
export function inferToggleState(
  features: string[],
  restrictions: string[],
): Record<string, boolean> {
  const inFeat = new Set(features);
  const state: Record<string, boolean> = {};
  for (const def of PLAN_FEATURE_CATALOG) {
    state[def.key] = inFeat.has(def.label);
  }
  void restrictions;
  return state;
}

/** Formata um valor numérico de limite (-1 = ilimitado, 0 = bloqueado). */
export function formatLimit(value: number, unit: string): string {
  if (value === -1) return `Ilimitado`;
  if (value === 0) return `Bloqueado`;
  return `${value} ${unit}`;
}
