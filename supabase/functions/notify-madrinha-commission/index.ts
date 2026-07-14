import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CommissionPayload {
  madrinha_user_id: string;
  afilhada_name: string;
  commission_amount: number;
  referral_id: string;
  transaction_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: CommissionPayload = await req.json();
    const { madrinha_user_id, afilhada_name, commission_amount, referral_id, transaction_id } = payload;

    if (!madrinha_user_id || !commission_amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'madrinha_user_id e commission_amount são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`[Madrinha Commission] Sending notification to user: ${madrinha_user_id}`);
    console.log(`[Madrinha Commission] Amount: R$ ${commission_amount} from ${afilhada_name}`);

    // Format currency
    const formattedAmount = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(commission_amount);

    // Call the existing send-push-notification function
    const pushPayload = {
      user_id: madrinha_user_id,
      title: '💰 Comissão Recebida!',
      body: `Sua afilhada ${afilhada_name || 'uma criadora'} fez uma venda. Você ganhou ${formattedAmount}`,
      url: '/madrinha-analytics',
      type: 'madrinha_commission',
      requireInteraction: true,
      tag: `commission-${transaction_id}`,
      actions: [
        { action: 'view', title: 'Ver Analytics' },
        { action: 'close', title: 'Fechar' },
      ],
    };

    // Call the send-push-notification function
    const { data: pushResult, error: pushError } = await supabase.functions.invoke(
      'send-push-notification',
      { body: pushPayload }
    );

    if (pushError) {
      console.error('[Madrinha Commission] Error sending push:', pushError);
    } else {
      console.log('[Madrinha Commission] Push notification result:', pushResult);
    }

    // Also create an in-app notification if it doesn't exist yet
    // (The trigger should have created it, but let's be safe)
    const { error: notifError } = await supabase
      .from('notifications')
      .upsert({
        user_id: madrinha_user_id,
        type: 'gift_received',
        title: '💰 Comissão Recebida!',
        body: `Sua afilhada ${afilhada_name || 'uma criadora'} fez uma venda. Você ganhou ${formattedAmount}`,
        data: {
          type: 'madrinha_commission',
          commission_amount,
          referral_id,
          transaction_id,
        },
        is_read: false,
      }, {
        onConflict: 'user_id,type,title',
        ignoreDuplicates: true,
      });

    if (notifError) {
      console.error('[Madrinha Commission] Error creating notification:', notifError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notification sent',
        push: pushResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[Madrinha Commission] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
