// Edge Function: Gerar Perfis de Teste "Stealth"
// Cria 3 contas de teste invisíveis para o administrador testar funcionalidades

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically secure random password
function generateSecurePassword(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

// Configurações dos perfis de teste (passwords generated at runtime)
function getTestProfiles() {
  return [
    {
      email: 'free.test@oculto.com',
      password: generateSecurePassword(),
      name: 'Tester Free',
      username: 'tester_free',
      plan_type: 'free',
      is_verified: false,
      is_creator: false,
      has_ghost_mode: false,
      bio: '🧪 Conta de teste - Plano Gratuito',
    },
    {
      email: 'premium.test@oculto.com',
      password: generateSecurePassword(),
      name: 'Tester Premium',
      username: 'tester_premium',
      plan_type: 'monthly',
      is_verified: true,
      is_creator: true,
      has_ghost_mode: false,
      bio: '🧪 Conta de teste - Plano Premium',
    },
    {
      email: 'vip.test@oculto.com',
      password: generateSecurePassword(),
      name: 'Tester VIP',
      username: 'tester_vip',
      plan_type: 'vip',
      is_verified: true,
      is_creator: true,
      has_ghost_mode: true,
      bio: '🧪 Conta de teste - Plano VIP (God Mode)',
    },
  ]
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Obter token de autorização
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar cliente Supabase com service role para criar usuários
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!

    // Verificar se o usuário é admin
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se é admin_master only (stricter check)
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin_master')

    if (!userRoles || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Acesso negado - Apenas administradores master' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Usar service role para operações administrativas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const TEST_PROFILES = getTestProfiles()

    // Verificar se os perfis já existem
    const existingEmails: string[] = []
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    
    for (const profile of TEST_PROFILES) {
      const exists = authUsers?.users?.some(u => u.email === profile.email)
      if (exists) {
        existingEmails.push(profile.email)
      }
    }

    if (existingEmails.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Alguns perfis de teste já existem',
          existing: existingEmails,
          message: `Os seguintes emails já estão cadastrados: ${existingEmails.join(', ')}`
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Criar os perfis
    const createdProfiles: any[] = []
    const errors: any[] = []

    for (const testProfile of TEST_PROFILES) {
      try {
        // 1. Criar usuário no auth.users
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: testProfile.email,
          password: testProfile.password,
          email_confirm: true,
          user_metadata: {
            name: testProfile.name,
          },
        })

        if (authError) {
          errors.push({ email: testProfile.email, error: authError.message })
          continue
        }

        const authUserId = authData.user.id

        // 2. Atualizar o perfil criado automaticamente pelo trigger
        await new Promise(resolve => setTimeout(resolve, 500))

        const { data: profileData, error: profileError } = await supabaseAdmin
          .from('profiles')
          .update({
            name: testProfile.name,
            username: testProfile.username,
            bio: testProfile.bio,
            plan_type: testProfile.plan_type,
            is_verified: testProfile.is_verified,
            is_creator: testProfile.is_creator,
            is_test_account: true,
            has_ghost_mode: testProfile.has_ghost_mode,
            account_status: 'active',
            avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(testProfile.name)}&background=random&color=fff&size=256`,
          })
          .eq('user_id', authUserId)
          .select()
          .single()

        if (profileError) {
          errors.push({ email: testProfile.email, error: profileError.message })
          continue
        }

        // 3. Se for premium ou vip, criar assinatura ativa
        if (testProfile.plan_type !== 'free' && profileData) {
          const expiresAt = new Date()
          expiresAt.setFullYear(expiresAt.getFullYear() + 1)

          await supabaseAdmin
            .from('subscriptions')
            .insert({
              subscriber_id: profileData.id,
              creator_id: profileData.id,
              status: 'active',
              price: testProfile.plan_type === 'vip' ? 99.90 : 29.90,
              expires_at: expiresAt.toISOString(),
            })
        }

        // DO NOT return passwords in response
        createdProfiles.push({
          email: testProfile.email,
          name: testProfile.name,
          plan_type: testProfile.plan_type,
          profile_id: profileData?.id,
        })

      } catch (err) {
        errors.push({ email: testProfile.email, error: 'Erro interno' })
      }
    }

    // Registrar no audit log
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        admin_id: user.id,
        action_type: 'create_test_profiles',
        target_resource: 'profiles',
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        details: {
          created_count: createdProfiles.length,
          errors_count: errors.length,
          profiles: createdProfiles.map(p => ({ email: p.email, plan: p.plan_type })),
        },
      })

    return new Response(
      JSON.stringify({
        success: true,
        message: `${createdProfiles.length} perfis de teste criados com sucesso! As senhas foram geradas aleatoriamente - use o reset de senha para acessar.`,
        profiles: createdProfiles,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('[generate-test-profiles] Erro geral:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
