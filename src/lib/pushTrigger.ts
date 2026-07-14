// Helper unificado para disparar Web Push via edge function `send-push-notification`.
// Fire-and-forget: nunca bloqueia o fluxo do usuário e nunca lança exceções.
// Filtragem de is_seed e VAPID/global enable já são feitas dentro da edge function.

import { supabase } from "@/lib/supabaseExternal";

export interface PushTriggerPayload {
  user_id: string;
  sender_id?: string;
  title: string;
  body: string;
  url?: string;
  type?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export function triggerPush(payload: PushTriggerPayload): void {
  // Evita travar a UI — fire-and-forget
  try {
    void supabase.functions
      .invoke("send-push-notification", { body: payload })
      .catch(() => {
        /* silencioso: push é best-effort */
      });
  } catch {
    /* ignore */
  }
}
