// =====================================================================
// pix-webhook — Webhook canônico ASAAS (refatorado em handlers modulares).
// Comportamento idêntico à versão monolítica anterior; apenas reorganização.
// Handlers em ./handlers/*.ts.
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { corsHeaders, type PixWebhookPayload } from './handlers/types.ts';
import { detectAsaasShape, validateAsaasToken } from './handlers/validation.ts';
import {
  insertAsaasLog, finalizeAsaasLog, logLegacyEvent,
} from './handlers/logging.ts';
import { processRefund } from './handlers/paymentRefunded.ts';
import { processChargeback } from './handlers/chargeback.ts';
import {
  processSubscriptionEvent, processSubscriptionPayment,
} from './handlers/subscriptions.ts';
import {
  processConfirmedPayment, checkMercadoPagoPayment,
} from './handlers/paymentReceived.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: PixWebhookPayload = await req.json();
    console.log('[PIX Webhook] Received:', JSON.stringify(payload).substring(0, 300));

    const payloadIsAsaas = detectAsaasShape(payload);

    // Validação de token ASAAS
    const tokenCheck = validateAsaasToken(req, payloadIsAsaas);
    if (!tokenCheck.ok) {
      console.warn('[PIX Webhook] Invalid Asaas token — rejected');
      return respond({ success: false, error: 'Unauthorized' }, 401);
    }

    const { data: config } = await supabase.from('pix_gateway_config').select('*').maybeSingle();
    if (!config) {
      console.error('[PIX Webhook] No gateway config');
      return respond({ success: false, error: 'Gateway not configured' }, 400);
    }

    // Idempotência ASAAS — bloqueia duplicatas com 200
    let logId: string | null = null;
    if (payloadIsAsaas) {
      const { duplicated, logId: id } = await insertAsaasLog(supabase, payload);
      if (duplicated) {
        console.log('[PIX Webhook] Duplicate ASAAS event ignored');
        return respond({ success: true, duplicated: true });
      }
      logId = id;
    }

    // Log legado (best-effort)
    logLegacyEvent(supabase, config.gateway_provider, payload);

    let processed = false;
    const startedAt = Date.now();

    // ── Eventos extras ASAAS (refund / chargeback / subscription) ─────
    if (payloadIsAsaas && payload.event) {
      const ev = payload.event;
      const subId = payload.payment?.subscription || payload.subscription?.id || null;

      if (ev === 'PAYMENT_REFUNDED' && payload.payment) {
        await processRefund(supabase, payload.payment.id, payload.payment.value);
        if (subId) {
          await processSubscriptionPayment(supabase, subId, payload.payment.id, ev, payload.payment.value, payload);
        }
        processed = true;
      } else if (ev.startsWith('PAYMENT_CHARGEBACK_') && payload.payment) {
        await processChargeback(supabase, payload.payment.id, payload.payment.value, ev);
        if (subId && ev === 'PAYMENT_CHARGEBACK_REQUESTED') {
          await processSubscriptionPayment(supabase, subId, payload.payment.id, ev, payload.payment.value, payload);
        }
        processed = true;
      } else if (ev === 'PAYMENT_OVERDUE' && payload.payment && subId) {
        await processSubscriptionPayment(supabase, subId, payload.payment.id, ev, payload.payment.value, payload);
        processed = true;
      } else if (ev === 'PAYMENT_RECEIVED_AFTER_OVERDUE' && payload.payment && subId) {
        await processSubscriptionPayment(supabase, subId, payload.payment.id, ev, payload.payment.value, payload);
        processed = true;
      } else if ((ev === 'PAYMENT_CONFIRMED' || ev === 'PAYMENT_RECEIVED') && payload.payment && subId) {
        // Cobrança recorrente — também segue p/ processConfirmedPayment se existir tx local
        await processSubscriptionPayment(supabase, subId, payload.payment.id, ev, payload.payment.value, payload);
      } else if (ev.startsWith('SUBSCRIPTION_') && payload.subscription?.id) {
        await processSubscriptionEvent(supabase, payload.subscription.id, ev, payload);
        processed = true;
      }
    }

    if (!processed) {
      switch (config.gateway_provider) {
        case 'mercadopago':
          if (payload.action === 'payment.updated' && payload.data?.id) {
            const result = await checkMercadoPagoPayment(config.api_key_encrypted, payload.data.id);
            if (result.paid) {
              await processConfirmedPayment(supabase, payload.data.id, result.amount, 'mercadopago');
              processed = true;
            }
          }
          break;

        case 'pagseguro':
          if (payload.pix?.length) {
            for (const pix of payload.pix) {
              await processConfirmedPayment(supabase, pix.txid, parseFloat(pix.valor), 'pagseguro');
            }
            processed = true;
          }
          break;

        case 'asaas':
          if (
            payload.payment &&
            (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED')
          ) {
            await processConfirmedPayment(supabase, payload.payment.id, payload.payment.value, 'asaas');
            processed = true;
          } else {
            console.log('[PIX Webhook] Asaas event ignored:', payload.event);
          }
          break;

        case 'gerencianet':
          if (payload.pixList?.length) {
            for (const pix of payload.pixList) {
              if (pix.status === 'CONCLUIDA') {
                await processConfirmedPayment(supabase, pix.txid, parseFloat(pix.valor), 'gerencianet');
              }
            }
            processed = true;
          }
          break;

        default:
          if (payloadIsAsaas && payload.payment &&
            (payload.event === 'PAYMENT_CONFIRMED' || payload.event === 'PAYMENT_RECEIVED')) {
            await processConfirmedPayment(supabase, payload.payment.id, payload.payment.value, 'asaas');
            processed = true;
          } else {
            console.log('[PIX Webhook] Unknown provider / event:', config.gateway_provider, payload.event);
          }
      }
    }

    if (payloadIsAsaas) {
      finalizeAsaasLog(supabase, logId, processed, startedAt);
    }

    return respond({ success: true, processed });

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PIX Webhook] Error:', errMsg);
    return respond({ error: errMsg }, 500);
  }
});
