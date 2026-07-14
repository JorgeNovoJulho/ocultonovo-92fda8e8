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

  console.log('[process-scheduled-broadcasts] Starting scheduled broadcast check...');

  try {
    const supabase = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL') ?? '',
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date().toISOString();
    console.log(`[process-scheduled-broadcasts] Current time: ${now}`);

    // Find broadcasts that are scheduled and due
    const { data: scheduledBroadcasts, error: fetchError } = await supabase
      .from('broadcasts')
      .select('id, creator_id, content, scheduled_for')
      .eq('is_scheduled', true)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(10); // Process up to 10 at a time

    if (fetchError) {
      console.error('[process-scheduled-broadcasts] Error fetching broadcasts:', fetchError);
      throw fetchError;
    }

    if (!scheduledBroadcasts || scheduledBroadcasts.length === 0) {
      console.log('[process-scheduled-broadcasts] No scheduled broadcasts to process');
      return new Response(
        JSON.stringify({ 
          success: true, 
          processed: 0,
          message: 'No broadcasts to process' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[process-scheduled-broadcasts] Found ${scheduledBroadcasts.length} broadcasts to process`);

    let processedCount = 0;
    const errors: string[] = [];

    // Process each broadcast
    for (const broadcast of scheduledBroadcasts) {
      try {
        console.log(`[process-scheduled-broadcasts] Processing broadcast ${broadcast.id}...`);

        // Update the broadcast to mark it as no longer scheduled (now processing)
        await supabase
          .from('broadcasts')
          .update({ 
            is_scheduled: false,
            status: 'processing' 
          })
          .eq('id', broadcast.id);

        // Invoke the process-broadcast function
        const { error: invokeError } = await supabase.functions.invoke('process-broadcast', {
          body: { broadcast_id: broadcast.id }
        });

        if (invokeError) {
          console.error(`[process-scheduled-broadcasts] Error invoking process-broadcast for ${broadcast.id}:`, invokeError);
          errors.push(`Broadcast ${broadcast.id}: ${invokeError.message}`);
          
          // Mark as failed
          await supabase
            .from('broadcasts')
            .update({ status: 'failed' })
            .eq('id', broadcast.id);
        } else {
          processedCount++;
          console.log(`[process-scheduled-broadcasts] Successfully triggered processing for broadcast ${broadcast.id}`);
        }

      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[process-scheduled-broadcasts] Error processing broadcast ${broadcast.id}:`, err);
        errors.push(`Broadcast ${broadcast.id}: ${errMessage}`);
      }
    }

    console.log(`[process-scheduled-broadcasts] Completed. Processed: ${processedCount}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        total: scheduledBroadcasts.length,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-scheduled-broadcasts] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
