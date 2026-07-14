import type { PixWebhookPayload } from './types.ts';

// Valida token ASAAS (header asaas-access-token). Retorna 'unauthorized' se inválido.
export function validateAsaasToken(
  req: Request,
  payloadIsAsaas: boolean,
): { ok: boolean; isAsaasRequest: boolean } {
  const asaasToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  const incomingToken =
    req.headers.get('asaas-access-token') ||
    req.headers.get('x-asaas-access-token') ||
    req.headers.get('authorization')?.replace('Bearer ', '');
  const isAsaasRequest = !!asaasToken && incomingToken === asaasToken;
  if (payloadIsAsaas && asaasToken && !isAsaasRequest) {
    return { ok: false, isAsaasRequest };
  }
  return { ok: true, isAsaasRequest };
}

export function detectAsaasShape(payload: PixWebhookPayload): boolean {
  return !!payload.event && (!!payload.payment || !!payload.subscription);
}
