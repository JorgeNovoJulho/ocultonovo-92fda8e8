import {
  LayoutDashboard,
  Users,
  UserCog,
  Settings,
  Shield,
  ShieldAlert,
  AlertTriangle,
  LifeBuoy,
  ScrollText,
  QrCode,
  ShieldCheck,
  FileText,
  CreditCard,
  Palette,
  Ticket,
  Skull,
  Megaphone,
  Flag,
  ClipboardCheck,
  Eye,
  Activity,
  MessageCircle,
  Wallet,
  BarChart3,
  Mail,
  Gauge,
  ImageIcon,
  Bell,
  Zap,
  FlaskConical,
  MessageSquareHeart,
  Trophy,
  Send,
  Link2,
  Database,
  LucideIcon,
  Package,
  Store,
  Banknote,
  Crown,
  Calculator,
  Gift,
  ExternalLink,
  Settings2,
  MapPin,
  Sparkles,
  Clock,
  LogOut,
  Archive,
  Layers,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: string;
  /** Se true, somente admin_master vê este item no menu. */
  masterOnly?: boolean;
}

export interface AdminNavGroup {
  title: string;
  icon: LucideIcon;
  items: AdminNavItem[];
  defaultOpen?: boolean;
  /** Se true, o grupo inteiro só aparece para admin_master. */
  masterOnly?: boolean;
}

/** Rotas master-only — espelham os <MasterAdminRoute> do App.tsx. */
const MASTER_ONLY_HREFS = new Set<string>([
  // Financeiro sensível
  "/admin/finance-hub",
  "/admin/asaas-finance-central",
  "/admin/split-config",
  "/admin/split-breakdown",
  "/admin/fiscal-dashboard",
  "/admin/fiscal-monthly",
  "/admin/financial-intelligence",
  "/admin/ml",
  "/admin/antifraud-monitor",
  "/admin/antifraud-financeiro",
  "/admin/antifraud-audit",
  "/admin/asaas-ops-status",
  "/admin/stress-test-report",
  "/admin/withdrawals",
  "/admin/disputes",
  "/admin/refund-chargeback-hub",
  "/admin/asaas-subscriptions",
  "/admin/special-requests",
  "/admin/pix",
  "/admin/asaas-webhook-logs",
  "/admin/asaas-stress-test",
  "/admin/asaas-mock-sandbox",
  "/admin/payment-test",
  "/admin/plans",
  "/admin/subscription-coupons",
  "/admin/user-billing",
  "/admin/invoices",
  "/admin/marketplace",
  // Equipe & roles
  "/admin/staff",
  "/admin/founders-review",
  // Auditoria & segurança sensíveis
  "/admin/audit",
  "/admin/affiliate-audit",
  "/admin/affiliates",
  "/admin/impersonation-logs",
  "/admin/central-investigacao",
  "/admin/notification-logs",
  "/admin/fraud/events",
  "/admin/checkout-health",
  "/admin/lgpd",
  // Sistema
  "/admin/integrations",
  "/admin/webhooks",
  "/admin/backup",
  "/admin/cron-jobs",
  "/admin/pwa",
  "/admin/settings",
  // Marketing automação avançada
  "/admin/marketing",
  "/admin/push-campaigns",
  "/admin/referral",
  "/admin/ab-testing",
  "/admin/promotions",
  "/admin/beta-control",
  "/admin/laboratorio-oculto",
  "/admin/manutencao",
  "/admin/experiencias-ocultas",
  "/admin/special-cycles",
  "/admin/room-chat-logs",
  "/admin/comunidades-ocultas",
  "/admin/comunidades",
  // Aura / Universo Social / Retention / Trust (sensíveis)
  "/admin/aura-settings",
  "/admin/aura-pulse",
  "/admin/aura-xp-economy",
  "/admin/users-xp-balance",
  "/admin/social-trust",
  "/admin/universo-social",
  "/admin/retention",
]);

