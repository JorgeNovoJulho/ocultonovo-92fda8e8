import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuctionRequest {
  action: 'place-bid' | 'verify-card' | 'end-auction' | 'notify-outbid' | 'get-auction';
  auction_id?: string;
  amount?: number;
  card_number?: string;
  card_exp_month?: string;
  card_exp_year?: string;
  card_cvc?: string;
  card_holder_name?: string;
  payer_email?: string;
  payer_cpf?: string;
}

// === Helpers ASAAS ===
async function getAsaasContext(supabase: any) {
  const apiKey = Deno.env.get('ASAAS_API_KEY');
  if (!apiKey) return { apiKey: null as any, baseUrl: '' };
  let isSandbox = Deno.env.get('ASAAS_SANDBOX') === 'true';
  try {
    const { data: cfg } = await supabase
      .from('pix_gateway_config')
      .select('sandbox_mode, gateway_provider')
      .eq('gateway_provider', 'asaas')
      .maybeSingle();
    if (cfg && typeof cfg.sandbox_mode === 'boolean') isSandbox = cfg.sandbox_mode;
  } catch (_) {}
  const baseUrl = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
  return { apiKey, baseUrl, isSandbox };
}

async function findOrCreateCustomer(baseUrl: string, apiKey: string, opts: { name: string; email: string; cpfCnpj?: string; }) {
  // tenta achar por email
  try {
    const r = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(opts.email)}`, { headers: { access_token: apiKey } });
    const j = await r.json();
    if (j?.data?.[0]?.id) return j.data[0].id as string;
  } catch (_) {}
  const cr = await fetch(`${baseUrl}/customers`, {
    method: 'POST',
    headers: { access_token: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name,
      email: opts.email,
      cpfCnpj: opts.cpfCnpj?.replace(/\D/g, '') || undefined,
      notificationDisabled: true,
    }),
  });
  const cd = await cr.json();
  return cd?.id || cd?.errors?.[0]?.description?.match(/Customer already exists: (\w+)/)?.[1] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';

    const authHeader = req.headers.get('Authorization');
    let userId: string | null = null;
    let profileId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', userId)
          .single();
        profileId = profile?.id || null;
      }
    }

    const body: AuctionRequest = await req.json();
    const { action } = body;

    console.log(`[Auction Gateway] Action: ${action}, User: ${userId}`);

    // ===== GET AUCTION =====
    if (action === 'get-auction') {
      const { auction_id } = body;
      const { data: auction, error } = await supabase
        .from('auctions')
        .select(`
          *,
          creator:profiles!auctions_creator_id_fkey(id, name, username, avatar_url),
          current_bidder:profiles!auctions_current_bidder_id_fkey(id, name, username, avatar_url)
        `)
        .eq('id', auction_id)
        .single();

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }
      const { data: bids } = await supabase
        .from('auction_bids')
        .select(`*, bidder:profiles!auction_bids_bidder_id_fkey(id, name, username, avatar_url)`)
        .eq('auction_id', auction_id)
        .order('created_at', { ascending: false })
        .limit(20);

      return new Response(JSON.stringify({ success: true, auction, bids }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== PLACE BID =====
    if (action === 'place-bid') {
      if (!profileId) {
        return new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
        });
      }
      const { auction_id, amount } = body;
      if (!auction_id || !amount) {
        return new Response(JSON.stringify({ success: false, error: 'ID do leilão e valor são obrigatórios' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }
      const { data: result, error } = await supabase.rpc('place_auction_bid', {
        p_auction_id: auction_id, p_bidder_id: profileId, p_amount: amount,
      });
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }
      if (!result.success) {
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      // Notificar quem foi superado (mantido)
      if (result.previous_bidder_id) {
        const { data: previousBidder } = await supabase.from('profiles').select('user_id, name').eq('id', result.previous_bidder_id).single();
        const { data: auction } = await supabase.from('auctions').select('title, current_bid, ends_at').eq('id', auction_id).single();
        if (previousBidder) {
          await supabase.from('notifications').insert({
            user_id: previousBidder.user_id, type: 'auction',
            title: '🔥 Você foi superado!',
            body: `Alguém deu R$ ${amount} no leilão "${auction?.title}". Cubra agora!`,
            data: { auction_id, new_amount: amount },
          });
          try {
            await supabase.functions.invoke('send-push-notification', {
              body: { user_id: previousBidder.user_id, title: '🔥 Você foi superado!', body: `Alguém deu R$ ${amount}.`, url: `/auction/${auction_id}`, requireInteraction: true },
            });
          } catch (_) {}
        }
      }
      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== VERIFY CARD (ASAAS tokenize) =====
    if (action === 'verify-card') {
      if (!profileId || !userId) {
        return new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
        });
      }
      const { apiKey, baseUrl, isSandbox } = await getAsaasContext(supabase);
      if (!apiKey) {
        return new Response(JSON.stringify({ success: false, error: 'ASAAS não configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
        });
      }
      const { card_number, card_exp_month, card_exp_year, card_cvc, card_holder_name, payer_email, payer_cpf } = body;
      if (!card_number || !card_exp_month || !card_exp_year || !card_cvc || !card_holder_name || !payer_email || !payer_cpf) {
        return new Response(JSON.stringify({ success: false, error: 'Dados do cartão/pagador incompletos' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      // 1) Cliente ASAAS
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', profileId).single();
      const customerId = await findOrCreateCustomer(baseUrl, apiKey, {
        name: card_holder_name || prof?.name || 'Bidder',
        email: payer_email,
        cpfCnpj: payer_cpf,
      });
      if (!customerId) {
        return new Response(JSON.stringify({ success: false, error: 'Falha ao criar cliente ASAAS' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502,
        });
      }

      // 2) Tokeniza cartão (ASAAS endpoint dedicado)
      const tokRes = await fetch(`${baseUrl}/creditCard/tokenize`, {
        method: 'POST',
        headers: { access_token: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: customerId,
          creditCard: {
            holderName: card_holder_name,
            number: card_number.replace(/\s/g, ''),
            expiryMonth: card_exp_month,
            expiryYear: card_exp_year,
            ccv: card_cvc,
          },
          creditCardHolderInfo: {
            name: card_holder_name,
            email: payer_email,
            cpfCnpj: payer_cpf.replace(/\D/g, ''),
            postalCode: '00000000',
            addressNumber: '0',
          },
          remoteIp,
        }),
      });
      const tokData = await tokRes.json();
      if (!tokRes.ok || !tokData?.creditCardToken) {
        const errMsg = tokData?.errors?.[0]?.description || 'Cartão inválido ou recusado';
        console.error('[Auction Gateway] Tokenize fail:', tokData);
        return new Response(JSON.stringify({ success: false, error: errMsg }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      const cardLast4 = tokData.creditCardNumber || card_number.slice(-4);
      const cardBrand = tokData.creditCardBrand || 'UNKNOWN';

      await supabase.from('bidder_cards').upsert({
        user_id: profileId,
        asaas_customer_id: customerId,
        asaas_credit_card_token: tokData.creditCardToken,
        card_last_four: cardLast4,
        card_brand: cardBrand,
        is_valid: true,
        verified_at: new Date().toISOString(),
        sandbox_mode: !!isSandbox,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      console.log(`[Auction Gateway] Card tokenized for ${profileId}: ${cardBrand} **** ${cardLast4}`);

      return new Response(JSON.stringify({ success: true, card_last_four: cardLast4, card_brand: cardBrand }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== END AUCTION (charge winner via ASAAS token) =====
    if (action === 'end-auction') {
      const { auction_id } = body;
      const { data: result, error } = await supabase.rpc('end_auction', { p_auction_id: auction_id });
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      const { apiKey, baseUrl } = await getAsaasContext(supabase);

      if (result.success && result.needs_charge && apiKey) {
        try {
          const { data: bidderCard } = await supabase
            .from('bidder_cards')
            .select('asaas_customer_id, asaas_credit_card_token')
            .eq('user_id', result.winner_id)
            .single();

          if (bidderCard?.asaas_credit_card_token && bidderCard?.asaas_customer_id) {
            const due = new Date(); due.setDate(due.getDate() + 1);
            const chargeRes = await fetch(`${baseUrl}/payments`, {
              method: 'POST',
              headers: { access_token: apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customer: bidderCard.asaas_customer_id,
                billingType: 'CREDIT_CARD',
                value: Number(result.winning_amount),
                dueDate: due.toISOString().split('T')[0],
                description: `Leilão arrematado #${auction_id}`,
                creditCardToken: bidderCard.asaas_credit_card_token,
                remoteIp,
              }),
            });
            const chargeData = await chargeRes.json();
            const ok = chargeRes.ok && (chargeData.status === 'CONFIRMED' || chargeData.status === 'RECEIVED' || chargeData.status === 'PENDING');

            if (ok) {
              await supabase.from('auctions').update({ winner_charged: true }).eq('id', auction_id);

              const { data: auction } = await supabase.from('auctions').select('media_url, creator_id, title').eq('id', auction_id).single();
              if (auction) {
                await supabase.from('media_unlocks').insert({
                  user_id: result.winner_id, creator_id: auction.creator_id,
                  media_url: auction.media_url, amount: result.winning_amount, source: 'auction',
                });
                await supabase.from('auctions').update({ content_delivered: true }).eq('id', auction_id);

                const grossAmount = Number(result.winning_amount);
                let affiliateAmount = 0;
                let affiliateId: string | null = null;
                const { data: referral } = await supabase
                  .from('referrals')
                  .select('referrer_id, started_at')
                  .eq('referred_user_id', auction.creator_id)
                  .eq('is_active', true)
                  .maybeSingle();
                if (referral) {
                  const startedAt = new Date(referral.started_at);
                  const twelveMonthsLater = new Date(startedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
                  if (new Date() <= twelveMonthsLater) {
                    affiliateAmount = grossAmount * 0.05;
                    affiliateId = referral.referrer_id;
                  }
                }
                const platformFee = grossAmount * 0.20;
                const taxReserve = grossAmount * 0.06;
                const creatorAmount = grossAmount - platformFee - taxReserve - affiliateAmount;

                await supabase.rpc('increment_balance', { p_profile_id: auction.creator_id, p_amount: creatorAmount });
                await supabase.from('transactions').insert({
                  user_id: auction.creator_id, type: 'auction_sale', amount: creatorAmount, status: 'completed',
                  metadata: {
                    auction_id, gateway: 'asaas', asaas_payment_id: chargeData.id,
                    gross_amount: grossAmount, platform_fee: platformFee, platform_fee_pct: '20%',
                    tax_reserve: taxReserve, tax_reserve_pct: '6%',
                    affiliate_fee: affiliateAmount, affiliate_fee_pct: affiliateId ? '5%' : '0%',
                    affiliate_id: affiliateId, net_amount: creatorAmount,
                    winner_id: result.winner_id, split: affiliateId ? '69/20/6/5' : '74/20/6',
                  },
                });

                if (affiliateId && affiliateAmount > 0) {
                  await supabase.rpc('increment_balance', { p_profile_id: affiliateId, p_amount: affiliateAmount });
                  await supabase.from('transactions').insert({
                    user_id: affiliateId, type: 'affiliate_commission', amount: affiliateAmount, status: 'completed',
                    metadata: { auction_id, source: 'auction_sale', gross_amount: grossAmount, commission_pct: '5%' },
                  });
                }
                console.log(`[Auction Gateway] ASAAS charge OK ${chargeData.id} | Net R$${creatorAmount.toFixed(2)}`);
              }
            } else {
              console.error('[Auction Gateway] ASAAS charge failed:', chargeData);
              await supabase.from('auctions').update({ status: 'failed' }).eq('id', auction_id);
            }
          } else {
            console.warn('[Auction Gateway] Winner sem cartão tokenizado — marcando failed');
            await supabase.from('auctions').update({ status: 'failed' }).eq('id', auction_id);
          }
        } catch (chargeError) {
          console.error('[Auction Gateway] Charge error:', chargeError);
        }
      }

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: 'Ação não reconhecida' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  } catch (error: any) {
    console.error('[Auction Gateway] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
