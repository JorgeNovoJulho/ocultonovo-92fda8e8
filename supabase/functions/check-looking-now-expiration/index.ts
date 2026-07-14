import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPIRATION_HOURS = 2;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const expirationThreshold = new Date(now.getTime() - EXPIRATION_HOURS * 60 * 60 * 1000);

    console.log(`[check-looking-now-expiration] Running at ${now.toISOString()}`);
    console.log(`[check-looking-now-expiration] Expiring users with looking_now_since before ${expirationThreshold.toISOString()}`);

    // Find expired users
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('profiles')
      .select('id, user_id, name, looking_now_since')
      .eq('is_looking_now', true)
      .lt('looking_now_since', expirationThreshold.toISOString());

    if (fetchError) {
      console.error('[check-looking-now-expiration] Error fetching expired users:', fetchError);
      throw fetchError;
    }

    console.log(`[check-looking-now-expiration] Found ${expiredUsers?.length || 0} expired users`);

    if (!expiredUsers || expiredUsers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, expired_count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reset their status
    const expiredIds = expiredUsers.map((u) => u.id);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ 
        is_looking_now: false,
        looking_now_since: null 
      })
      .in('id', expiredIds);

    if (updateError) {
      console.error('[check-looking-now-expiration] Error updating profiles:', updateError);
      throw updateError;
    }

    console.log(`[check-looking-now-expiration] Reset ${expiredIds.length} users`);

    // Create notifications for expired users
    const notifications = expiredUsers.map((user) => ({
      user_id: user.user_id,
      type: 'looking_now',
      title: '⏰ Seu status "Buscando Agora" expirou',
      body: 'Após 2 horas, seu status foi desativado automaticamente. Reative quando quiser!',
      data: {
        notification_type: 'looking_now_expired',
        expired_at: now.toISOString(),
      },
    }));

    const { error: notifError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (notifError) {
      console.error('[check-looking-now-expiration] Error creating notifications:', notifError);
      // Don't throw - notifications are secondary
    }

    console.log(`[check-looking-now-expiration] Successfully expired ${expiredUsers.length} users`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        expired_count: expiredUsers.length,
        notifications_sent: notifications.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[check-looking-now-expiration] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