/** Filtra grupos/itens com base no role efetivo do usuário. */
export function filterAdminNavGroups(
  groups: AdminNavGroup[],
  isMaster: boolean,
): AdminNavGroup[] {
  if (isMaster) return groups;
  return groups
    .filter((g) => !g.masterOnly)
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => !i.masterOnly && !MASTER_ONLY_HREFS.has(i.href),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

export function filterAdminTopLevel(
  items: AdminNavItem[],
  isMaster: boolean,
): AdminNavItem[] {
  if (isMaster) return items;
  return items.filter(
    (i) => !i.masterOnly && !MASTER_ONLY_HREFS.has(i.href),
  );
}

// Itens que aparecem diretamente (sem grupo)
export const adminTopLevelItems: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Criar Anúncio (Feed)", href: "/admin/ads", icon: Megaphone },
  { label: "Criar Anúncio Marketplace", href: "/admin/marketplace-ads", icon: Megaphone },
  { label: "Mensagem de Boas-Vindas", href: "/admin/welcome-message", icon: MessageSquareHeart },
  { label: "Pesquisas no Chat (200 XP)", href: "/admin/pesquisas", icon: ClipboardCheck, masterOnly: true },
  { label: "Novidades do Oculto (Feed)", href: "/admin/feed-novidades", icon: Sparkles, masterOnly: true },
  { label: "Beta Control (Fase da Plataforma)", href: "/admin/beta-control", icon: Sparkles, masterOnly: true },
  { label: "Laboratório Oculto (Feature Flags)", href: "/admin/laboratorio-oculto", icon: FlaskConical, masterOnly: true },
  { label: "Modo Manutenção", href: "/admin/manutencao", icon: Sparkles, masterOnly: true },
  { label: "Modos de Visualização do Feed", href: "/admin/modos-feed", icon: Layers, masterOnly: true },
  { label: "Módulo Social Beta", href: "/admin/experiencias-ocultas", icon: FlaskConical, masterOnly: true },
  { label: "OCULTO PLAY (oculto)", href: "/admin/oculto-play", icon: Sparkles, masterOnly: true },
  { label: "Planos de Assinatura (Free / Premium / VIP)", href: "/admin/plans", icon: Crown },
];

