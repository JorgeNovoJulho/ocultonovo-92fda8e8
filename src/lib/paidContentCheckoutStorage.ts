/**
 * Persistência local (mock) do estado de checkout de conteúdo VIP por post.
 * Serve para:
 *  - Histórico de tentativas (PIX/cartão) com data + status
 *  - Estado da última transação (pending/confirmed/failed/expired) para exibir
 *    no PaidMediaOverlay mesmo após reload da página.
 *
 * Quando o backend real estiver pronto, substituir por leitura via Supabase
 * (transactions / split_logs). Por enquanto é localStorage namespaced.
 */

export type PaidAttemptStatus = "pending" | "confirmed" | "failed" | "expired";
export type PaidAttemptMethod = "pix" | "card";

export interface PaidAttempt {
  id: string;
  postId: string;
  method: PaidAttemptMethod;
  status: PaidAttemptStatus;
  createdAt: string;
  updatedAt: string;
  amount: number;
  pixCode?: string | null;
  pixB64?: string | null;
  txId?: string | null;
  paymentId?: string | null;
  reason?: string | null;
}

const KEY = "oculto:paid_checkout:v1";

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

function readAll(): Record<string, PaidAttempt[]> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}
function writeAll(data: Record<string, PaidAttempt[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    emit();
  } catch {
    /* ignore quota */
  }
}

export const paidCheckoutStore = {
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },

  /** Lista tentativas de um post, mais recentes primeiro */
  list(postId: string): PaidAttempt[] {
    const all = readAll();
    return [...(all[postId] || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Última tentativa relevante (qualquer status), para usar no overlay */
  latest(postId: string): PaidAttempt | null {
    return this.list(postId)[0] || null;
  },

  /** Cria uma tentativa pendente */
  start(input: {
    postId: string;
    method: PaidAttemptMethod;
    amount: number;
    pixCode?: string | null;
    pixB64?: string | null;
    txId?: string | null;
    paymentId?: string | null;
  }): PaidAttempt {
    const now = new Date().toISOString();
    const attempt: PaidAttempt = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    const all = readAll();
    all[input.postId] = [attempt, ...(all[input.postId] || [])].slice(0, 20);
    writeAll(all);
    return attempt;
  },

  /** Atualiza status da tentativa */
  update(postId: string, attemptId: string, patch: Partial<PaidAttempt>) {
    const all = readAll();
    const arr = all[postId] || [];
    const idx = arr.findIndex((a) => a.id === attemptId);
    if (idx < 0) return null;
    arr[idx] = { ...arr[idx], ...patch, updatedAt: new Date().toISOString() };
    all[postId] = arr;
    writeAll(all);
    return arr[idx];
  },

  /** Marca todas as tentativas pendentes como expiradas (ex.: post liberado) */
  clearPending(postId: string) {
    const all = readAll();
    const arr = all[postId] || [];
    let changed = false;
    arr.forEach((a) => {
      if (a.status === "pending") {
        a.status = "expired";
        a.updatedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) writeAll(all);
  },
};

export function formatAttemptDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function attemptStatusLabel(s: PaidAttemptStatus) {
  return {
    pending: "Pendente",
    confirmed: "Confirmado",
    failed: "Falhou",
    expired: "Expirado",
  }[s];
}
