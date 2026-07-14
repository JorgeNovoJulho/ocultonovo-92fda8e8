// =====================================================================
// asaas-stress-simulator (Fase 2)
// Cenários de teste de concorrência ASAAS — sintéticos, sem cobrança real.
// Acesso: somente Admin Master. Rate limit: 1 run / 60s.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Scenario =
  | 'duplicated_webhooks'      // 50 webhooks com mesmo event_id
  | 'unique_webhooks'          // 50 webhooks com event_ids distintos
  | 'split_with_affiliate'     // split creator_content com afiliado
  | 'split_without_affiliate'  // split creator_content sem afiliado
  | 'refund_duplicated'        // PAYMENT_REFUNDED 2x mesmo id
  | 'chargeback_requested'     // PAYMENT_CHARGEBACK_REQUESTED
  | 'subscription_lifecycle'   // SUBSCRIPTION_CREATED + UPDATED + INACTIVATED
  | 'old_webhook_retry';       // mesmo evento enviado 3x sequenciais

interface SimRequest {
  scenario: Scenario;
  count?: number;
  confirm?: string; // deve ser "I_UNDERSTAND_THIS_IS_A_STRESS_TEST"
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const asaasToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth ───────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
    if (!authHeader) return respond({ error: 'unauthorized' }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader);
    if (userErr || !userData?.user) return respond({ error: 'invalid token' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, is_admin')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    const isMaster = profile?.username === 'ocultomaster' || profile?.is_admin === true;
    if (!isMaster) return respond({ error: 'forbidden' }, 403);

    const body = (await req.json().catch(() => ({}))) as SimRequest;

    // ── Dupla confirmação ──────────────────────────────────────────────────
    if (body.confirm !== 'I_UNDERSTAND_THIS_IS_A_STRESS_TEST') {
      return respond({ error: 'missing_confirmation' }, 400);
    }
    if (!body.scenario) return respond({ error: 'scenario_required' }, 400);

    // ── Rate limit: 1 run / 60s ────────────────────────────────────────────
    const { data: recentRun } = await supabase
      .from('oculto_stress_test_runs')
      .select('id, started_at')
      .eq('triggered_by', userData.user.id)
      .gte('started_at', new Date(Date.now() - 60_000).toISOString())
      .maybeSingle();
    if (recentRun) {
      return respond({ error: 'rate_limited', message: 'Aguarde 60s entre testes' }, 429);
    }

    // ── Registra run ───────────────────────────────────────────────────────
    const { data: run } = await supabase
      .from('oculto_stress_test_runs')
      .insert({
        triggered_by: userData.user.id,
        scenario: body.scenario,
        params: { count: body.count ?? 50 },
      })
      .select('id')
      .single();

    const runId = run!.id;
    const webhookUrl = `${supabaseUrl}/functions/v1/pix-webhook`;

    // ── Helper: dispara payload no pix-webhook ────────────────────────────
    const fireWebhook = async (payload: any): Promise<{ ok: boolean; duplicated?: boolean; ms: number }> => {
      const t = Date.now();
      try {
        const r = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'asaas-access-token': asaasToken },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, duplicated: !!j?.duplicated, ms: Date.now() - t };
      } catch {
        return { ok: false, ms: Date.now() - t };
      }
    };

    // ── Cenários ──────────────────────────────────────────────────────────
    const tag = `STRESS_${runId.substring(0, 8)}`;
    const count = Math.min(Math.max(body.count ?? 50, 1), 200);
    const t0 = Date.now();
    const result: any = { scenario: body.scenario, runId, fired: 0, ok: 0, duplicated: 0, failed: 0, latencies: [] as number[] };

    const record = (r: { ok: boolean; duplicated?: boolean; ms: number }) => {
      result.fired++;
      result.latencies.push(r.ms);
      if (r.ok) {
        if (r.duplicated) result.duplicated++;
        else result.ok++;
      } else result.failed++;
    };

