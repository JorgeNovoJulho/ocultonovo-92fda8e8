import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { playAttentionAlert } from "@/lib/attentionPing";
import { isChatBlockedBetween } from "@/lib/chatIdentity";

interface AttentionPingRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_profile_id: string | null;
  conversation_id: string | null;
  message: string | null;
  created_at: string;
}

/**
 * Listener global de "Chamar Atenção".
 * Quando o usuário logado recebe um ping, dispara:
 *  - som (configurado pelo admin master, volume do usuário)
 *  - vibração reforçada
 *  - toast (sonner, top-center) com CTA para abrir a conversa, visível mesmo em mobile
 */
export function useAttentionPingsListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const unsub = subscribeTable(
      "oculto_attention_pings",
      async (payload: any) => {
        const ping = payload.new as AttentionPingRow;
        if (!ping || ping.to_user_id !== user.id) return;
        if (ping.from_user_id === user.id) return;
        if (await isChatBlockedBetween(ping.from_user_id, user.id)) return;

        // Busca @username do remetente (NUNCA usar nome real)
        let actorLabel = "@usuario";
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("username")
            .eq("user_id", ping.from_user_id)
            .maybeSingle();
          if (prof?.username) actorLabel = `@${prof.username}`;
        } catch { /* noop */ }

        try {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate?.([200, 100, 200, 100, 400]);
          }
        } catch { /* noop */ }

        void playAttentionAlert();

        toast(`🔔 ${actorLabel} está chamando sua atenção`, {
          description: "Toque em Abrir para responder no chat",
          duration: 15000,
          position: "top-center",
          action: {
            label: "Abrir",
            onClick: () => {
              if (ping.conversation_id) {
                navigate(`/messages?c=${ping.conversation_id}`);
              } else {
                navigate("/messages");
              }
            },
          },
        });
      },
      { events: ["INSERT"] },
    );

    unsubRef.current = unsub;
    return () => {
      try { unsub(); } catch { /* noop */ }
      unsubRef.current = null;
    };
  }, [user?.id, navigate]);
}

/** Wrapper para mount declarativo dentro de ProtectedRoute. */
export function AttentionPingListenerMount() {
  useAttentionPingsListener();
  return null;
}
