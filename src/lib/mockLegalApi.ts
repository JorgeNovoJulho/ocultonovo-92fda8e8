import { logger } from '@/lib/logger';
/**
 * Mock API para envio de Denúncias e Contestações.
 * Substituir futuramente por edge function/Supabase real.
 */

export interface ReportPayload {
  contentRef: string;
  reportedUser: string;
  reason: string;
  category: string;
  occurredAt: string; // ISO
  evidence: string;
  attachments?: { name: string; size: number; type: string }[];
}

export interface AppealPayload {
  caseType: 'suspensao' | 'bloqueio' | 'retencao' | 'remocao' | 'comissao';
  caseRef: string;
  decisionDate: string; // ISO date
  reason: string;
  evidence: string;
  attachments?: { name: string; size: number; type: string }[];
}

export interface MockSubmitResult {
  ok: true;
  protocol: string;
  receivedAt: string;
}

function genProtocol(prefix: string) {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rnd}`;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function submitReportMock(payload: ReportPayload): Promise<MockSubmitResult> {
  await delay(900);
  // eslint-disable-next-line no-console
  logger.info('[mockLegalApi] report submitted', payload);
  return {
    ok: true,
    protocol: genProtocol('DEN'),
    receivedAt: new Date().toISOString(),
  };
}

export async function submitAppealMock(payload: AppealPayload): Promise<MockSubmitResult> {
  await delay(900);
  // eslint-disable-next-line no-console
  logger.info('[mockLegalApi] appeal submitted', payload);
  return {
    ok: true,
    protocol: genProtocol('APL'),
    receivedAt: new Date().toISOString(),
  };
}
