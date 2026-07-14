import { logger } from '@/lib/logger';
/**
 * Métricas de tempo do fluxo de login.
 * Use `loginMetrics.start()` no submit e `loginMetrics.mark('etapa')`
 * em cada checkpoint. `loginMetrics.report()` imprime uma tabela
 * agrupada no console com a duração entre passos e o total.
 *
 * Silencioso por padrão fora de DEV — só loga se `?debugLogin=1` ou
 * `localStorage.debugLogin === '1'`.
 */

type Mark = { label: string; t: number };

const DEBUG_KEY = 'debugLogin';

function isDebugEnabled(): boolean {
  if (import.meta.env?.DEV) return true;
  try {
    if (typeof window === 'undefined') return false;
    if (window.location.search.includes(`${DEBUG_KEY}=1`)) return true;
    return window.localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function now(): number {
  try {
    return performance.now();
  } catch {
    return Date.now();
  }
}

class LoginMetrics {
  private marks: Mark[] = [];
  private startedAt = 0;
  private enabled = false;

  start(): void {
    this.enabled = isDebugEnabled();
    this.marks = [];
    this.startedAt = now();
    if (this.enabled) {
      // eslint-disable-next-line no-console
      logger.info('[LoginMetrics] ▶ start');
    }
  }

  mark(label: string): void {
    if (!this.startedAt) this.start();
    this.marks.push({ label, t: now() });
    if (this.enabled) {
      const last = this.marks[this.marks.length - 2];
      const ref = last ? last.t : this.startedAt;
      const delta = (this.marks[this.marks.length - 1].t - ref).toFixed(0);
      // eslint-disable-next-line no-console
      logger.info(`[LoginMetrics] • ${label} (+${delta}ms)`);
    }
  }

  report(): void {
    if (!this.enabled || !this.startedAt) return;
    const rows = this.marks.map((m, i) => {
      const ref = i === 0 ? this.startedAt : this.marks[i - 1].t;
      return {
        etapa: m.label,
        delta_ms: Math.round(m.t - ref),
        total_ms: Math.round(m.t - this.startedAt),
      };
    });
    // eslint-disable-next-line no-console
    console.groupCollapsed(
      `[LoginMetrics] ◼ total ${Math.round(now() - this.startedAt)}ms`
    );
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.groupEnd();
    this.startedAt = 0;
    this.marks = [];
  }
}

export const loginMetrics = new LoginMetrics();
