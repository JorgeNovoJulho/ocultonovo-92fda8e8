import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Broadcast {
  id: string;
  creator_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  is_ppv: boolean;
  ppv_price: number;
  audience_type: 'all_followers' | 'active_subscribers' | 'expired_subscribers';
  total_recipients: number;
}

interface Recipient {
  id: string;
  user_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { broadcast_id } = await req.json();

    if (!broadcast_id) {
      return new Response(
        JSON.stringify({ error: 'broadcast_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[process-broadcast] Starting broadcast processing: ${broadcast_id}`);

    // Fetch broadcast details
    const { data: broadcast, error: broadcastError } = await supabase
      .from('broadcasts')
      .select('*')
      .eq('id', broadcast_id)
      .single();

    if (broadcastError || !broadcast) {
      console.error('[process-broadcast] Broadcast not found:', broadcastError);
      return new Response(
        JSON.stringify({ error: 'Broadcast not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get creator's user_id for sending messages
    const { data: creatorProfile, error: creatorError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', broadcast.creator_id)
      .single();

    if (creatorError || !creatorProfile) {
      console.error('[process-broadcast] Creator not found:', creatorError);
      await supabase
        .from('broadcasts')
        .update({ status: 'failed', error_message: 'Creator profile not found' })
        .eq('id', broadcast_id);
      return new Response(
        JSON.stringify({ error: 'Creator not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update broadcast status to processing
    await supabase
      .from('broadcasts')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', broadcast_id);

    // Start background processing using waitUntil if available, otherwise process inline
    const processPromise = processBroadcastDeliveries(supabase, broadcast, creatorProfile.user_id);
    
    // @ts-ignore - EdgeRuntime is available in Deno edge functions
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processPromise);
    } else {
      // Fallback: process in background without waiting
      processPromise.catch(err => console.error('[process-broadcast] Background error:', err));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Broadcast processing started',
        broadcast_id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-broadcast] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processBroadcastDeliveries(
  supabase: any,
  broadcast: Broadcast,
  creatorUserId: string
) {
  const BATCH_SIZE = 100;
  let offset = 0;
  let totalDelivered = 0;
  let hasMoreRecipients = true;

  console.log(`[process-broadcast] Processing broadcast ${broadcast.id} for audience: ${broadcast.audience_type}`);

  try {
    while (hasMoreRecipients) {
      // Fetch recipients based on audience type
      const recipients = await getRecipients(supabase, broadcast, offset, BATCH_SIZE);
      
      if (recipients.length === 0) {
        hasMoreRecipients = false;
        break;
      }

      console.log(`[process-broadcast] Processing batch of ${recipients.length} recipients (offset: ${offset})`);

      // Process each recipient
      for (const recipient of recipients) {
        try {
          await deliverToRecipient(supabase, broadcast, recipient, creatorUserId);
          totalDelivered++;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[process-broadcast] Failed to deliver to ${recipient.id}:`, errMsg);
          
          // Record failed delivery
          await supabase.from('broadcast_deliveries').upsert({
            broadcast_id: broadcast.id,
            recipient_id: recipient.id,
            status: 'failed',
            error_message: errMsg
          }, { onConflict: 'broadcast_id,recipient_id' });
        }
      }

      // Update delivered count in real-time
      await supabase
        .from('broadcasts')
        .update({ delivered_count: totalDelivered })
        .eq('id', broadcast.id);

      offset += BATCH_SIZE;

      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Mark broadcast as completed
    await supabase
      .from('broadcasts')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        delivered_count: totalDelivered
      })
      .eq('id', broadcast.id);

    console.log(`[process-broadcast] Broadcast ${broadcast.id} completed. Delivered: ${totalDelivered}`);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[process-broadcast] Fatal error for broadcast ${broadcast.id}:`, errorMessage);
    
    await supabase
      .from('broadcasts')
      .update({ 
        status: 'failed',
        error_message: errorMessage
      })
      .eq('id', broadcast.id);
  }
}

async function getRecipients(
  supabase: any,
  broadcast: Broadcast,
  offset: number,
  limit: number
): Promise<Recipient[]> {
  let query;

  switch (broadcast.audience_type) {
    case 'all_followers':
      // Get users who follow this creator
      const { data: followers, error: followersError } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', broadcast.creator_id)
        .range(offset, offset + limit - 1);

      if (followersError) throw followersError;
      
      if (!followers || followers.length === 0) return [];

      const followerIds = followers.map((f: any) => f.follower_id);
      const { data: followerProfiles, error: fpError } = await supabase
        .from('profiles')
        .select('id, user_id')
        .in('id', followerIds);

      if (fpError) throw fpError;
      return followerProfiles || [];

    case 'active_subscribers':
      const { data: activeSubs, error: activeError } = await supabase
        .from('subscriptions')
        .select('subscriber_id')
        .eq('creator_id', broadcast.creator_id)
        .eq('status', 'active')
        .range(offset, offset + limit - 1);

      if (activeError) throw activeError;
      
      if (!activeSubs || activeSubs.length === 0) return [];

      const activeSubIds = activeSubs.map((s: any) => s.subscriber_id);
      const { data: activeProfiles, error: apError } = await supabase
        .from('profiles')
        .select('id, user_id')
        .in('id', activeSubIds);

      if (apError) throw apError;
      return activeProfiles || [];

    case 'expired_subscribers':
      const { data: expiredSubs, error: expiredError } = await supabase
        .from('subscriptions')
        .select('subscriber_id')
        .eq('creator_id', broadcast.creator_id)
        .eq('status', 'expired')
        .range(offset, offset + limit - 1);

      if (expiredError) throw expiredError;
      
      if (!expiredSubs || expiredSubs.length === 0) return [];

      const expiredSubIds = expiredSubs.map((s: any) => s.subscriber_id);
      const { data: expiredProfiles, error: epError } = await supabase
        .from('profiles')
        .select('id, user_id')
        .in('id', expiredSubIds);

      if (epError) throw epError;
      return expiredProfiles || [];

    default:
      return [];
  }
}

async function deliverToRecipient(
  supabase: any,
  broadcast: Broadcast,
  recipient: Recipient,
  creatorUserId: string
) {
  // Get or create conversation between creator and recipient
  const { data: existingConvo } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', recipient.user_id)
    .single();

  let conversationId: string;

  if (existingConvo) {
    // Verify this is a conversation with the creator
    const { data: creatorInConvo } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', existingConvo.conversation_id)
      .eq('user_id', creatorUserId)
      .single();

    if (creatorInConvo) {
      conversationId = existingConvo.conversation_id;
    } else {
      // Need to find or create the right conversation
      conversationId = await findOrCreateConversation(supabase, creatorUserId, recipient.user_id);
    }
  } else {
    conversationId = await findOrCreateConversation(supabase, creatorUserId, recipient.user_id);
  }

  // Create the message
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: creatorUserId,
      content: broadcast.content || '📢 Nova mensagem exclusiva!',
      media_url: broadcast.media_url,
      media_type: broadcast.media_type,
      is_locked: broadcast.is_ppv,
      unlock_price: broadcast.is_ppv ? broadcast.ppv_price : null,
      unlocked_by: [],
      broadcast_id: broadcast.id
    })
    .select('id')
    .single();

  if (messageError) throw messageError;

  // Record delivery
  await supabase.from('broadcast_deliveries').insert({
    broadcast_id: broadcast.id,
    recipient_id: recipient.id,
    message_id: message.id,
    status: 'delivered',
    delivered_at: new Date().toISOString()
  });

  console.log(`[process-broadcast] Delivered to recipient ${recipient.id}`);
}

async function findOrCreateConversation(
  supabase: any,
  creatorUserId: string,
  recipientUserId: string
): Promise<string> {
  // Try to find existing conversation between these two users
  const { data: creatorConvos } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', creatorUserId);

  if (creatorConvos && creatorConvos.length > 0) {
    for (const convo of creatorConvos) {
      const { data: recipientInConvo } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('conversation_id', convo.conversation_id)
        .eq('user_id', recipientUserId)
        .single();

      if (recipientInConvo) {
        return convo.conversation_id;
      }
    }
  }

  // Create new conversation
  const { data: newConvo, error: convoError } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single();

  if (convoError) throw convoError;

  // Add participants
  await supabase.from('conversation_participants').insert([
    { conversation_id: newConvo.id, user_id: creatorUserId },
    { conversation_id: newConvo.id, user_id: recipientUserId }
  ]);

  return newConvo.id;
}
