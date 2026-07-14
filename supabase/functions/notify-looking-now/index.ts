import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RADIUS_KM = 5;
const EARTH_RADIUS_KM = 6371;

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_KM * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
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

    const { profile_id, user_name, lat, lng } = await req.json();

    console.log(`[notify-looking-now] User ${user_name} (${profile_id}) activated at ${lat}, ${lng}`);

    if (!profile_id || !lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: profile_id, lat, lng' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all profiles with location that are NOT the current user
    // Also fetch is_looking_now and plan_type to detect mutual matches and Super Matches
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, user_id, name, location_lat, location_lng, notification_preferences, is_looking_now, plan_type, is_seed')
      .neq('id', profile_id)
      .not('location_lat', 'is', null)
      .not('location_lng', 'is', null)
      .neq('is_seed', true);

    if (profilesError) {
      console.error('[notify-looking-now] Error fetching profiles:', profilesError);
      throw profilesError;
    }

    // Fetch activator's plan_type for Super Match detection
    const { data: activatorProfile } = await supabase
      .from('profiles')
      .select('user_id, plan_type')
      .eq('id', profile_id)
      .single();

    const activatorPlanType = activatorProfile?.plan_type || 'free';

    console.log(`[notify-looking-now] Found ${profiles?.length || 0} profiles with location`);

    // Filter profiles within radius and with notifications enabled
    const nearbyUsers = (profiles || []).filter((profile) => {
      // Check if looking_now notifications are enabled
      const prefs = profile.notification_preferences as Record<string, boolean> | null;
      if (prefs && prefs.looking_now === false) {
        return false;
      }
      if (prefs && prefs.push_enabled === false) {
        return false;
      }

      // Calculate distance
      const distance = calculateDistance(
        lat, 
        lng, 
        profile.location_lat!, 
        profile.location_lng!
      );

      // Add distance to profile for notification message
      (profile as any).distance_km = Math.round(distance * 10) / 10;

      return distance <= RADIUS_KM;
    });

    console.log(`[notify-looking-now] ${nearbyUsers.length} users within ${RADIUS_KM}km radius`);

    if (nearbyUsers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, notifications_sent: 0, mutual_matches: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Separate users into two groups: 
    // 1. Mutual matches - those also "looking now"
    // 2. Regular users - just notify them someone is nearby
    const mutualMatches = nearbyUsers.filter(u => u.is_looking_now === true);
    const regularUsers = nearbyUsers.filter(u => u.is_looking_now !== true);

    console.log(`[notify-looking-now] ${mutualMatches.length} mutual matches, ${regularUsers.length} regular notifications`);

    const notifications: any[] = [];

    // Create notifications for regular users (standard "someone is looking" notification)
    for (const profile of regularUsers) {
      notifications.push({
        user_id: profile.user_id,
        type: 'looking_now_match',
        title: '🔥 Alguém está buscando agora perto de você!',
        body: `${user_name} ativou "Buscando Agora" a ${(profile as any).distance_km}km de você`,
        data: {
          notification_type: 'looking_now_nearby',
          actor_profile_id: profile_id,
          actor_name: user_name,
          distance_km: (profile as any).distance_km,
        },
      });
    }

    // Create MATCH notifications for mutual "looking now" users
    // These get special visual treatment in the UI
    for (const profile of mutualMatches) {
      // Detect Super Match (both users are VIP)
      const isSuperMatch = activatorPlanType === 'vip' && profile.plan_type === 'vip';
      const matchTitle = isSuperMatch 
        ? '✨👑 Super Match VIP! Conexão Exclusiva!'
        : '🔥✨ É um Match! Vocês dois estão buscando!';
      const notificationType = isSuperMatch ? 'super_match' : 'looking_now_match';

      // Notification for the matched user
      notifications.push({
        user_id: profile.user_id,
        type: 'looking_now_match',
        title: matchTitle,
        body: `Você e ${user_name} estão buscando a ${(profile as any).distance_km}km um do outro!`,
        data: {
          notification_type: notificationType,
          match_profile_id: profile_id,
          match_name: user_name,
          distance_km: (profile as any).distance_km,
          is_mutual_match: true,
          is_super_match: isSuperMatch,
        },
      });
    }

    // Also notify the activating user about their matches AND save matches to database
    if (mutualMatches.length > 0) {
      // Get the user_id of the activating user
      const { data: activatorProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', profile_id)
        .single();

      if (activatorProfile) {
        for (const matchedProfile of mutualMatches) {
          // Detect Super Match
          const isSuperMatch = activatorPlanType === 'vip' && matchedProfile.plan_type === 'vip';
          const matchTitle = isSuperMatch 
            ? '✨👑 Super Match VIP! Conexão Exclusiva!'
            : '🔥✨ É um Match! Vocês dois estão buscando!';
          const notificationType = isSuperMatch ? 'super_match' : 'looking_now_match';

          // Create notification for activator
          notifications.push({
            user_id: activatorProfile.user_id,
            type: 'looking_now_match',
            title: matchTitle,
            body: `Você e ${matchedProfile.name} estão buscando a ${(matchedProfile as any).distance_km}km um do outro!`,
            data: {
              notification_type: notificationType,
              match_profile_id: matchedProfile.id,
              match_name: matchedProfile.name,
              distance_km: (matchedProfile as any).distance_km,
              is_mutual_match: true,
              is_super_match: isSuperMatch,
            },
          });

          // Save match to database (ensure consistent ordering)
          const [id1, id2] = [profile_id, matchedProfile.id].sort();
          
          const { error: matchError } = await supabase
            .from('looking_now_matches')
            .upsert({
              user1_id: id1,
              user2_id: id2,
              distance_km: (matchedProfile as any).distance_km,
              matched_at: new Date().toISOString(),
              is_expired: false,
              is_super_match: isSuperMatch,
            }, {
              onConflict: 'user1_id,user2_id',
              ignoreDuplicates: false,
            });

          if (matchError) {
            console.warn('[notify-looking-now] Error saving match:', matchError);
          } else {
            console.log(`[notify-looking-now] Match saved: ${id1} <-> ${id2} (Super: ${isSuperMatch})`);
          }
        }
      }
    }

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notifications);

    if (insertError) {
      console.error('[notify-looking-now] Error inserting notifications:', insertError);
      throw insertError;
    }

    console.log(`[notify-looking-now] Successfully sent ${notifications.length} notifications (${mutualMatches.length} mutual matches)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        notifications_sent: notifications.length,
        mutual_matches: mutualMatches.length,
        regular_notifications: regularUsers.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[notify-looking-now] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
