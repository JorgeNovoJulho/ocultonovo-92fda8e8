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

/**
 * Maps our pix_key_type to Asaas pixAddressKeyType
 */
function mapPixKeyType(type: string): string {
  const map: Record<string, string> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    email: 'EMAIL',
    phone: 'PHONE',
    random: 'EVP',
  };
  return map[type?.toLowerCase()] || 'CPF';
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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return respond({ error: 'Unauthorized' }, 401);
    }
    const adminUserId = claimsData.claims.sub as string;

    // Verify admin
    const { data: isAdmin } = await supabase.rpc('is_admin_master', { p_user_id: adminUserId });
    if (!isAdmin) {
      return respond({ error: 'Acesso restrito a Admin Master' }, 403);
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const { action, withdrawal_id, admin_notes } = body;

    if (!withdrawal_id) {
      return respond({ error: 'withdrawal_id é obrigatório' }, 400);
    }

    // Get withdrawal request
    const adminSupabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: withdrawal, error: wError } = await adminSupabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', withdrawal_id)
      .single();

    if (wError || !withdrawal) {
      console.error('[creator-payout] Withdrawal not found:', wError);
      return respond({ error: 'Solicitação de saque não encontrada' }, 404);
    }

    if (action === 'reject') {
      // Reject: just update status
      const { error: updateError } = await adminSupabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          reviewed_by: adminUserId,
          reviewed_at: new Date().toISOString(),
          admin_notes: admin_notes || 'Rejeitado pelo administrador',
        })
        .eq('id', withdrawal_id);

      if (updateError) {
        console.error('[creator-payout] Update error:', updateError);
        return respond({ error: 'Erro ao atualizar status' }, 500);
      }

      // Audit log
      await adminSupabase.from('audit_logs').insert({
        admin_id: adminUserId,
        action_type: 'withdrawal_rejected',
        target_resource: 'withdrawal_requests',
        target_id: withdrawal_id,
        details: { amount: withdrawal.net_amount, admin_notes },
      });

      return respond({ success: true, message: 'Saque rejeitado' });
    }

    if (action === 'approve') {
      // Check withdrawal is still pending
      if (withdrawal.status !== 'pending') {
        return respond({ error: `Saque já foi processado (status: ${withdrawal.status})` }, 400);
      }

      // Get Asaas config
      const { data: config } = await adminSupabase
        .from('pix_gateway_config')
        .select('api_key_encrypted, sandbox_mode, gateway_provider')
        .single();

      if (!config?.api_key_encrypted || config.gateway_provider !== 'asaas') {
        return respond({ error: 'Asaas não configurado' }, 500);
      }

      const baseUrl = config.sandbox_mode
        ? 'https://sandbox.asaas.com/api/v3'
        : 'https://api.asaas.com/v3';
      const apiKey = config.api_key_encrypted;

      // Update to processing
      await adminSupabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          reviewed_by: adminUserId,
          reviewed_at: new Date().toISOString(),
          admin_notes: admin_notes || null,
        })
        .eq('id', withdrawal_id);

      // Send PIX transfer via Asaas
      const transferBody = {
        value: withdrawal.net_amount,
        pixAddressKey: withdrawal.pix_key,
        pixAddressKeyType: mapPixKeyType(withdrawal.pix_key_type),
        description: `Saque criador #${withdrawal_id.substring(0, 8)} - ${new Date().toLocaleDateString('pt-BR')}`,
      };

      console.log('[creator-payout] Sending Asaas transfer:', JSON.stringify(transferBody));

      const transferRes = await fetch(`${baseUrl}/transfers`, {
        method: 'POST',
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transferBody),
      });

      const transferText = await transferRes.text();
      console.log('[creator-payout] Asaas response:', transferRes.status, transferText.substring(0, 500));

      let transferData: any = {};
      try {
        transferData = JSON.parse(transferText);
      } catch (_) {}

      if (!transferRes.ok) {
        const errorMsg = transferData.errors?.[0]?.description || transferData.message || 'Erro na transferência Asaas';
        console.error('[creator-payout] Asaas error:', errorMsg);

        // Revert to pending on failure
        await adminSupabase
          .from('withdrawal_requests')
          .update({
            status: 'pending',
            admin_notes: `Erro Asaas: ${errorMsg}`,
            asaas_transfer_status: 'FAILED',
          })
          .eq('id', withdrawal_id);

        // Audit log
        await adminSupabase.from('audit_logs').insert({
          admin_id: adminUserId,
          action_type: 'withdrawal_payout_failed',
          target_resource: 'withdrawal_requests',
          target_id: withdrawal_id,
          details: { amount: withdrawal.net_amount, error: errorMsg },
        });

        return respond({ success: false, message: `Erro Asaas: ${errorMsg}` });
      }

      // Transfer created successfully
      const asaasTransferId = transferData.id;
      const asaasStatus = transferData.status || 'PENDING';

      await adminSupabase
        .from('withdrawal_requests')
        .update({
          status: asaasStatus === 'DONE' ? 'paid' : 'completed',
          asaas_transfer_id: asaasTransferId,
          asaas_transfer_status: asaasStatus,
          paid_at: asaasStatus === 'DONE' ? new Date().toISOString() : null,
        })
        .eq('id', withdrawal_id);

      // Deduct balance from creator profile
      const { data: profile } = await adminSupabase
        .from('profiles')
        .select('id, balance')
        .eq('user_id', withdrawal.user_id)
        .single();

      if (profile) {
        const newBalance = Math.max(0, (profile.balance || 0) - withdrawal.amount);
        await adminSupabase
          .from('profiles')
          .update({ balance: newBalance })
          .eq('id', profile.id);
      }

      // Audit log
      await adminSupabase.from('audit_logs').insert({
        admin_id: adminUserId,
        action_type: 'withdrawal_payout_success',
        target_resource: 'withdrawal_requests',
        target_id: withdrawal_id,
        details: {
          amount: withdrawal.net_amount,
          asaas_transfer_id: asaasTransferId,
          asaas_status: asaasStatus,
          pix_key: withdrawal.pix_key,
          pix_key_type: withdrawal.pix_key_type,
        },
      });

      // Create notification for creator
      await adminSupabase.from('notifications').insert({
        user_id: withdrawal.user_id,
        type: 'withdrawal_paid',
        title: '💰 Saque Processado!',
        body: `Seu saque de R$ ${withdrawal.net_amount.toFixed(2)} foi enviado via PIX.`,
        data: { withdrawal_id, amount: withdrawal.net_amount },
      });

      return respond({
        success: true,
        message: `Transferência PIX criada com sucesso`,
        transfer: {
          id: asaasTransferId,
          status: asaasStatus,
          value: transferData.value,
        },
      });
    }

    return respond({ error: 'Ação inválida. Use: approve ou reject' }, 400);

  } catch (err) {
    console.error('[creator-payout] Error:', err);
    return respond({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
});
