import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const notificationsToCreate: Array<{
      user_id: string;
      type: string;
      title: string;
      body: string;
      data: Record<string, unknown>;
    }> = [];

    // ========================================
    // 1. Check for coupons expiring in 3 days
    // ========================================
    console.log('Checking for expiring coupons...');
    
    const { data: expiringCoupons, error: couponError } = await supabase
      .from('coupons')
      .select('id, code, campaign_name, end_date, creator_id')
      .eq('is_active', true)
      .gte('end_date', now.toISOString())
      .lte('end_date', threeDaysFromNow.toISOString());

    if (couponError) {
      console.error('Error fetching expiring coupons:', couponError);
    } else if (expiringCoupons && expiringCoupons.length > 0) {
      console.log(`Found ${expiringCoupons.length} expiring coupons`);

      // Get creator profiles to find user_ids
      const creatorIds = [...new Set(expiringCoupons.map((c: any) => c.creator_id))];
      const { data: creatorProfiles } = await supabase
        .from('profiles')
        .select('id, user_id, name')
        .in('id', creatorIds);

      const profileMap = new Map((creatorProfiles || []).map((p: any) => [p.id, p]));

      for (const coupon of expiringCoupons as any[]) {
        const profile = profileMap.get(coupon.creator_id) as any;
        if (!profile) continue;

        const endDate = new Date(coupon.end_date);
        const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        notificationsToCreate.push({
          user_id: profile.user_id,
          type: 'subscription', // Reusing existing type for compatibility
          title: `Cupom "${coupon.code}" expira em ${daysRemaining} dias!`,
          body: `Sua campanha "${coupon.campaign_name}" termina em breve. Considere criar uma nova promoção para manter seus fãs engajados.`,
          data: { 
            coupon_id: coupon.id, 
            notification_type: 'coupon_expiring',
            days_remaining: daysRemaining 
          },
        });
      }
    }

    // ========================================
    // 2. Referral "Indique e Ganhe" — commission is one-time (paid on first subscription)
    // No time-based expiration needed. commission_ended_at is set immediately after payment.
    // ========================================

    // ========================================
    // 3. Create all notifications
    // ========================================
    if (notificationsToCreate.length > 0) {
      console.log(`Creating ${notificationsToCreate.length} notifications...`);

      const { error: insertError } = await supabase
        .from('notifications')
        .insert(notificationsToCreate);

      if (insertError) {
        console.error('Error creating notifications:', insertError);
      } else {
        console.log('Notifications created successfully');
      }
    } else {
      console.log('No notifications to create');
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: {
          expiringCoupons: expiringCoupons?.length || 0,
          expiringReferrals: expiringReferrals?.length || 0,
          notificationsCreated: notificationsToCreate.length,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    console.error('Error in check-expirations function:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
