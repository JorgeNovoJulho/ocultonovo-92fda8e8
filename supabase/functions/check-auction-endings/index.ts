import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Check Auction Endings] Starting check...');

    // Find auctions that have ended but are still active
    const { data: endedAuctions, error } = await supabase
      .from('auctions')
      .select('id, title, current_bid, current_bidder_id, creator_id')
      .eq('status', 'active')
      .lt('ends_at', new Date().toISOString());

    if (error) {
      console.error('[Check Auction Endings] Query error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`[Check Auction Endings] Found ${endedAuctions?.length || 0} auctions to process`);

    const results = [];

    for (const auction of endedAuctions || []) {
      try {
        // Call auction-gateway to process the ending
        const response = await supabase.functions.invoke('auction-gateway', {
          body: {
            action: 'end-auction',
            auction_id: auction.id
          }
        });

        results.push({
          auction_id: auction.id,
          title: auction.title,
          result: response.data
        });

        console.log(`[Check Auction Endings] Processed auction ${auction.id}: ${auction.title}`);

        // Notify all losing bidders
        const { data: losingBids } = await supabase
          .from('auction_bids')
          .select('bidder_id')
          .eq('auction_id', auction.id)
          .eq('is_winning', false)
          .is('notified', false);

        for (const bid of losingBids || []) {
          if (bid.bidder_id !== auction.current_bidder_id) {
            // Get user_id from profile
            const { data: bidderProfile } = await supabase
              .from('profiles')
              .select('user_id')
              .eq('id', bid.bidder_id)
              .single();

            if (bidderProfile?.user_id) {
              await supabase.from('notifications').insert({
                user_id: bidderProfile.user_id,
                type: 'auction',
                title: '⏰ Leilão encerrado',
                body: `O leilão "${auction.title}" terminou. Melhor sorte na próxima!`,
                data: { auction_id: auction.id }
              });
            }

            // Mark as notified
            await supabase
              .from('auction_bids')
              .update({ notified: true })
              .eq('auction_id', auction.id)
              .eq('bidder_id', bid.bidder_id);
          }
        }

      } catch (auctionError: any) {
        console.error(`[Check Auction Endings] Error processing auction ${auction.id}:`, auctionError);
        results.push({
          auction_id: auction.id,
          error: auctionError?.message || 'Unknown error'
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Check Auction Endings] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});