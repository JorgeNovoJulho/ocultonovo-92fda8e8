// Catálogo estático de slides do "Descubra o Universo Oculto".
// Usado como FALLBACK quando a tabela `feed_discovery_slides` no
// Supabase externo não existir, estiver vazia ou der erro.
// O CRUD admin sempre vence sobre estes valores.

export type DiscoveryPlan = 'free' | 'premium' | 'vip';

export interface DiscoverySlide {
  id: string;
  slug: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaRoute: string;
  icon: string;
  category: string;
  targetPlans: DiscoveryPlan[];
  priority: number;
  isNew: boolean;
  requiresKyc?: boolean;
  requiresPlan?: DiscoveryPlan;
  // Fase A — Missões (opcionais)
  missionLabel?: string;
  missionGoal?: string;
  missionTarget?: number;
  // Fase B — Campanhas (opcionais)
  campaignTag?: string;
  campaignColor?: string;
}

export const STATIC_DISCOVERY_SLIDES: DiscoverySlide[] = [
  {
    id: 'static-aura-match',
    slug: 'aura-match',
    title: 'Aura Match',
    description: 'Descubra quem está sentindo sua presença agora. Conexões raras, instantâneas.',
    ctaLabel: 'Entrar no Aura Match',
    ctaRoute: '/aura-match',
    icon: 'sparkles',
    category: 'social',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 100,
    isNew: true,
  },
  {
    id: 'static-salas',
    slug: 'salas',
    title: 'Salas Sociais',
    description: 'Ambientes ao vivo no Aura Match onde o desejo encontra companhia.',
    ctaLabel: 'Explorar Salas',
    ctaRoute: '/aura-match?tab=salas',
    icon: 'users',
    category: 'social',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 90,
    isNew: false,
  },
  {
    id: 'static-radar',
    slug: 'radar',
    title: 'Radar Oculto',
    description: 'Veja presenças próximas e quem está ativo agora ao seu redor.',
    ctaLabel: 'Abrir Radar',
    ctaRoute: '/radar',
    icon: 'radar',
    category: 'discovery',
    targetPlans: ['premium', 'vip'],
    priority: 85,
    isNew: false,
    requiresPlan: 'premium',
  },
  {
    id: 'static-chat',
    slug: 'chat',
    title: 'Chat Privado',
    description: 'Conversas que começam discretas e podem ir longe.',
    ctaLabel: 'Abrir Chat',
    ctaRoute: '/messages',
    icon: 'message-circle',
    category: 'social',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 70,
    isNew: false,
  },
  {
    id: 'static-criar-post',
    slug: 'criar-post',
    title: 'Crie sua presença',
    description: 'Publique e seja descoberto pelos olhares certos.',
    ctaLabel: 'Criar Publicação',
    ctaRoute: '/feed',
    icon: 'plus-circle',
    category: 'creator',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 60,
    isNew: false,
  },
  {
    id: 'static-vitrine-vip',
    slug: 'vitrine-vip',
    title: 'Vitrine VIP',
    description: 'Os criadores mais desejados do Oculto, em um só lugar.',
    ctaLabel: 'Ver Vitrine VIP',
    ctaRoute: '/vitrine-vip',
    icon: 'crown',
    category: 'vip',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 80,
    isNew: false,
  },
  {
    id: 'static-canais-vip',
    slug: 'canais-vip',
    title: 'Canais VIP',
    description: 'Conteúdo exclusivo direto dos seus criadores favoritos.',
    ctaLabel: 'Explorar Canais',
    ctaRoute: '/subscriptions',
    icon: 'star',
    category: 'vip',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 78,
    isNew: false,
  },
  {
    id: 'static-monetizar',
    slug: 'monetizar',
    title: 'Monetize seu charme',
    description: 'Transforme presença em renda. Ative seu canal VIP agora.',
    ctaLabel: 'Ativar Monetização',
    ctaRoute: '/subscriptions',
    icon: 'banknote',
    category: 'creator',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 95,
    isNew: true,
  },
  {
    id: 'static-plano-vip',
    slug: 'plano-vip',
    title: 'Plano VIP',
    description: 'Acesso completo, sem limites, com prioridade absoluta.',
    ctaLabel: 'Ver Plano VIP',
    ctaRoute: '/subscriptions',
    icon: 'crown',
    category: 'plans',
    targetPlans: ['free', 'premium'],
    priority: 88,
    isNew: false,
  },
  {
    id: 'static-eventos',
    slug: 'eventos',
    title: 'Eventos Oculto',
    description: 'Encontros marcados, momentos inesquecíveis.',
    ctaLabel: 'Ver Eventos',
    ctaRoute: '/events',
    icon: 'calendar',
    category: 'events',
    targetPlans: ['premium', 'vip'],
    priority: 65,
    isNew: false,
  },
  {
    id: 'static-leiloes',
    slug: 'leiloes',
    title: 'Leilões Oculto',
    description: 'Ofertas únicas em tempo real. Ouse arrematar.',
    ctaLabel: 'Ver Leilões',
    ctaRoute: '/auctions',
    icon: 'gavel',
    category: 'events',
    targetPlans: ['premium', 'vip'],
    priority: 55,
    isNew: false,
  },
  {
    id: 'static-conquistas',
    slug: 'conquistas',
    title: 'Suas Conquistas',
    description: 'XP, níveis e badges. Sua jornada vira lenda no Aura Match.',
    ctaLabel: 'Ver Conquistas',
    ctaRoute: '/aura-match',
    icon: 'trophy',
    category: 'gamification',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 40,
    isNew: false,
  },
  {
    id: 'static-prestigio',
    slug: 'prestigio',
    title: 'Prestígio Social',
    description: 'Acompanhe seu nível, badges e prestígio direto no seu perfil.',
    ctaLabel: 'Ver Meu Prestígio',
    ctaRoute: '/profile',
    icon: 'flame',
    category: 'gamification',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 45,
    isNew: true,
  },
  {
    id: 'static-encontro-seguro',
    slug: 'encontro-seguro',
    title: 'Encontro Seguro',
    description: 'Compartilhe seu check-in e tenha proteção em tempo real nos seus encontros.',
    ctaLabel: 'Ativar Encontro Seguro',
    ctaRoute: '/profile?tab=safety',
    icon: 'shield',
    category: 'safety',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 75,
    isNew: true,
  },
  {
    id: 'static-bio-audio',
    slug: 'bio-audio',
    title: 'Bio de Áudio',
    description: 'Sua voz vale mais que mil palavras. Grave uma bio de áudio de até 30s e conquiste mais conexões.',
    ctaLabel: 'Configurar minha bio de áudio',
    ctaRoute: '/profile#voice-bio',
    icon: 'sparkles',
    category: 'creator',
    targetPlans: ['free', 'premium', 'vip'],
    priority: 72,
    isNew: true,
  },
];
