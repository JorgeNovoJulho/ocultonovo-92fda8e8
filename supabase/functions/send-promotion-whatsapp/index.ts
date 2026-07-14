import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DELAY_MS = 3000; // 3 seconds between messages to avoid WhatsApp blocking

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 🔒 Admin-only OR service_role (cron)
    const serviceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (token !== serviceKey) {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const anonClient = createClient(
        Deno.env.get('EXTERNAL_SUPABASE_URL')!,
        Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!
      );
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', userData.user.id);
      const isAdmin = (roles ?? []).some((r: { role: string }) =>
        ['admin_master', 'admin_regional', 'admin_marketing'].includes(r.role)
      );
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden: admin only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { promotion_id } = await req.json();
    if (!promotion_id) {
      return new Response(JSON.stringify({ error: 'promotion_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get promotion
    const { data: promo, error: promoErr } = await supabase
      .from('promotions')
      .select('*')
      .eq('id', promotion_id)
      .single();

    if (promoErr || !promo) {
      return new Response(JSON.stringify({ error: 'Promotion not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark as sending
    await supabase
      .from('promotions')
      .update({ whatsapp_status: 'sending', whatsapp_sent_count: 0, whatsapp_error_count: 0 })
      .eq('id', promotion_id);

    // Build user query: opted-in + has phone
    let userQuery = supabase
      .from('profiles')
      .select('id, name, phone_number')
      .eq('whatsapp_promotions_opt_in', true)
      .not('phone_number', 'is', null)
      .neq('phone_number', '');

    // Filter audience
    if (promo.whatsapp_audience === 'free_only') {
      userQuery = userQuery.eq('plan_type', 'free');
    }

    const { data: users, error: usersErr } = await userQuery;
    if (usersErr || !users?.length) {
      await supabase
        .from('promotions')
        .update({ whatsapp_status: 'completed', whatsapp_sent_at: new Date().toISOString() })
        .eq('id', promotion_id);

      return new Response(JSON.stringify({ sent: 0, message: 'No eligible users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build message template
    const appLink = Deno.env.get('APP_URL') || 'https://ocultoswing.com.br';
    let sentCount = 0;
    let errorCount = 0;

    for (const user of users) {
      const userName = user.name || 'Usuário';
      const message = `Olá, ${userName}! 🔥 Uma nova oportunidade acaba de surgir no App Oculto: *${promo.title}*.\n\n${promo.banner_text || promo.description || ''}\n\nConfira agora os detalhes no menu Promoções dentro do app e não perca!\n👉 ${appLink}`;

      try {
        // Send via whatsapp-gateway
        const { data: result, error: sendErr } = await supabase.functions.invoke('whatsapp-gateway', {
          body: {
            action: 'send',
            phone: user.phone_number,
            message,
          },
        });

        const success = !sendErr && result?.success;

        // Log the dispatch
        await supabase.from('promotion_whatsapp_logs').insert({
          promotion_id,
          user_id: user.id,
          phone: user.phone_number,
          status: success ? 'sent' : 'failed',
          error_message: sendErr?.message || result?.error || null,
        });

        if (success) {
          sentCount++;
        } else {
          errorCount++;
        }

        // Update progress
        await supabase
          .from('promotions')
          .update({ whatsapp_sent_count: sentCount, whatsapp_error_count: errorCount })
          .eq('id', promotion_id);

        // Delay between messages to avoid blocking
        await sleep(DELAY_MS);
      } catch (err) {
        errorCount++;
        await supabase.from('promotion_whatsapp_logs').insert({
          promotion_id,
          user_id: user.id,
          phone: user.phone_number,
          status: 'failed',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Mark completed
    await supabase
      .from('promotions')
      .update({
        whatsapp_status: errorCount > 0 && sentCount === 0 ? 'error' : 'completed',
        whatsapp_sent_count: sentCount,
        whatsapp_error_count: errorCount,
        whatsapp_sent_at: new Date().toISOString(),
      })
      .eq('id', promotion_id);

    return new Response(
      JSON.stringify({ sent: sentCount, errors: errorCount, total: users.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
