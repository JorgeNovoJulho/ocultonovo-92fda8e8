import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CF_API = 'https://api.cloudflare.com/client/v4';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const cfApiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

    if (!cfAccountId || !cfApiToken) {
      console.error('[transcode-video] Missing Cloudflare credentials');
      return new Response(JSON.stringify({ error: 'Cloudflare not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { post_id, original_url, media_type } = await req.json();

    if (!post_id || !original_url) {
      return new Response(JSON.stringify({ error: 'Missing post_id or original_url' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (media_type !== 'video') {
      return new Response(JSON.stringify({ status: 'skipped', reason: 'not_video' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get profile id
    const { data: profile } = await supabase
      .from('profiles').select('id').eq('user_id', user.id).single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create transcoding job
    const { data: job, error: jobError } = await supabase
      .from('video_transcoding_jobs')
      .insert({ post_id, user_id: profile.id, original_url, status: 'processing', progress: 0 })
      .select().single();

    if (jobError) {
      console.error('[transcode-video] Job creation error:', jobError);
      return new Response(JSON.stringify({ error: jobError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase.from('posts').update({ video_processing_status: 'processing' }).eq('id', post_id);

    // Start Cloudflare Stream upload in background
    EdgeRuntime.waitUntil(
      processWithCloudflare(supabase, job.id, post_id, original_url, profile.id, cfAccountId, cfApiToken)
    );

    return new Response(JSON.stringify({ job_id: job.id, status: 'processing' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[transcode-video] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processWithCloudflare(
  supabase: any, jobId: string, postId: string, originalUrl: string,
  userId: string, accountId: string, apiToken: string,
) {
  try {
    console.log(`[transcode-video] Starting Cloudflare Stream upload for job ${jobId}`);

    // Update progress: uploading to Cloudflare
    await supabase.from('video_transcoding_jobs')
      .update({ progress: 10, metadata: { stage: 'uploading_to_cloudflare' } })
      .eq('id', jobId);

    // Upload video to Cloudflare Stream via URL copy
    const copyRes = await fetch(`${CF_API}/accounts/${accountId}/stream/copy`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: originalUrl,
        meta: { name: `post-${postId}`, postId, jobId },
      }),
    });

    if (!copyRes.ok) {
      const errBody = await copyRes.text();
      throw new Error(`Cloudflare copy failed [${copyRes.status}]: ${errBody}`);
    }

    const copyData = await copyRes.json();
    const videoUid = copyData.result?.uid;

    if (!videoUid) {
      throw new Error('No video UID returned from Cloudflare');
    }

    console.log(`[transcode-video] Video uploaded to CF: ${videoUid}`);

    await supabase.from('video_transcoding_jobs')
      .update({ progress: 30, metadata: { stage: 'processing_cloudflare', cf_uid: videoUid } })
      .eq('id', jobId);

    // Poll Cloudflare until readyToStream
    let ready = false;
    let videoData: any = null;
    const maxAttempts = 60; // max ~5 minutes

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusRes = await fetch(`${CF_API}/accounts/${accountId}/stream/${videoUid}`, {
        headers: { 'Authorization': `Bearer ${apiToken}` },
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      videoData = statusData.result;

      if (videoData?.readyToStream) {
        ready = true;
        break;
      }

      // Update progress based on pct if available
      const pct = videoData?.status?.pctComplete ? parseInt(videoData.status.pctComplete) : 0;
      const progress = 30 + Math.min(pct * 0.6, 60); // 30-90 range
      await supabase.from('video_transcoding_jobs')
        .update({ progress: Math.round(progress), metadata: { stage: 'encoding', cf_uid: videoUid, pct } })
        .eq('id', jobId);
    }

    if (!ready || !videoData) {
      throw new Error('Cloudflare encoding timed out');
    }

    // Extract URLs
    const hlsUrl = videoData.playback?.hls;
    const dashUrl = videoData.playback?.dash;
    const thumbnailUrl = `https://customer-f33zs165nr7gyfy4.cloudflarestream.com/${videoUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
    const previewUrl = hlsUrl; // HLS serves adaptive bitrate including 720p
    const masterUrl = hlsUrl; // Same HLS manifest serves all qualities

    console.log(`[transcode-video] Job ${jobId} ready. HLS: ${hlsUrl}`);

    // Complete the job
    await supabase.from('video_transcoding_jobs')
      .update({
        status: 'completed', progress: 100,
        master_url: masterUrl, preview_url: previewUrl, hls_manifest_url: hlsUrl,
        metadata: {
          stage: 'completed', cf_uid: videoUid,
          thumbnail: thumbnailUrl, dash_url: dashUrl,
          duration: videoData.duration, input: videoData.input,
        },
      })
      .eq('id', jobId);

    // Update post with Cloudflare Stream URLs
    await supabase.from('posts')
      .update({
        video_master_url: masterUrl,
        video_preview_url: previewUrl,
        video_processing_status: 'completed',
      })
      .eq('id', postId);

    console.log(`[transcode-video] Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`[transcode-video] Job ${jobId} failed:`, error);

    // Fallback to original URL
    await supabase.from('video_transcoding_jobs')
      .update({
        status: 'failed', progress: 100,
        error_message: error.message,
        master_url: originalUrl, preview_url: originalUrl,
      })
      .eq('id', jobId);

    await supabase.from('posts')
      .update({
        video_master_url: originalUrl, video_preview_url: originalUrl,
        video_processing_status: 'fallback',
      })
      .eq('id', postId);
  }
}
