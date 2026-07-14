/**
 * Helper: notifica o usuário-alvo quando alguém clica em "Aproximar" no
 * carrossel "Explorar novos misteriosos(as)".
 *
 *  - Insere uma linha em `notifications` (tipo `approach_received`)
 *  - Dispara Web Push best-effort
 *  - URL leva direto para a sessão (rota `/feed?focus=newcomers`)
 *
 * Fire-and-forget — nunca lança nem trava o fluxo de aproximação.
 */
import { supabase } from "@/lib/supabaseExternal";
import { triggerPush } from "@/lib/pushTrigger";

interface NotifyApproachArgs {
  /** profile.id de quem clicou em "Aproximar" */
  actorProfileId: string;
  /** profile.id do alvo (quem vai receber a notificação) */
  targetProfileId: string;
}

const APPROACH_URL = "/feed?focus=newcomers";

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
    .select("username")
    .eq("id", profileId)
    .maybeSingle();
  const u = (data as any)?.username;
  return u ? `@${u}` : "Alguém";
}

export async function notifyDiscoveryApproach(args: NotifyApproachArgs): Promise<void> {
  try {
    const targetUserId = await getUserIdFromProfile(args.targetProfileId);
    if (!targetUserId) return;

    // Mistério proposital: NÃO revelamos quem foi.
    // Isso incentiva o alvo a abrir e explorar todos os cards da sessão.
    const title = "Alguém quer um match com você 💘";
    const body = 'Surpresa! Explore "Novos misteriosos(as)" e descubra quem se aproximou.';

    await supabase.from("notifications").insert({
      user_id: targetUserId,
      type: "approach_received",
      title,
      body,
      data: {
        // actor_profile_id intencionalmente OMITIDO para preservar o mistério.
        url: APPROACH_URL,
        cta_label: "Explorar",
        focus: "newcomers",
        mystery: true,
      },
    });

    triggerPush({
      user_id: targetUserId,
      title,
      body,
      url: APPROACH_URL,
      type: "approach_received",
      tag: "approach:mystery",
    });
  } catch {
    /* best-effort */
  }
}
