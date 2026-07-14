// Helper: notifica o dono do perfil quando alguém avalia ou deixa depoimento.
// - Insere uma linha em `notifications` (in-app + e-mail se houver gatilho server-side).
// - Dispara Web Push via edge function `send-push-notification` (best-effort).
import { supabase } from "@/lib/supabaseExternal";
import { triggerPush } from "@/lib/pushTrigger";

async function getUserIdFromProfile(profileId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("id", profileId)
    .maybeSingle();
  return (data as any)?.user_id ?? null;
}

async function getActorHandle(profileId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("username, name")
    .eq("id", profileId)
    .maybeSingle();
  const u = (data as any)?.username;
  return u ? `@${u}` : "Alguém";
}

interface NotifyArgs {
  actorProfileId: string;
  targetProfileId: string;
  url?: string;
}

export async function notifyProfileRating(
  args: NotifyArgs & { stars: number },
): Promise<void> {
  try {
    const [targetUserId, handle] = await Promise.all([
      getUserIdFromProfile(args.targetProfileId),
      getActorHandle(args.actorProfileId),
    ]);
    if (!targetUserId) return;
    const title = `${handle} avaliou seu perfil`;
    const body = `${args.stars} ${args.stars === 1 ? "estrela" : "estrelas"}`;
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      type: "profile_rating",
      title,
      body,
      data: { actor_profile_id: args.actorProfileId, stars: args.stars, url: args.url ?? null },
    });
    triggerPush({ user_id: targetUserId, title, body, url: args.url, type: "profile_rating", tag: `rating:${args.actorProfileId}` });
  } catch {
    /* best-effort */
  }
}

export async function notifyProfileTestimonial(args: NotifyArgs & { preview: string }): Promise<void> {
  try {
    const [targetUserId, handle] = await Promise.all([
      getUserIdFromProfile(args.targetProfileId),
      getActorHandle(args.actorProfileId),
    ]);
    if (!targetUserId) return;
    const title = `${handle} deixou um depoimento no seu perfil`;
    const body = args.preview.length > 90 ? args.preview.slice(0, 87) + "…" : args.preview;
    await supabase.from("notifications").insert({
      user_id: targetUserId,
      type: "profile_testimonial",
      title,
      body,
      data: { actor_profile_id: args.actorProfileId, url: args.url ?? null },
    });
    triggerPush({ user_id: targetUserId, title, body, url: args.url, type: "profile_testimonial", tag: `testimonial:${args.actorProfileId}` });
  } catch {
    /* best-effort */
  }
}
