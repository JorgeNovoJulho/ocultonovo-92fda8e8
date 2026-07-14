import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Soft-delete + Cemitério:
// Em vez de destruir o auth.user (irreversível), marcamos o profile como
// is_deleted=true, tornamos invisível e banimos o auth.user (banned_until=∞)
// para impedir novos logins. Dados permanecem intactos para o Cemitério
// administrativo, onde o master admin pode restaurar ou acessar.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey)

    // Soft-delete: marca profile, banque o auth user e revoga sessões.
    const { data: softData, error: softErr } = await admin.rpc('soft_delete_account', {
      p_user_id: user.id,
      p_reason: 'user_requested',
    })

    if (softErr) {
      console.error('[delete-account] soft_delete_account error:', softErr)
      return new Response(
        JSON.stringify({ error: 'Falha ao excluir conta. Tente novamente em instantes.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, soft_deleted: true, result: softData ?? null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[delete-account] unexpected:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
