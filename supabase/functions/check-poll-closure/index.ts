import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[check-poll-closure] Starting poll closure check...");

    // Find polls that should be closed (closes_at <= now() AND is_active = true)
    const { data: expiredPolls, error: pollsError } = await supabase
      .from("polls")
      .select(`
        id,
        question,
        creator_id,
        post_id,
        total_votes
      `)
      .eq("is_active", true)
      .not("closes_at", "is", null)
      .lte("closes_at", new Date().toISOString());

    if (pollsError) {
      console.error("[check-poll-closure] Error fetching expired polls:", pollsError);
      throw pollsError;
    }

    if (!expiredPolls || expiredPolls.length === 0) {
      console.log("[check-poll-closure] No expired polls found");
      return new Response(
        JSON.stringify({ message: "No expired polls", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[check-poll-closure] Found ${expiredPolls.length} expired polls`);

    let notificationsSent = 0;

    for (const poll of expiredPolls) {
      console.log(`[check-poll-closure] Processing poll: ${poll.id}`);

      // Mark poll as inactive
      const { error: updateError } = await supabase
        .from("polls")
        .update({ is_active: false })
        .eq("id", poll.id);

      if (updateError) {
        console.error(`[check-poll-closure] Error updating poll ${poll.id}:`, updateError);
        continue;
      }

      // Get winning option
      const { data: options, error: optionsError } = await supabase
        .from("poll_options")
        .select("option_text, votes_count")
        .eq("poll_id", poll.id)
        .order("votes_count", { ascending: false })
        .limit(1);

      if (optionsError) {
        console.error(`[check-poll-closure] Error fetching options for poll ${poll.id}:`, optionsError);
        continue;
      }

      const winningOption = options?.[0];
      const winningText = winningOption?.option_text || "Empate";
      const winningVotes = winningOption?.votes_count || 0;

      // Get all voters for this poll
      const { data: voters, error: votersError } = await supabase
        .from("poll_votes")
        .select("voter_id")
        .eq("poll_id", poll.id);

      if (votersError) {
        console.error(`[check-poll-closure] Error fetching voters for poll ${poll.id}:`, votersError);
        continue;
      }

      // Get unique voter IDs
      const uniqueVoterIds = [...new Set(voters?.map((v) => v.voter_id) || [])];
      console.log(`[check-poll-closure] Notifying ${uniqueVoterIds.length} voters`);

      // Create notifications for each voter
      for (const voterId of uniqueVoterIds) {
        const notificationData = {
          user_id: voterId,
          type: "poll_ended",
          title: "Enquete Encerrada!",
          message: `A enquete "${poll.question.substring(0, 50)}..." terminou. Opção vencedora: "${winningText}" com ${winningVotes} votos!`,
          link: `/post/${poll.post_id}`,
          is_read: false,
        };

        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notificationData);

        if (notifError) {
          console.error(`[check-poll-closure] Error creating notification:`, notifError);
        } else {
          notificationsSent++;
        }
      }

      // Try to send push notifications
      try {
        for (const voterId of uniqueVoterIds) {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              user_id: voterId,
              title: "🗳️ Enquete Encerrada!",
              body: `"${winningText}" venceu com ${winningVotes} votos!`,
              url: `/post/${poll.post_id}`,
            },
          });
        }
      } catch (pushError) {
        console.error("[check-poll-closure] Push notification error:", pushError);
        // Continue even if push fails
      }
    }

    console.log(`[check-poll-closure] Completed. Polls processed: ${expiredPolls.length}, Notifications sent: ${notificationsSent}`);

    return new Response(
      JSON.stringify({
        message: "Poll closure check completed",
        polls_processed: expiredPolls.length,
        notifications_sent: notificationsSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[check-poll-closure] Fatal error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