    switch (body.scenario) {
      case 'duplicated_webhooks': {
        const eventId = `${tag}_DUP`;
        const payload = { id: eventId, event: 'PAYMENT_CONFIRMED', payment: { id: `${tag}_PAY`, status: 'CONFIRMED', value: 50 } };
        const promises = Array.from({ length: count }, () => fireWebhook(payload));
        (await Promise.all(promises)).forEach(record);
        result.expected = `1 ok + ${count - 1} duplicated`;
        break;
      }
      case 'unique_webhooks': {
        const promises = Array.from({ length: count }, (_, i) => {
          const id = `${tag}_U_${i}`;
          return fireWebhook({ id, event: 'PAYMENT_CONFIRMED', payment: { id: `${tag}_PAY_${i}`, status: 'CONFIRMED', value: 10 + i } });
        });
        (await Promise.all(promises)).forEach(record);
        result.expected = `${count} ok, 0 duplicated`;
        break;
      }
      case 'split_with_affiliate':
      case 'split_without_affiliate': {
        const flow = 'creator_content';
        const withAff = body.scenario === 'split_with_affiliate';
        const fakeCreator = profile!.id;
        const fakeAff = withAff ? profile!.id : null;
        // chama RPC diretamente para validar idempotência do split
        const dedupKey = `${tag}_SPLIT`;
        const calls = Array.from({ length: count }, () =>
          supabase.rpc('process_payment_split', {
            p_transaction_id: dedupKey,
            p_payment_external_id: dedupKey,
            p_flow_type: flow,
            p_gross_amount: 100,
            p_creator_id: fakeCreator,
            p_affiliate_id: fakeAff,
            p_provider: 'stress_test',
          })
        );
        const results = await Promise.all(calls);
        const replays = results.filter((r: any) => r.data?.idempotent_replay).length;
        result.fired = count;
        result.ok = count - replays;
        result.duplicated = replays;
        result.expected = `1 split criado + ${count - 1} idempotent_replay`;
        break;
      }
      case 'refund_duplicated': {
        const eventId = `${tag}_REFUND`;
        const payload = { id: eventId, event: 'PAYMENT_REFUNDED', payment: { id: `${tag}_PAY_R`, status: 'REFUNDED', value: 30 } };
        for (let i = 0; i < Math.min(count, 5); i++) record(await fireWebhook(payload));
        result.expected = '1 ok + N-1 duplicated (sem reverter saldo 2x)';
        break;
      }
      case 'chargeback_requested': {
        const eventId = `${tag}_CB`;
        const payload = { id: eventId, event: 'PAYMENT_CHARGEBACK_REQUESTED', payment: { id: `${tag}_PAY_CB`, status: 'CHARGEBACK_REQUESTED', value: 75 } };
        for (let i = 0; i < Math.min(count, 5); i++) record(await fireWebhook(payload));
        result.expected = '1 chargeback registrado';
        break;
      }
      case 'subscription_lifecycle': {
        const subId = `${tag}_SUB`;
        for (const ev of ['SUBSCRIPTION_CREATED', 'SUBSCRIPTION_UPDATED', 'SUBSCRIPTION_INACTIVATED']) {
          record(await fireWebhook({
            id: `${tag}_${ev}`,
            event: ev,
            subscription: { id: subId, status: ev === 'SUBSCRIPTION_INACTIVATED' ? 'INACTIVE' : 'ACTIVE', customer: `${tag}_CUST` },
          }));
        }
        result.expected = '3 ok (lifecycle completo)';
        break;
      }
      case 'old_webhook_retry': {
        const eventId = `${tag}_OLD`;
        const payload = { id: eventId, event: 'PAYMENT_CONFIRMED', payment: { id: `${tag}_PAY_OLD`, status: 'CONFIRMED', value: 25 } };
        for (let i = 0; i < 3; i++) {
          record(await fireWebhook(payload));
          await new Promise((r) => setTimeout(r, 150));
        }
        result.expected = '1 ok + 2 duplicated';
        break;
      }
    }

    // marca logs como stress_test
    await supabase.from('oculto_asaas_webhook_logs')
      .update({ stress_test: true })
      .like('asaas_event_id', `${tag}%`);
    await supabase.from('transaction_split_logs')
      .update({ stress_test: true })
      .like('payment_external_id', `${tag}%`);

    const elapsed = Date.now() - t0;
    const lats = (result.latencies as number[]).sort((a, b) => a - b);
    const summary = {
      ...result,
      latencies: undefined,
      elapsed_ms: elapsed,
      latency_p50: lats[Math.floor(lats.length * 0.5)] ?? 0,
      latency_p95: lats[Math.floor(lats.length * 0.95)] ?? 0,
    };

    await supabase.from('oculto_stress_test_runs').update({
      status: 'success', result: summary, finished_at: new Date().toISOString(),
    }).eq('id', runId);

    return respond({ success: true, ...summary });
  } catch (e) {
    return respond({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});
