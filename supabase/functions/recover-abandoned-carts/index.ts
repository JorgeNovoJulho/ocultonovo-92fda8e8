import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CartAbandonment {
  id: string;
  user_id: string | null;
  plan_type: string;
  amount: number;
  coupon_code: string | null;
  ghost_mode: boolean;
  creator_id: string | null;
  phone_number: string;
  user_name: string | null;
  user_email: string | null;
  status: string;
  scheduled_send_at: string;
  magic_link_token: string;
  attempts_count: number;
}

interface WhatsAppConfig {
  cart_recovery_template: string;
  is_active: boolean;
  sandbox_mode: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const startTime = Date.now();
  console.log('🔄 Starting cart recovery job at:', new Date().toISOString());
  
  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get base URL for magic links
    const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://ocultoswing.com.br';
    
    // 1. Fetch WhatsApp config
    const { data: whatsappConfig, error: configError } = await supabase
      .from('whatsapp_config')
      .select('cart_recovery_template, is_active, sandbox_mode')
      .limit(1)
      .single();
    
    if (configError || !whatsappConfig) {
      console.log('⚠️ WhatsApp not configured, skipping recovery job');
      return new Response(
        JSON.stringify({ success: true, message: 'WhatsApp not configured', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 2. Fetch pending abandoned carts ready to send
    const now = new Date().toISOString();
    const { data: abandonedCarts, error: cartsError } = await supabase
      .from('cart_abandonment')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_send_at', now)
      .order('scheduled_send_at', { ascending: true })
      .limit(50); // Process max 50 per run
    
    if (cartsError) {
      console.error('Error fetching abandoned carts:', cartsError);
      throw cartsError;
    }
    
    if (!abandonedCarts || abandonedCarts.length === 0) {
      console.log('✅ No pending carts to process');
      return new Response(
        JSON.stringify({ success: true, message: 'No carts to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`📦 Found ${abandonedCarts.length} abandoned carts to process`);
    
    const results = {
      processed: 0,
      sent: 0,
      recovered: 0,
      failed: 0,
      errors: [] as string[],
    };
    
    // 3. Process each abandoned cart
    for (const cart of abandonedCarts as CartAbandonment[]) {
      results.processed++;
      console.log(`\n🛒 Processing cart ${cart.id} for phone ${cart.phone_number}`);
      
      try {
        // 3a. CRITICAL: Check if user already completed purchase
        // This prevents false positives (sending recovery to paying customers)
        let alreadyPurchased = false;
        
        if (cart.user_id) {
          // Check subscriptions created after cart was created
          const { data: recentSubscription } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('subscriber_id', cart.user_id)
            .gte('created_at', cart.scheduled_send_at.replace('+10 minutes', '')) // Cart creation time
            .limit(1);
          
          if (recentSubscription && recentSubscription.length > 0) {
            alreadyPurchased = true;
          }
          
          // Also check completed transactions
          if (!alreadyPurchased) {
            const { data: recentTransaction } = await supabase
              .from('transactions')
              .select('id')
              .eq('user_id', cart.user_id)
              .eq('status', 'completed')
              .eq('type', 'subscription')
              .gte('created_at', new Date(new Date(cart.scheduled_send_at).getTime() - 10 * 60 * 1000).toISOString())
              .limit(1);
            
            if (recentTransaction && recentTransaction.length > 0) {
              alreadyPurchased = true;
            }
          }
        }
        
        if (alreadyPurchased) {
          console.log(`✅ Cart ${cart.id}: User already purchased! Marking as recovered.`);
          
          await supabase
            .from('cart_abandonment')
            .update({ 
              status: 'recovered', 
              recovered_at: new Date().toISOString() 
            })
            .eq('id', cart.id);
          
          results.recovered++;
          continue;
        }
        
        // 3b. Build magic link
        const magicLink = `${baseUrl}/checkout/resume?token=${cart.magic_link_token}`;
        
        // 3c. Build personalized message
        const template = whatsappConfig.cart_recovery_template || 
          'Oi {name}! 👋\n\nVi que você quase entrou para o meu VIP. Aconteceu algo?\n\nAqui está um link direto para finalizar:\n{link}\n\n💎 Acesso exclusivo te esperando!';
        
        const templateVars = {
          name: cart.user_name || 'você',
          link: magicLink,
          plan: cart.plan_type === 'annual' ? 'Anual' : 'Mensal',
          amount: `R$ ${cart.amount.toFixed(2).replace('.', ',')}`,
        };
        
        // 3d. Send WhatsApp message via gateway
        const { data: sendResult, error: sendError } = await supabase.functions.invoke('whatsapp-gateway', {
          body: {
            action: 'send',
            phone: cart.phone_number,
            template: template,
            template_vars: templateVars,
          },
        });
        
        if (sendError || !sendResult?.success) {
          console.error(`❌ Cart ${cart.id}: Failed to send WhatsApp:`, sendError || sendResult?.error);
          
          await supabase
            .from('cart_abandonment')
            .update({ 
              status: 'failed',
              last_error: sendError?.message || sendResult?.error || 'Unknown error',
              attempts_count: cart.attempts_count + 1,
            })
            .eq('id', cart.id);
          
          results.failed++;
          results.errors.push(`Cart ${cart.id}: ${sendError?.message || sendResult?.error}`);
          continue;
        }
        
        // 3e. Success! Update cart status
        console.log(`✅ Cart ${cart.id}: WhatsApp sent successfully (${sendResult.sandbox ? 'SANDBOX' : 'PRODUCTION'})`);
        
        await supabase
          .from('cart_abandonment')
          .update({ 
            status: 'sent',
            sent_at: new Date().toISOString(),
            whatsapp_message_id: sendResult.messageId,
            attempts_count: cart.attempts_count + 1,
          })
          .eq('id', cart.id);
        
        results.sent++;
        
        // Rate limiting - wait between messages
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (cartError: unknown) {
        const errorMessage = cartError instanceof Error ? cartError.message : 'Unknown error';
        console.error(`❌ Error processing cart ${cart.id}:`, cartError);
        results.failed++;
        results.errors.push(`Cart ${cart.id}: ${errorMessage}`);
      }
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`\n📊 Recovery job completed in ${duration}ms`);
    console.log(`   Processed: ${results.processed}`);
    console.log(`   Sent: ${results.sent}`);
    console.log(`   Recovered (already paid): ${results.recovered}`);
    console.log(`   Failed: ${results.failed}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        ...results,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Cart recovery job error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
