import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('EXTERNAL_SUPABASE_URL')!,
      Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
    );

    const formData = await req.formData();
    const photo = formData.get("photo") as File | null;
    const video = formData.get("video") as File | null;
    const socialLinksRaw = formData.get("social_links") as string || "{}";
    const careerDescription = formData.get("career_description") as string || "";
    const applicantName = formData.get("applicant_name") as string || null;
    const applicantEmail = formData.get("applicant_email") as string || null;
    const userId = formData.get("user_id") as string || null;

    if (!photo || !video) {
      return new Response(JSON.stringify({ error: "Foto e vídeo são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!careerDescription.trim()) {
      return new Response(JSON.stringify({ error: "Descrição da carreira é obrigatória" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 Validações: tamanho e tipo
    if (photo.size > 15 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Foto excede 15MB" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (video.size > 100 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Vídeo excede 100MB" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(photo.type)) {
      return new Response(JSON.stringify({ error: "Foto: tipo inválido" }), {
        status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^video\/(mp4|quicktime|webm)$/i.test(video.type)) {
      return new Response(JSON.stringify({ error: "Vídeo: tipo inválido" }), {
        status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (careerDescription.length > 5000) {
      return new Response(JSON.stringify({ error: "Descrição muito longa (máx. 5000 caracteres)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (applicantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
      return new Response(JSON.stringify({ error: "Email inválido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload photo
    const photoExt = photo.name.split(".").pop();
    const photoPath = `submissions/${Date.now()}-photo.${photoExt}`;
    const photoBuffer = new Uint8Array(await photo.arrayBuffer());

    const { error: photoErr } = await supabaseAdmin.storage
      .from("founder-media")
      .upload(photoPath, photoBuffer, { contentType: photo.type, upsert: true });

    if (photoErr) {
      console.error("Photo upload error:", photoErr);
      return new Response(JSON.stringify({ error: "Erro ao enviar foto: " + photoErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload video
    const videoExt = video.name.split(".").pop();
    const videoPath = `submissions/${Date.now()}-video.${videoExt}`;
    const videoBuffer = new Uint8Array(await video.arrayBuffer());

    const { error: videoErr } = await supabaseAdmin.storage
      .from("founder-media")
      .upload(videoPath, videoBuffer, { contentType: video.type, upsert: true });

    if (videoErr) {
      console.error("Video upload error:", videoErr);
      return new Response(JSON.stringify({ error: "Erro ao enviar vídeo: " + videoErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get signed URLs (bucket is private)
    const { data: photoUrl, error: photoSignErr } = await supabaseAdmin.storage.from("founder-media").createSignedUrl(photoPath, 60 * 60 * 24 * 365); // 1 year
    const { data: videoUrl, error: videoSignErr } = await supabaseAdmin.storage.from("founder-media").createSignedUrl(videoPath, 60 * 60 * 24 * 365); // 1 year

    if (photoSignErr || videoSignErr) {
      console.error("Signed URL error:", photoSignErr || videoSignErr);
      return new Response(JSON.stringify({ error: "Erro ao gerar URLs de acesso" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse social links
    let socialLinks = {};
    try { socialLinks = JSON.parse(socialLinksRaw); } catch { socialLinks = {}; }

    // Insert application using service_role (bypasses RLS)
    const { data, error: insertErr } = await supabaseAdmin
      .from("creator_founder_applications")
      .insert({
        user_id: userId || null,
        social_links: socialLinks,
        career_description: careerDescription,
        photo_url: photoUrl.signedUrl,
        video_url: videoUrl.signedUrl,
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(JSON.stringify({ error: "Erro ao salvar candidatura: " + insertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
