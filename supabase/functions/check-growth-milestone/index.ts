import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('EXTERNAL_SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Checking growth milestone...");

    // Count real users (is_seed = false or null)
    const { count: realUsersCount, error: realError } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .or("is_seed.eq.false,is_seed.is.null");

    if (realError) {
      console.error("Error counting real users:", realError);
      throw realError;
    }

    // Count seed users (is_seed = true)
    const { count: seedUsersCount, error: seedError } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_seed", true);

    if (seedError) {
      console.error("Error counting seed users:", seedError);
      throw seedError;
    }

    const realUsers = realUsersCount || 0;
    const seedUsers = seedUsersCount || 0;

    console.log(`Real users: ${realUsers}, Seed users: ${seedUsers}`);

    // Check if we've hit the 3x milestone
    // Condition: realUsers >= (seedUsers * 3) AND seedUsers > 0
    if (seedUsers > 0 && realUsers >= seedUsers * 3) {
      console.log("🚀 Growth milestone reached! Creating backup before purge...");

      // ========== BACKUP PHASE ==========
      // Fetch all seed data before deletion
      const { data: seedProfiles, error: fetchProfilesError } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_seed", true);

      if (fetchProfilesError) {
        console.error("Error fetching seed profiles for backup:", fetchProfilesError);
      }

      const { data: seedPosts, error: fetchPostsError } = await supabase
        .from("posts")
        .select("*")
        .eq("is_seed", true);

      if (fetchPostsError) {
        console.error("Error fetching seed posts for backup:", fetchPostsError);
      }

      const { data: seedLikes, error: fetchLikesError } = await supabase
        .from("post_likes")
        .select("*")
        .eq("is_seed", true);

      if (fetchLikesError) {
        console.error("Error fetching seed likes for backup:", fetchLikesError);
      }

      // Create backup JSON object
      const backupData = {
        timestamp: new Date().toISOString(),
        trigger: "growth_milestone_3x",
        stats: {
          real_users: realUsers,
          seed_users: seedUsers,
        },
        data: {
          profiles: seedProfiles || [],
          posts: seedPosts || [],
          likes: seedLikes || [],
        },
      };

      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `backup_${timestamp}.json`;

      // Upload backup to storage
      const backupBlob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: "application/json",
      });

      const { error: uploadError } = await supabase.storage
        .from("seed-backups")
        .upload(backupPath, backupBlob, {
          contentType: "application/json",
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading backup:", uploadError);
        // Continue with purge even if backup fails, but log it
      } else {
        console.log(`✅ Backup saved to seed-backups/${backupPath}`);
      }

      // ========== PURGE PHASE ==========
      console.log("Starting auto-purge...");

      // Step 1: Delete seed likes first (due to foreign keys)
      const { error: likesError } = await supabase
        .from("post_likes")
        .delete()
        .eq("is_seed", true);

      if (likesError) {
        console.error("Error deleting seed likes:", likesError);
      }

      // Step 2: Delete seed posts
      const { error: postsError } = await supabase
        .from("posts")
        .delete()
        .eq("is_seed", true);

      if (postsError) {
        console.error("Error deleting seed posts:", postsError);
      }

      // Step 3: Delete seed profiles
      const { error: profilesError } = await supabase
        .from("profiles")
        .delete()
        .eq("is_seed", true);

      if (profilesError) {
        console.error("Error deleting seed profiles:", profilesError);
      }

      // Step 4: Create audit log entry
      // Get a system admin to attribute the action (first admin_master found)
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin_master")
        .limit(1);

      const systemAdminId = adminRoles?.[0]?.user_id || "00000000-0000-0000-0000-000000000000";

      await supabase.from("audit_logs").insert({
        admin_id: systemAdminId,
        action_type: "seed_auto_purge",
        target_resource: "profiles",
        details: {
          real_users_count: realUsers,
          seed_users_purged: seedUsers,
          profiles_backed_up: seedProfiles?.length || 0,
          posts_backed_up: seedPosts?.length || 0,
          likes_backed_up: seedLikes?.length || 0,
          backup_path: uploadError ? "FAILED" : `seed-backups/${backupPath}`,
          reason: "Meta de crescimento 3:1 atingida",
          automated: true,
        },
        user_agent: "System/AutoPurge",
      });

      // Step 5: Send notifications to all admin_master users
      const { data: allAdmins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin_master");

      if (allAdmins && allAdmins.length > 0) {
        const notifications = allAdmins.map((admin) => ({
          user_id: admin.user_id,
          type: "subscription", // Using existing type that fits best
          title: "🚀 Meta Inicial Batida!",
          body: `Parabéns! O número de usuários reais (${realUsers}) ultrapassou 3x a base inicial (${seedUsers}). Todos os ${seedUsers} perfis de teste foram removidos automaticamente. Sua plataforma agora é 100% orgânica.`,
          data: {
            milestone: "growth_3x",
            real_users: realUsers,
            seed_users_purged: seedUsers,
            backup_path: uploadError ? null : `seed-backups/${backupPath}`,
            celebration: true,
          },
        }));

        const { error: notifError } = await supabase
          .from("notifications")
          .insert(notifications);

        if (notifError) {
          console.error("Error creating admin notifications:", notifError);
        } else {
          console.log(`Sent milestone notifications to ${allAdmins.length} admin(s)`);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          milestone_reached: true,
          message: "Growth milestone reached! Seed data backed up and purged.",
          backup_path: uploadError ? null : `seed-backups/${backupPath}`,
          stats: {
            real_users: realUsers,
            seed_users_purged: seedUsers,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Milestone not yet reached
    return new Response(
      JSON.stringify({
        success: true,
        milestone_reached: false,
        message: "Milestone not yet reached",
        stats: {
          real_users: realUsers,
          seed_users: seedUsers,
          target: seedUsers * 3,
          progress: seedUsers > 0 ? ((realUsers / (seedUsers * 3)) * 100).toFixed(1) + "%" : "N/A",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in check-growth-milestone:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
