import { executeDualSplit } from './split.ts';
import { findActiveAffiliate } from './affiliate.ts';
import { notifyDiscord } from './logging.ts';
import { creditWalletTopup } from './wallet.ts';

// Verifica pagamento Mercado Pago.
export async function checkMercadoPagoPayment(
  accessToken: string, paymentId: string,
): Promise<{ paid: boolean; amount: number }> {
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json();
      return { paid: data.status === 'approved', amount: data.transaction_amount || 0 };
    }
  } catch (err) {
    console.error('[PIX Webhook] Mercado Pago check error:', err);
  }
  return { paid: false, amount: 0 };
}

// Core: processa pagamento confirmado (subscription / PPV / wallet top-up).
export async function processConfirmedPayment(
  supabase: any,
  externalId: string,
  amount: number,
  provider: string,
): Promise<void> {
  console.log(`[PIX Webhook] Processing payment: ${externalId} R$${amount} via ${provider}`);

  // ── Bridge: Economia Social Premium ───────────────────────────────
  // Se o externalId corresponder a uma compra pendente em
  // oculto_social_economy_purchases, marca como pago e ativa o produto.
  try {
    const { data: ecoRes } = await supabase.rpc('social_economy_mark_paid', {
      p_asaas_payment_id: externalId,
    });
    if (ecoRes && (ecoRes as any).ok) {
      console.log('[PIX Webhook] Social Economy purchase activated:', JSON.stringify(ecoRes));
      return;
    }
  } catch (err) {
    console.warn('[PIX Webhook] social_economy_mark_paid skipped:', (err as any)?.message);
  }

  let transaction: any = null;

  const { data: tx1 } = await supabase
    .from('transactions')
    .select('*, profiles!transactions_user_id_fkey(id, user_id, plan_type)')
    .eq('external_id', externalId)
    .eq('status', 'pending')
    .maybeSingle();

  if (tx1) {
    transaction = tx1;
  } else {
    const { data: tx2 } = await supabase
      .from('transactions')
      .select('*, profiles!transactions_user_id_fkey(id, user_id, plan_type)')
      .ilike('pix_code', `%${externalId}%`)
      .eq('status', 'pending')
      .maybeSingle();
    transaction = tx2;
  }

  if (!transaction) {
    console.log('[PIX Webhook] No pending transaction for:', externalId);
    return;
  }

  await supabase
    .from('transactions')
    .update({ status: 'completed', provider, completed_at: new Date().toISOString() })
    .eq('id', transaction.id);

  const profileId = transaction.user_id;
  const isSubscription = transaction.type === 'subscription';
  const isPPV          = transaction.type === 'ppv' || transaction.type === 'content_purchase';

  const flowType: 'platform_plan' | 'creator_content' | 'wallet_topup' =
    isSubscription ? 'platform_plan' :
    isPPV          ? 'creator_content' :
                     'wallet_topup';

  const affiliateId = await findActiveAffiliate(supabase, profileId);
  const sellerId    = isPPV ? transaction.seller_id : null;

  const split = await executeDualSplit(
    supabase, transaction.id, externalId, flowType, amount, sellerId, affiliateId, provider,
  );
  console.log(`[PIX Webhook] Split: ${JSON.stringify(split)}`);

  await supabase.from('payment_splits').upsert({
    transaction_external_id: externalId,
    total_amount: split.gross,
    platform_fee: split.platform,
    creator_amount: split.creator,
    platform_fee_percent: isSubscription ? 95 : 20,
    affiliate_id: split.affiliate_id ?? null,
    affiliate_amount: split.affiliate ?? 0,
    affiliate_applied: !!split.affiliate_applied,
    affiliate_rejection_reason: split.rejection_reason ?? null,
    processed_at: new Date().toISOString(),
  }, { onConflict: 'transaction_external_id' }).then(() => null).catch(() => null);

  if (isSubscription) {
    const planType = transaction.description?.includes('annual') ? 'annual' : 'monthly';
    const currentPlanType = transaction.profiles?.plan_type;
    const isFirstSubscription = !currentPlanType || currentPlanType === 'free';
    const baseDays = planType === 'annual' ? 365 : 30;
    const bonusDays = isFirstSubscription ? (planType === 'annual' ? 60 : 30) : 0;
    const totalDays = baseDays + bonusDays;

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + totalDays);

    console.log(`[PIX Webhook] Plan activation: ${planType} | days: ${totalDays} | Split: Tax R$${split.tax}, Platform R$${split.platform}, Affiliate R$${split.affiliate}`);

    await supabase
      .from('profiles')
      .update({
        plan_type: planType === 'annual' ? 'vip' : 'premium',
        payment_status: 'active',
        payment_due_date: nextDue.toISOString(),
      })
      .eq('id', profileId);

    notifyDiscord(
      `✅ **Assinatura PIX Confirmada!**\n📋 Plano: ${planType}\n🔗 Provider: ${provider}`,
      supabase,
    ).catch(() => null);

    await supabase.from('discipline_history').insert({
      user_id: profileId,
      action: 'payment_confirmed',
      reason: `PIX confirmado R$ ${amount.toFixed(2)} | Tax R$${split.tax} | Casa R$${split.platform} | Afiliado R$${split.affiliate}`,
      metadata: { external_id: externalId, plan_type: planType, provider, split },
    }).catch(() => null);

    if (affiliateId && split.affiliate > 0) {
      await supabase.from('transactions').insert({
        user_id: affiliateId, amount: split.affiliate, type: 'affiliate_commission',
        status: 'completed', description: `Comissão afiliado (5%) — R$ ${split.affiliate.toFixed(2)}`,
        external_id: `affiliate_${transaction.id}`, provider: 'platform',
      }).catch(() => null);
    }

    await supabase.rpc('record_referral_subscription_commission', {
      p_referred_user_id: profileId,
      p_subscription_id: transaction.id,
      p_gross_amount: amount,
      p_is_recurring: !isFirstSubscription,
    }).then(({ error }: any) => {
      if (error) console.error('[PIX Webhook] referral commission record failed:', error.message);
    }).catch(() => null);

    // [Referral v3] Engine consolidada de indicação da plataforma (FREE→Premium/VIP).
    // Não-bloqueante e idempotente: a própria RPC valida janela, plano, primeira assinatura
    // e antifraude antes de creditar.
    if (isFirstSubscription) {
      const planForReferral = planType === 'annual' ? 'vip' : 'premium';
      await supabase.rpc('referral_on_first_paid_subscription', {
        p_user_id: profileId,
        p_plan: planForReferral,
        p_gross_amount: amount,
        p_source_ref: transaction.id,
      }).then(({ error }: any) => {
        if (error) console.error('[PIX Webhook] referral v3 engine failed:', error.message);
      }).catch(() => null);
    }

    console.log(`[PIX Webhook] Subscription activated for profile ${profileId}`);

  } else if (isPPV) {
    if (sellerId && split.creator > 0) {
      await supabase.from('transactions').insert({
        user_id: sellerId, amount: split.creator, type: 'ppv_income', status: 'completed',
        category: 'creator_content',
        description: `Venda conteúdo — bruto R$${split.gross} | Tax R$${split.tax} | Taxa R$${split.platform} | Líquido R$${split.creator}`,
        external_id: `split_ppv_${externalId}`, seller_id: sellerId, provider: 'platform',
      }).catch(() => null);

      console.log(`[PIX Webhook] PPV: Creator ${sellerId} credited R$${split.creator}`);

      await supabase.rpc('oculto_settle_creator_debts', {
        p_creator_id: sellerId,
        p_available_amount: split.creator,
      }).then(({ data, error }: any) => {
        if (error) console.error('[PIX Webhook] settle debts failed:', error.message);
        else if (data) console.log('[PIX Webhook] settle debts result:', JSON.stringify(data));
      }).catch(() => null);

      notifyDiscord(`🎬 **Venda PPV Confirmada!**\n👤 Criador recebeu comissão\n🔗 Provider: ${provider}`, supabase).catch(() => null);

      if (affiliateId && split.affiliate > 0) {
        await supabase.from('transactions').insert({
          user_id: affiliateId, amount: split.affiliate, type: 'affiliate_commission',
          status: 'completed', description: `Comissão afiliado PPV (5%) — R$ ${split.affiliate.toFixed(2)}`,
          external_id: `affiliate_ppv_${transaction.id}`, provider: 'platform',
        }).catch(() => null);
      }
    }

  } else {
    await creditWalletTopup(supabase, profileId, amount);
  }

  // Push notification (non-blocking)
  const userId = transaction.profiles?.user_id;
  if (userId) {
    supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: userId,
        title: '✅ Pagamento PIX Confirmado!',
        body: isSubscription
          ? 'Sua assinatura foi ativada!'
          : `R$ ${amount.toFixed(2)} adicionados à sua carteira.`,
        url: isSubscription ? '/feed' : '/wallet',
      },
    }).catch(() => null);
  }

  // Recover abandoned cart
  supabase
    .from('abandoned_carts')
    .update({ status: 'recovered', recovered_at: new Date().toISOString() })
    .eq('user_id', profileId)
    .eq('status', 'pending')
    .then(() => null)
    .catch(() => null);
}
