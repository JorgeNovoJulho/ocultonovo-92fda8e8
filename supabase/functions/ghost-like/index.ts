// Edge Function: Ghost Like System
// Sends strategic profile likes from high-affinity bots to new/returning users
// Triggers: user login, signup, or returning after inactivity

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 🔒 Auth: aceita service_role (cron/triggers) OU JWT autenticado.
    // Se vier do cliente, força user_id = sub do token (ignora valor enviado).
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('Bearer ', '')
    const isServiceCall = token === supabaseServiceKey

    let authedUserId: string | null = null
    if (!isServiceCall) {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const anonClient = createClient(supabaseUrl, Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!)
      const { data: u, error: uErr } = await anonClient.auth.getUser(token)
      if (uErr || !u?.user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      authedUserId = u.user.id
    }

    const body = await req.json().catch(() => ({}))
    const { user_id: rawUserId, trigger } = body
    // 🔒 Se chamado por usuário, força o próprio user_id (impede ghost-like em terceiros)
    const user_id = isServiceCall ? rawUserId : authedUserId

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Get the user's profile
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, plan_type, is_seed, tags_social, tags_adult, gender')
      .eq('user_id', user_id)
      .single()

    if (profileError || !userProfile) {
      console.error('[ghost-like] Profile not found:', profileError)
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Don't ghost-like bot profiles
    if (userProfile.is_seed) {
      return new Response(
        JSON.stringify({ action: 'skipped', reason: 'user_is_seed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Determine how many ghost likes based on plan
    const isPremium = userProfile.plan_type === 'premium' || userProfile.plan_type === 'vip'
    const maxGhostLikes = isPremium ? 1 : 3 // Free users get more ghost likes (conversion driver)
    
    // Check how many ghost likes this user already received today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    
    const { count: todayGhostLikes } = await supabase
      .from('profile_likes')
      .select('id', { count: 'exact', head: true })
      .eq('liked_id', userProfile.id)
      .eq('is_ghost', true)
      .gte('created_at', todayStart.toISOString())

    if ((todayGhostLikes || 0) >= maxGhostLikes) {
      return new Response(
        JSON.stringify({ action: 'skipped', reason: 'daily_limit_reached', count: todayGhostLikes }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const likesToSend = maxGhostLikes - (todayGhostLikes || 0)

    // 3. Find high-affinity seed profiles
    const { data: seedProfiles } = await supabase
      .from('profiles')
      .select('id, tags_social, tags_adult, avatar_url, name')
      .eq('is_seed', true)
      .eq('account_status', 'active')
      .not('avatar_url', 'is', null)
      .limit(50)

    if (!seedProfiles || seedProfiles.length === 0) {
      return new Response(
        JSON.stringify({ action: 'skipped', reason: 'no_seed_profiles' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Score seed profiles by tag affinity
    const userTags = [
      ...(userProfile.tags_social || []),
      ...(userProfile.tags_adult || []),
    ]

    const scoredProfiles = seedProfiles.map(seed => {
      const seedTags = [
        ...(seed.tags_social || []),
        ...(seed.tags_adult || []),
      ]
      const commonTags = userTags.filter(t => seedTags.includes(t))
      return { ...seed, affinityScore: commonTags.length }
    })

    // Sort by affinity (highest first), then shuffle top ones for variety
    scoredProfiles.sort((a, b) => b.affinityScore - a.affinityScore)
    const topProfiles = scoredProfiles.slice(0, Math.min(10, scoredProfiles.length))
    
    // Shuffle top profiles
    for (let i = topProfiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [topProfiles[i], topProfiles[j]] = [topProfiles[j], topProfiles[i]]
    }

    // 5. Check which ones haven't already liked this user
    const selectedProfiles = topProfiles.slice(0, likesToSend)
    const ghostLikesSent: string[] = []

    for (const seed of selectedProfiles) {
      // Check if already liked
      const { data: existing } = await supabase
        .from('profile_likes')
        .select('id')
        .eq('liker_id', seed.id)
        .eq('liked_id', userProfile.id)
        .maybeSingle()

      if (existing) continue

      // Random delay offset (5-15 minutes in the past to look organic)
      const delayMs = Math.floor(Math.random() * 10 * 60 * 1000) + 5 * 60 * 1000
      const likeTime = new Date(Date.now() - delayMs)

      const { error: insertError } = await supabase
        .from('profile_likes')
        .insert({
          liker_id: seed.id,
          liked_id: userProfile.id,
          is_ghost: true,
          created_at: likeTime.toISOString(),
        })

      if (!insertError) {
        ghostLikesSent.push(seed.id)

        // 6. Send notification (mystery style for free users)
        if (!isPremium) {
          await supabase.from('notifications').insert({
            user_id: user_id,
            actor_id: seed.id,
            type: 'profile_like',
            title: '💖 Alguém especial curtiu seu perfil!',
            body: 'Descubra quem é — seja Premium para ver!',
            data: { ghost: true, liker_id: seed.id },
          })
        } else {
          // Premium users get a normal notification
          await supabase.from('notifications').insert({
            user_id: user_id,
            actor_id: seed.id,
            type: 'profile_like',
            title: `${seed.name || 'Alguém'} curtiu seu perfil`,
            body: null,
            data: { ghost: true, liker_id: seed.id },
          })
        }
      }
    }

    console.log(`[ghost-like] Sent ${ghostLikesSent.length} ghost likes to user ${userProfile.id} (${trigger})`)

    return new Response(
      JSON.stringify({
        action: 'ghost_likes_sent',
        count: ghostLikesSent.length,
        trigger,
        is_premium: isPremium,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[ghost-like] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
