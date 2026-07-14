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

    console.log('Checking for unverified profiles past deadline...');

    const now = new Date().toISOString();
    
    // Find users who haven't verified documents within 15 business days (21 calendar days)
    const { data: expiredUsers, error } = await supabase
      .from('profiles')
      .select('id, user_id, name, verification_deadline, warning_count')
      .eq('account_status', 'active')
      .eq('is_verified', false)
      .eq('is_seed', false)
      .lt('verification_deadline', now)
      .not('verification_deadline', 'is', null);

    if (error) {
      console.error('Error fetching expired users:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log('No users past verification deadline');
      return new Response(
        JSON.stringify({ success: true, frozen: 0, message: 'No expired users found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${expiredUsers.length} users past verification deadline`);
    let frozenCount = 0;
    const errors: string[] = [];

    for (const user of expiredUsers) {
      try {
        const newWarningCount = (user.warning_count || 0) + 1;
        const isBanned = newWarningCount >= 3;
        
        // Freeze or ban the account
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            account_status: isBanned ? 'banned' : 'frozen',
            frozen_until: isBanned ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            warning_count: newWarningCount,
            banned_at: isBanned ? new Date().toISOString() : null,
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(`Error freezing user ${user.id}:`, updateError);
          errors.push(`User ${user.id}: ${updateError.message}`);
          continue;
        }

        // Record in discipline history
        const { error: historyError } = await supabase
          .from('discipline_history')
          .insert({
            profile_id: user.id,
            action_type: isBanned ? 'ban' : 'freeze',
            admin_id: user.user_id, // Auto-action uses user's own ID
            reason: 'Documentos não verificados no prazo de 15 dias úteis',
            details: { 
              automatic: true, 
              reason: 'verification_deadline_expired',
              warning_count: newWarningCount,
              is_banned: isBanned
            },
          });

        if (historyError) {
          console.error(`Error recording history for user ${user.id}:`, historyError);
        }

        // Create notification
        const notificationTitle = isBanned 
          ? '🚫 Conta Banida'
          : '⚠️ Conta Congelada';
        const notificationBody = isBanned
          ? 'Sua conta foi banida permanentemente por não verificar documentos após 3 advertências.'
          : `Sua conta foi congelada por não verificar seus documentos no prazo de 15 dias úteis. Esta é sua advertência ${newWarningCount}/3.`;

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            user_id: user.user_id,
            type: 'account',
            title: notificationTitle,
            body: notificationBody,
            data: { 
              action: isBanned ? 'account_banned' : 'verification_required',
              warning_count: newWarningCount
            },
          });

        if (notificationError) {
          console.error(`Error sending notification to user ${user.id}:`, notificationError);
        }

        // Send push notification
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              userId: user.user_id,
              title: notificationTitle,
              body: notificationBody,
              options: {
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: isBanned ? 'account-banned' : 'account-frozen',
              }
            }),
          });
        } catch (pushError) {
          console.log('Push notification failed (non-critical):', pushError);
        }

        frozenCount++;
        console.log(`${isBanned ? 'Banned' : 'Froze'} user ${user.name} (${user.id}) - Warning ${newWarningCount}/3`);

      } catch (userError) {
        console.error(`Unexpected error processing user ${user.id}:`, userError);
        errors.push(`User ${user.id}: Unexpected error`);
      }
    }

    console.log(`Processed ${frozenCount} users. Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        frozen: frozenCount,
        total_expired: expiredUsers.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Check verification deadline error:', err);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