// Grupos colapsáveis
export const adminNavGroups: AdminNavGroup[] = [
  {
    title: "Usuários & Moderação",
    icon: Users,
    defaultOpen: true,
    items: [
      { label: "Usuários", href: "/admin/users", icon: Users, badgeKey: "pendingReports" },
      { label: "Verificações", href: "/admin/verifications", icon: ShieldCheck, badgeKey: "pendingVerifications" },
      { label: "Equipe", href: "/admin/staff", icon: UserCog },
      { label: "Banidos", href: "/admin/banned-users", icon: Skull },
      { label: "Cemitério (contas excluídas)", href: "/admin/cemiterio", icon: Skull, masterOnly: true },
      { label: "Denúncias Stories", href: "/admin/story-reports", icon: Flag },
      { label: "Controle de Qualidade", href: "/admin/quality-control", icon: ClipboardCheck },
      { label: "Creator Founders", href: "/admin/founders-review", icon: Crown },
    ],
  },
  {
    title: "Conteúdo",
    icon: FileText,
    items: [
      { label: "Posts", href: "/admin/posts", icon: FileText },
      { label: "Configurações do Feed", href: "/admin/feed-settings", icon: Settings2 },
      { label: "Tags de Interesse (Cadastro/Perfil)", href: "/admin/interest-tags", icon: Ticket, masterOnly: true },
      { label: "Descubra o Universo (carrossel)", href: "/admin/descobertas", icon: Sparkles },
      { label: "Guias \"Saiba mais\" (cards)", href: "/admin/slide-guides", icon: FileText, masterOnly: true },
      { label: "Configurações Aura Match", href: "/admin/aura-settings", icon: Sparkles },
      { label: "Pulso de Aura (Master)", href: "/admin/aura-pulse", icon: Sparkles },
      { label: "Economia de XP (interações)", href: "/admin/aura-xp-economy", icon: Sparkles, masterOnly: true },
      { label: "Saldo de XP — Usuários (lote)", href: "/admin/users-xp-balance", icon: Sparkles, masterOnly: true },
      { label: "Social & Trust System", href: "/admin/social-trust", icon: Shield },
      { label: "Universo Social (salas)", href: "/admin/universo-social", icon: Sparkles },
      { label: "Ciclos Sociais Especiais", href: "/admin/special-cycles", icon: Clock, masterOnly: true },
      { label: "Histórico de Salas (Logs .txt)", href: "/admin/room-chat-logs", icon: Archive, masterOnly: true },
      { label: "Comunidades Ocultas", href: "/admin/comunidades-ocultas", icon: Users, masterOnly: true },
      { label: "Caixa Oculta (campanhas)", href: "/admin/caixa-oculta", icon: Package, masterOnly: true },
      { label: "Hero Section", href: "/admin/hero-settings", icon: ImageIcon },
      { label: "Editor do Site", href: "/admin/site-editor", icon: Palette },
      { label: "Landing de Captura", href: "/admin/landing-editor", icon: ExternalLink },
     { label: "Modal de Convite", href: "/admin/invite-editor", icon: ExternalLink },
     { label: "Página de Compartilhamento (/c)", href: "/admin/share-landing-editor", icon: ExternalLink },
    ],
  },
  {
    title: "Financeiro",
    icon: Wallet,
    items: [
      { label: "Hub Financeiro", href: "/admin/finance-hub", icon: BarChart3 },
      { label: "Central Financeira ASAAS", href: "/admin/asaas-finance-central", icon: Activity },
      { label: "Split & Percentuais", href: "/admin/split-config", icon: Settings2 },
      { label: "Split Breakdown (Auditoria)", href: "/admin/split-breakdown", icon: Calculator },
      { label: "Dashboard Fiscal", href: "/admin/fiscal-dashboard", icon: BarChart3 },
      { label: "Relatório Mensal Fiscal", href: "/admin/fiscal-monthly", icon: BarChart3 },
      { label: "Inteligência Financeira", href: "/admin/financial-intelligence", icon: AlertTriangle },
      { label: "ML Antifraude & Receita", href: "/admin/ml", icon: Activity },
      { label: "Monitor Antifraude (Realtime)", href: "/admin/antifraud-monitor", icon: ShieldCheck },
      { label: "Antifraude Financeiro ASAAS", href: "/admin/antifraud-financeiro", icon: ShieldAlert },
      { label: "Auditoria Antifraude (Histórico)", href: "/admin/antifraud-audit", icon: ScrollText },
      { label: "Status Operacional ASAAS", href: "/admin/asaas-ops-status", icon: Gauge },
      { label: "Relatório Stress Test", href: "/admin/stress-test-report", icon: BarChart3 },
      { label: "Gestão de Saques", href: "/admin/withdrawals", icon: Banknote },
      { label: "Disputas e Chargebacks", href: "/admin/disputes", icon: AlertTriangle },
      { label: "Refund · Chargeback · Dívida", href: "/admin/refund-chargeback-hub", icon: ShieldAlert },
      { label: "Assinaturas ASAAS (Premium/VIP)", href: "/admin/asaas-subscriptions", icon: Crown },
      { label: "Solicitações Especiais", href: "/admin/special-requests", icon: AlertTriangle, badgeKey: "pendingSpecialRequests" },
      { label: "Marketplace", href: "/admin/marketplace", icon: Store },
      { label: "Gateway PIX", href: "/admin/pix", icon: QrCode },
      { label: "Logs ASAAS (Webhook)", href: "/admin/asaas-webhook-logs", icon: Database },
      { label: "Stress Test ASAAS", href: "/admin/asaas-stress-test", icon: Database },
      { label: "Sandbox ASAAS (Mock)", href: "/admin/asaas-mock-sandbox", icon: FlaskConical },
      { label: "Teste de Pagamentos", href: "/admin/payment-test", icon: FlaskConical },
      { label: "Planos da Plataforma", href: "/admin/plans", icon: Crown },
      { label: "Cupons", href: "/admin/subscription-coupons", icon: Ticket },
      { label: "Billing de Usuários", href: "/admin/user-billing", icon: Wallet },
      { label: "Faturas", href: "/admin/invoices", icon: FileText },
    ],
  },
  {
    title: "Marketing & Engajamento",
    icon: Megaphone,
    defaultOpen: true,
    items: [
      { label: "Anúncios", href: "/admin/ads", icon: Megaphone },
      { label: "Anúncios Marketplace", href: "/admin/marketplace-ads", icon: Megaphone },
      { label: "Sugestões & Destaque", href: "/admin/suggestions", icon: Megaphone },
      { label: "Novidades do Oculto (Feed)", href: "/admin/feed-novidades", icon: Sparkles, masterOnly: true },
      { label: "Automação Marketing", href: "/admin/marketing", icon: Zap },
      { label: "Push Campaigns", href: "/admin/push-campaigns", icon: Send },
      { label: "Referral/Afiliados", href: "/admin/referral", icon: Link2 },
      { label: "A/B Testing", href: "/admin/ab-testing", icon: FlaskConical },
      { label: "Feedback & NPS", href: "/admin/feedback", icon: MessageSquareHeart },
      { label: "Pesquisas no Chat (200 XP)", href: "/admin/pesquisas", icon: ClipboardCheck, masterOnly: true },
      { label: "Gamificação", href: "/admin/gamification", icon: Trophy },
      { label: "Promoções", href: "/admin/promotions", icon: Gift },
    ],
  },
  {
    title: "Comunicação",
    icon: MessageCircle,
    defaultOpen: true,
    items: [
      { label: "Mensagem de Boas-Vindas", href: "/admin/welcome-message", icon: MessageSquareHeart },
      { label: "WhatsApp", href: "/admin/whatsapp", icon: MessageCircle },
      { label: "Templates de Email", href: "/admin/email-templates", icon: Mail },
      { label: "Métricas de Email", href: "/admin/email-metrics", icon: Mail },
      { label: "Suporte", href: "/admin/support", icon: LifeBuoy, badgeKey: "openSupportTickets" },
    ],
  },
  {
    title: "Analytics",
    icon: BarChart3,
    items: [
      { label: "Analytics Básico", href: "/admin/analytics", icon: BarChart3 },
      { label: "Analytics Avançado", href: "/admin/advanced-analytics", icon: BarChart3 },
      { label: "Capacidade", href: "/admin/capacity", icon: Gauge },
    ],
  },
  {
    title: "Auditoria & Segurança",
    icon: Shield,
    items: [
      { label: "🛡️ Central de Investigação", href: "/admin/central-investigacao", icon: ShieldAlert, masterOnly: true },
      { label: "Auditoria", href: "/admin/audit", icon: ScrollText },
      { label: "Auditoria de Endereços (GPS)", href: "/admin/address-audit", icon: MapPin },
      { label: "Auditoria Split Afiliado", href: "/admin/affiliate-audit", icon: ScrollText },
      { label: "Gestão de Afiliados", href: "/admin/affiliates", icon: Users },
      { label: "Logs de Impersonificação", href: "/admin/impersonation-logs", icon: Eye },
      { label: "Logs de Alertas", href: "/admin/notification-logs", icon: Bell },
      { label: "Eventos de Fraude", href: "/admin/fraud/events", icon: ShieldAlert },
      { label: "Checkout Sentinel", href: "/admin/checkout-health", icon: Activity },
      { label: "Painel LGPD (DPO)", href: "/admin/lgpd", icon: Shield },
      { label: "Sessões Ativas", href: "/admin/active-sessions", icon: LogOut },
    ],
  },
  {
    title: "Sistema",
    icon: Settings,
    items: [
      { label: "Status das Integrações", href: "/admin/integrations", icon: Activity },
      { label: "Webhooks & API", href: "/admin/webhooks", icon: Zap },
      { label: "Backup & Recovery", href: "/admin/backup", icon: Database },
      { label: "Cron Jobs (pg_cron)", href: "/admin/cron-jobs", icon: Clock },
      { label: "PWA & Push (VAPID)", href: "/admin/pwa", icon: Bell, masterOnly: true },
      { label: "Configurações", href: "/admin/settings", icon: Settings },
    ],
  },
];
