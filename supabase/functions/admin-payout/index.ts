import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { assertPlatformFeature, betaBlockedResponse } from '../_shared/betaGuard.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getAsaasConfig(supabase: any) {
  const { data } = await supabase.from('pix_gateway_config').select('api_key_encrypted, gateway_provider').single();
  if (!data?.api_key_encrypted || data.gateway_provider !== 'asaas') {
    return null;
  }
  // Force production URL — sandbox_mode is no longer evaluated for Asaas
  const baseUrl = 'https://www.asaas.com/api/v3';
  return { apiKey: data.api_key_encrypted, baseUrl };
}

// ── GET BALANCE ────────────────────────────────────────────────────────────
async function getBalance(apiKey: string, baseUrl: string) {
  const url = `${baseUrl}/finance/balance`;
  console.log('[admin-payout] Fetching balance from:', url);
  try {
    const res = await fetch(url, {
      headers: { 'access_token': apiKey },
    });
    const text = await res.text();
    console.log('[admin-payout] balance response status:', res.status, 'body:', text.substring(0, 500));
    
    if (!res.ok) {
      // Try to parse error details
      let errorMsg = `Erro ao consultar saldo (HTTP ${res.status})`;
      try {
        if (text.trim().startsWith('{')) {
          const parsed = JSON.parse(text);
          errorMsg = parsed.errors?.[0]?.description || parsed.message || errorMsg;
        }
      } catch (_) {}
      return { success: false, message: errorMsg };
    }
    
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch (_) {
      return { success: false, message: 'Resposta inválida do gateway' };
    }
    
    return {
      success: true,
      balance: data.balance ?? 0,
      statistics: {
        available: data.balance ?? 0,
        pending: (data.statistics?.income ?? 0) - (data.statistics?.expense ?? 0) - (data.balance ?? 0),
      },
    };
  } catch (err) {
    console.error('[admin-payout] balance fetch error:', err);
    return { success: false, message: 'Falha na conexão com o gateway' };
  }
}

// ── CREATE TRANSFER ────────────────────────────────────────────────────────
async function createTransfer(apiKey: string, baseUrl: string, amount: number) {
  // First get the bank account info
  const bankRes = await fetch(`${baseUrl}/bankAccounts?offset=0&limit=1`, {
    headers: { 'access_token': apiKey },
  });

  let bankAccountId: string | null = null;
  if (bankRes.ok) {
    const bankData = await bankRes.json();
    if (bankData.data?.length > 0) {
      bankAccountId = bankData.data[0].id;
    }
  }

  const transferBody: Record<string, unknown> = {
    value: amount,
    operationType: 'PIX',
    description: `Saque administrativo - ${new Date().toISOString()}`,
  };

  if (bankAccountId) {
    transferBody.bankAccount = { id: bankAccountId };
  }

  const res = await fetch(`${baseUrl}/transfers`, {
    method: 'POST',
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(transferBody),
  });

  const text = await res.text();
  let data: any = {};
  try {
    if (text.trim().startsWith('{')) data = JSON.parse(text);
  } catch (_) {}

  if (!res.ok) {
    const errorMsg = data.errors?.[0]?.description || data.message || 'Erro ao criar transferência';
    return { success: false, message: errorMsg };
  }

  return {
    success: true,
    transfer: {
      id: data.id,
      value: data.value,
      status: data.status,
      transferFee: data.transferFee ?? 0,
      operationType: data.operationType,
      dateCreated: data.dateCreated,
    },
  };
}

// ── GET TRANSFER INFO (fees) ───────────────────────────────────────────────
async function getTransferFees(apiKey: string, baseUrl: string) {
  // Asaas doesn't have a dedicated fees endpoint; we'll return known defaults
  return {
    success: true,
    fees: {
      pix: 0, // Asaas typically charges R$0 for PIX transfers
      ted: 5.00,
      description: 'PIX: Gratuito | TED: R$ 5,00',
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // === BETA CONTROL ===
  const __betaBlock = await assertPlatformFeature('payouts');
  if (__betaBlock) return betaBlockedResponse(__betaBlock, corsHeaders);
  // ====================


  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return respond({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('[admin-payout] Auth error:', userError);
      return respond({ error: 'Unauthorized' }, 401);
    }
    const userId = user.id;

    // Verify admin
    const { data: isAdmin } = await supabase.rpc('is_admin_master', { p_user_id: userId });
    if (!isAdmin) {
      return respond({ error: 'Acesso restrito a Admin Master' }, 403);
    }

    // Parse body
    let body: any = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith('{')) body = JSON.parse(text);
    } catch (_) {}

    const action = body.action || 'get-balance';

    // Get Asaas config
    const config = await getAsaasConfig(supabase);
    if (!config) {
      return respond({ success: false, message: 'Asaas não configurado ou provedor diferente' });
    }

    switch (action) {
      case 'get-balance': {
        const result = await getBalance(config.apiKey, config.baseUrl);
        return respond(result);
      }

      case 'get-fees': {
        const result = await getTransferFees(config.apiKey, config.baseUrl);
        return respond(result);
      }

      case 'create-transfer': {
        const amount = parseFloat(body.amount);
        if (!amount || amount <= 0) {
          return respond({ success: false, message: 'Valor inválido' });
        }

        // Double-check prevention: check if there's a transfer in the last 30 seconds
        const { data: recentTransfer } = await (supabase as any)
          .from('audit_logs')
          .select('id')
          .eq('action_type', 'admin_payout_requested')
          .eq('admin_id', userId)
          .gte('created_at', new Date(Date.now() - 30_000).toISOString())
          .limit(1);

        if (recentTransfer?.length > 0) {
          return respond({ success: false, message: 'Aguarde 30 segundos entre transferências' });
        }

        const result = await createTransfer(config.apiKey, config.baseUrl, amount);

        // Audit log
        await (supabase as any).from('audit_logs').insert({
          admin_id: userId,
          action_type: 'admin_payout_requested',
          target_resource: 'asaas_transfer',
          target_id: result.transfer?.id || null,
          details: {
            amount,
            success: result.success,
            message: result.message || null,
            transfer_status: result.transfer?.status || null,
            transfer_fee: result.transfer?.transferFee || 0,
          },
          user_agent: req.headers.get('user-agent'),
        });

        return respond(result);
      }

      default:
        return respond({ success: false, message: 'Ação não reconhecida' });
    }
  } catch (err) {
    console.error('[admin-payout] Error:', err);
    return respond({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
