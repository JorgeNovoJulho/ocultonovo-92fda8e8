/**
 * MOCK ONLY — fluxo de afiliados (indicação de planos/canais VIP).
 * Dados in-memory para permitir desenvolvimento sem schema externo.
 * Ao migrar para banco real, substituir por chamadas Supabase.
 */
export type AffiliateStatus = "pending" | "approved" | "rejected";

export interface AffiliateApplication {
  id: string;
  channel_id: string;          // id do plano / canal VIP
  channel_title: string;
  creator_username: string;
  creator_avatar?: string | null;
  applicant_user_id: string;
  applicant_username: string;
  applicant_avatar?: string | null;
  message: string;
  status: AffiliateStatus;
  created_at: string;
  decided_at?: string | null;
  affiliate_link?: string | null;
  commission_percent: number;  // 5 = 5%
}

export interface AffiliateEarning {
  id: string;
  application_id: string;
  channel_title: string;
  buyer_username: string;
  amount_brl: number;          // valor bruto da venda
  commission_brl: number;      // 5% por padrão
  created_at: string;
}

export interface AffiliateClickStat {
  application_id: string;
  clicks: number;
  conversions: number;
}

const APPLICATIONS: AffiliateApplication[] = [
  {
    id: "app_demo_1",
    channel_id: "plan_demo_1",
    channel_title: "Acervo Premium · Bianca",
    creator_username: "biancavip",
    creator_avatar: null,
    applicant_user_id: "user_demo_x",
    applicant_username: "leo.indica",
    applicant_avatar: null,
    message: "Tenho audiência fiel e quero divulgar seu canal!",
    status: "pending",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    commission_percent: 5,
  },
  {
    id: "app_demo_2",
    channel_id: "plan_demo_1",
    channel_title: "Acervo Premium · Bianca",
    creator_username: "biancavip",
    creator_avatar: null,
    applicant_user_id: "user_demo_y",
    applicant_username: "marina.indica",
    applicant_avatar: null,
    message: "Já trabalhei com criadoras VIP, posso ajudar!",
    status: "approved",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    decided_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    affiliate_link: "https://ocultoswing.com.br/share/AFF-MARINA-001",
    commission_percent: 5,
  },
];

const EARNINGS: AffiliateEarning[] = [
  {
    id: "earn_1",
    application_id: "app_demo_2",
    channel_title: "Acervo Premium · Bianca",
    buyer_username: "joao_sub",
    amount_brl: 29.9,
    commission_brl: 1.49,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "earn_2",
    application_id: "app_demo_2",
    channel_title: "Acervo Premium · Bianca",
    buyer_username: "carla_sub",
    amount_brl: 299,
    commission_brl: 14.95,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const mockAffiliates = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  /** Aplicação de candidatura (afiliado se candidatando a um canal) */
  apply(input: {
    channel_id: string;
    channel_title: string;
    creator_username: string;
    applicant_user_id: string;
    applicant_username: string;
    message: string;
  }): AffiliateApplication {
    const app: AffiliateApplication = {
      id: `app_${Date.now()}`,
      channel_id: input.channel_id,
      channel_title: input.channel_title,
      creator_username: input.creator_username,
      creator_avatar: null,
      applicant_user_id: input.applicant_user_id,
      applicant_username: input.applicant_username,
      applicant_avatar: null,
      message: input.message,
      status: "pending",
      created_at: new Date().toISOString(),
      commission_percent: 5,
    };
    APPLICATIONS.unshift(app);
    emit();
    return app;
  },

  /** Listar candidaturas RECEBIDAS pelo criador */
  listForCreator(_creatorUsername: string) {
    // mock: retorna todas (em produção filtraria por owner)
    return [...APPLICATIONS];
  },

  /** Listar candidaturas/links que o usuário tem como afiliado */
  listForAffiliate(applicantUserId: string) {
    return APPLICATIONS.filter((a) => a.applicant_user_id === applicantUserId);
  },

  decide(id: string, status: "approved" | "rejected") {
    const app = APPLICATIONS.find((a) => a.id === id);
    if (!app) return null;
    app.status = status;
    app.decided_at = new Date().toISOString();
    if (status === "approved") {
      app.affiliate_link = `https://ocultoswing.com.br/share/AFF-${app.applicant_username.toUpperCase()}-${app.id.slice(-4)}`;
    }
    emit();
    return app;
  },

  earningsForApplication(applicationId: string) {
    return EARNINGS.filter((e) => e.application_id === applicationId);
  },

  earningsForAffiliate(applicantUserId: string) {
    const apps = APPLICATIONS.filter((a) => a.applicant_user_id === applicantUserId);
    const ids = new Set(apps.map((a) => a.id));
    return EARNINGS.filter((e) => ids.has(e.application_id));
  },

  totalForAffiliate(applicantUserId: string) {
    return this.earningsForAffiliate(applicantUserId).reduce(
      (s, e) => s + e.commission_brl,
      0,
    );
  },

  /** Estatísticas mock de cliques/conversões por candidatura */
  statsForApplication(applicationId: string): AffiliateClickStat {
    // Determinístico baseado no id, com leve variação
    const seed = applicationId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const conversions = EARNINGS.filter((e) => e.application_id === applicationId).length;
    const clicks = (seed % 80) + 40 + conversions * 7;
    return { application_id: applicationId, clicks, conversions };
  },

  /** Relatório mensal de comissões (todos os ganhos do afiliado) */
  monthlyReportForAffiliate(
    applicantUserId: string,
    rangeMonths?: number,
  ) {
    let earnings = this.earningsForAffiliate(applicantUserId);
    if (rangeMonths && rangeMonths > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - rangeMonths);
      earnings = earnings.filter((e) => new Date(e.created_at) >= cutoff);
    }
    const map = new Map<
      string,
      { month: string; total: number; sales: number; applicationIds: Set<string> }
    >();
    earnings.forEach((e) => {
      const d = new Date(e.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur = map.get(key) || { month: key, total: 0, sales: 0, applicationIds: new Set<string>() };
      cur.total += e.commission_brl;
      cur.sales += 1;
      cur.applicationIds.add(e.application_id);
      map.set(key, cur);
    });
    return Array.from(map.values())
      .map((m) => ({ ...m, applicationIds: Array.from(m.applicationIds) }))
      .sort((a, b) => b.month.localeCompare(a.month));
  },

  applicationById(id: string) {
    return APPLICATIONS.find((a) => a.id === id) || null;
  },
};
