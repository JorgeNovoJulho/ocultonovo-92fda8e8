import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Checking for expired freeze periods...');

    // Buscar usuários com freeze expirado
    const now = new Date().toISOString();
    const { data: expiredUsers, error } = await supabase
      .from('profiles')
      .select('id, user_id, name, frozen_until, warning_count')
      .eq('account_status', 'frozen')
      .lt('frozen_until', now);

    if (error) {
      console.error('Error fetching expired users:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log('No expired freeze periods found');
      return new Response(
        JSON.stringify({ success: true, unfrozen: 0, message: 'No expired users found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${expiredUsers.length} users with expired freeze`);
    let unfrozenCount = 0;
    const errors: string[] = [];

    for (const user of expiredUsers) {
      try {
        // Descongelar usuário
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            account_status: 'active', 
            frozen_until: null 
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(`Error unfreezing user ${user.id}:`, updateError);
          errors.push(`User ${user.id}: ${updateError.message}`);
          continue;
        }

        // Registrar no histórico disciplinar
        const { error: historyError } = await supabase
          .from('discipline_history')
          .insert({
            profile_id: user.id,
            action_type: 'unfreeze',
            admin_id: user.user_id, // Auto-unfreeze uses user's own ID
            reason: 'Descongelamento automático por expiração do período',
            details: { 
              automatic: true, 
              frozen_until: user.frozen_until,
              warning_count: user.warning_count
            },
          });

        if (historyError) {
          console.error(`Error recording history for user ${user.id}:`, historyError);
        }

        // Notificar usuário
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: user.user_id,
            type: 'account',
            title: '🎉 Conta Restaurada!',
            body: 'Seu período de congelamento terminou. Você pode usar a plataforma normalmente.',
            data: { 
              action: 'freeze_expired',
              warning_count: user.warning_count
            },
          });

        if (notificationError) {
          console.error(`Error sending notification to user ${user.id}:`, notificationError);
        }

        // Enviar push notification
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              userId: user.user_id,
              title: '🎉 Conta Restaurada!',
              body: 'Seu período de congelamento terminou. Você pode usar a plataforma normalmente.',
              options: {
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'account-restored',
              }
            }),
          });
        } catch (pushError) {
          console.log('Push notification failed (non-critical):', pushError);
        }

        unfrozenCount++;
        console.log(`Successfully unfroze user ${user.name} (${user.id})`);

      } catch (userError) {
        console.error(`Unexpected error processing user ${user.id}:`, userError);
        errors.push(`User ${user.id}: Unexpected error`);
      }
    }

    console.log(`Unfroze ${unfrozenCount} users. Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        unfrozen: unfrozenCount,
        total_expired: expiredUsers.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Check freeze expiration error:', err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
