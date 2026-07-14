// Edge Function: Smart Feed Filler
// Monitors activity gaps and triggers bot posts + engagement simulation
// Designed to run on a cron schedule (every 30 minutes)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Content templates for bot posts (varied and realistic)
const CONTENT_TEMPLATES = [
  "Noite perfeita pra encontros… quem topa? 🔥",
  "Alguém por perto agora? 👀",
  "Procurando algo diferente hoje… 💫",
  "Sexta à noite e o app tá on 🌙",
  "Curtindo a vibe noturna… quem mais? 🍷",
  "Bora trocar uma ideia? Tô online agora 😏",
  "Madrugada é o melhor horário pra encontrar gente interessante ✨",
  "Quem mais tá acordado a essa hora? 🌃",
  "Looking for fun vibes tonight 🎶",
  "Fim de semana chegou, bora aproveitar! 🎉",
  "Algum casal por perto? 💑",
  "Noite especial merece companhia especial 🥂",
  "Tô no clima hoje… quem vem? 🔥",
  "Primeira vez aqui, alguém me apresenta o app? 😊",
  "Adorei essa comunidade! Quem quer conversar? 💬",
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    // 1. Check if there are recent real user posts (last 2 hours)
    const { data: recentRealPosts, error: realPostsError } = await supabase
      .from('posts')
      .select('id, created_at')
      .eq('is_seed', false)
      .gte('created_at', twoHoursAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(5)

    if (realPostsError) {
      console.error('[smart-feed-filler] Error checking recent posts:', realPostsError)
      throw realPostsError
    }

    const hasRecentRealActivity = (recentRealPosts?.length || 0) > 0

    // 2. Check last bot post to avoid flooding
    const { data: lastBotPost } = await supabase
      .from('posts')
      .select('created_at')
      .eq('is_seed', true)
      .order('created_at', { ascending: false })
      .limit(1)

    const lastBotPostTime = lastBotPost?.[0]?.created_at 
      ? new Date(lastBotPost[0].created_at).getTime() 
      : 0
    const minIntervalMs = 15 * 60 * 1000 // 15 minutes minimum between bot posts
    const timeSinceLastBot = now.getTime() - lastBotPostTime

    if (timeSinceLastBot < minIntervalMs) {
      console.log('[smart-feed-filler] Too soon since last bot post, skipping')
      return new Response(
        JSON.stringify({ action: 'skipped', reason: 'cooldown_active', next_eligible_in_minutes: Math.ceil((minIntervalMs - timeSinceLastBot) / 60000) }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Determine how many bot posts to create based on activity
    let postsToCreate = 0
    if (!hasRecentRealActivity) {
      // No real activity in 2h: create 1-2 bot posts
      postsToCreate = Math.random() > 0.5 ? 2 : 1
    } else {
      // Some real activity exists: maybe 1 bot post in "valley hours" (midnight-6am)
      const hour = now.getHours()
      const isValleyHour = hour >= 0 && hour <= 6
      if (isValleyHour) {
        postsToCreate = Math.random() > 0.6 ? 1 : 0
      }
    }

    if (postsToCreate === 0) {
      console.log('[smart-feed-filler] No posts needed right now')
      
      // Still run engagement simulation
      const engagementResult = await simulateBotEngagement(supabase)
      
      return new Response(
        JSON.stringify({ action: 'no_posts_needed', engagement: engagementResult }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Get random seed profiles to post as
    const { data: seedProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_seed', true)
      .eq('account_status', 'active')
      .limit(20)

    if (!seedProfiles || seedProfiles.length === 0) {
      console.log('[smart-feed-filler] No seed profiles available')
      return new Response(
        JSON.stringify({ action: 'skipped', reason: 'no_seed_profiles' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Create bot posts with random delays
    const createdPosts: string[] = []
    
    for (let i = 0; i < postsToCreate; i++) {
      // Random seed profile
      const randomProfile = seedProfiles[Math.floor(Math.random() * seedProfiles.length)]
      
      // Random content
      const randomContent = CONTENT_TEMPLATES[Math.floor(Math.random() * CONTENT_TEMPLATES.length)]
      
      // Random delay between 0-30 minutes offset in created_at to look natural
      const randomOffsetMs = Math.floor(Math.random() * 30 * 60 * 1000)
      const postTime = new Date(now.getTime() - randomOffsetMs)

      const { data: newPost, error: postError } = await supabase
        .from('posts')
        .insert({
          user_id: randomProfile.id,
          content_text: randomContent,
          privacy_level: 'public',
          is_locked: false,
          is_seed: true,
          created_at: postTime.toISOString(),
        })
        .select('id')
        .single()

      if (postError) {
        console.error('[smart-feed-filler] Error creating bot post:', postError)
      } else {
        createdPosts.push(newPost.id)
        console.log(`[smart-feed-filler] Created bot post: ${newPost.id}`)
      }

      // Add random delay between posts (simulate natural behavior)
      if (i < postsToCreate - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500))
      }
    }

    // 6. Run engagement simulation (bots like human posts)
    const engagementResult = await simulateBotEngagement(supabase)

    return new Response(
      JSON.stringify({
        action: 'posts_created',
        count: createdPosts.length,
        post_ids: createdPosts,
        engagement: engagementResult,
        had_real_activity: hasRecentRealActivity,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[smart-feed-filler] Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Simulates bot engagement: bots like recent human posts
 * to boost dopamine for real users (silent notifications)
 */
async function simulateBotEngagement(supabase: any) {
  try {
    // Get recent real user posts from last 6 hours that have low engagement
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    
    const { data: recentHumanPosts } = await supabase
      .from('posts')
      .select('id, user_id, likes_count')
      .eq('is_seed', false)
      .gte('created_at', sixHoursAgo.toISOString())
      .lt('likes_count', 5) // Only boost low-engagement posts
      .order('created_at', { ascending: false })
      .limit(10)

    if (!recentHumanPosts || recentHumanPosts.length === 0) {
      return { likes_added: 0, reason: 'no_eligible_posts' }
    }

    // Get some seed profiles for liking
    const { data: seedProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('is_seed', true)
      .limit(10)

    if (!seedProfiles || seedProfiles.length === 0) {
      return { likes_added: 0, reason: 'no_seed_profiles' }
    }

    let likesAdded = 0

    // Each eligible post gets 1-3 bot likes
    for (const post of recentHumanPosts) {
      const numLikes = Math.floor(Math.random() * 3) + 1
      
      for (let i = 0; i < numLikes && i < seedProfiles.length; i++) {
        const botProfile = seedProfiles[Math.floor(Math.random() * seedProfiles.length)]
        
        // Check if already liked
        const { data: existing } = await supabase
          .from('post_likes')
          .select('id')
          .eq('post_id', post.id)
          .eq('user_id', botProfile.id)
          .maybeSingle()

        if (!existing) {
          const { error } = await supabase
            .from('post_likes')
            .insert({ post_id: post.id, user_id: botProfile.id })

          if (!error) {
            likesAdded++
            
            // Update likes_count on post
            await supabase
              .from('posts')
              .update({ likes_count: (post.likes_count || 0) + 1 })
              .eq('id', post.id)
          }
        }
      }
    }

    console.log(`[smart-feed-filler] Engagement simulation: ${likesAdded} likes added`)
    return { likes_added: likesAdded, posts_boosted: recentHumanPosts.length }

  } catch (error) {
    console.error('[smart-feed-filler] Engagement error:', error)
    return { likes_added: 0, error: String(error) }
  }
}
