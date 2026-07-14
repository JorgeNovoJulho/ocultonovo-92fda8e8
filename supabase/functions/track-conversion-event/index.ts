// Track Conversion Event Edge Function
// Endpoint público para rastrear eventos de conversão no funil

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversionEventPayload {
  event_type: 'signup_start' | 'plan_view' | 'checkout_start' | 'payment_attempt' | 'payment_success' | 'payment_failed';
  plan_type?: 'free' | 'premium' | 'vip';
  user_id?: string;
  session_id?: string;
  metadata?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: ConversionEventPayload = await req.json();
    
    // Validar tipo de evento
    const validEventTypes = ['signup_start', 'plan_view', 'checkout_start', 'payment_attempt', 'payment_success', 'payment_failed'];
    if (!payload.event_type || !validEventTypes.includes(payload.event_type)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Tipo de evento inválido',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validar tipo de plano se fornecido
    const validPlanTypes = ['free', 'premium', 'vip'];
    if (payload.plan_type && !validPlanTypes.includes(payload.plan_type)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Tipo de plano inválido',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user_id exists in profiles before inserting (avoid FK violation)
    let verifiedUserId = null;
    if (payload.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', payload.user_id)
        .maybeSingle();
      if (profile) {
        verifiedUserId = profile.id;
      } else {
        console.warn(`⚠️ user_id ${payload.user_id} not found in profiles, storing as null`);
      }
    }

    // Inserir evento na tabela
    const { data, error } = await supabase
      .from('conversion_events')
      .insert({
        event_type: payload.event_type,
        plan_type: payload.plan_type || null,
        user_id: verifiedUserId,
        session_id: payload.session_id || null,
        metadata: { ...(payload.metadata || {}), original_user_id: payload.user_id || null },
      })
      .select('id')
      .single();

    if (error) {
      console.error('Erro ao inserir evento de conversão:', error);
      throw error;
    }

    console.log(`📊 Evento rastreado: ${payload.event_type} ${payload.plan_type ? `(${payload.plan_type})` : ''}`);

    return new Response(JSON.stringify({
      success: true,
      event_id: data.id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('❌ Erro no track-conversion-event:', errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
