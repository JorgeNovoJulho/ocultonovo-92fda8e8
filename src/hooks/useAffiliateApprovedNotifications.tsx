import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "./useAuth";
import { playNewMessageSound } from "@/lib/messageSound";
import type { AffiliateApprovedData } from "@/components/AffiliateApprovedModal";
import { logger } from '@/lib/logger';

/**
 * Escuta em tempo real, na sessão do AFILIADO (destinatário), a chegada de
 * uma mensagem com media_type='affiliate_approval' e abre o modal de
 * "Aprovado como Afiliado", com som e efeito visual, sem reload.
 */
export function useAffiliateApprovedNotifications() {
  const { user } = useAuth();
  const [data, setData] = useState<AffiliateApprovedData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const processedRef = useRef<Set<string>>(new Set());

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setData(null), 300);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const handleMessage = async (row: any) => {
      try {
        if (!row?.id || row.media_type !== "affiliate_approval") return;
        if (processedRef.current.has(row.id)) return;

        // Confirma que o usuário atual é PARTICIPANTE da conversa e
        // NÃO é o remetente (o creator que aprovou).
        const { data: parts } = await (supabase as any)
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", row.conversation_id);

        const myIds = new Set<string>([user.id]);
        const isParticipant = (parts || []).some((p: any) => myIds.has(p.user_id));
        if (!isParticipant) return;

        // Lookup robusto do profile remetente — duas queries separadas (evita
        // problemas conhecidos com .or() + UUID no PostgREST).
        let senderProf: any = null;
        try {
          const byId = await (supabase as any)
            .from("profiles")
            .select("id, user_id, username, avatar_url, name, display_name, full_name, cover_url")
            .eq("id", row.sender_id)
            .maybeSingle();
          senderProf = byId.data;
          if (!senderProf) {
            const byUser = await (supabase as any)
              .from("profiles")
              .select("id, user_id, username, avatar_url, name, display_name, full_name, cover_url")
              .eq("user_id", row.sender_id)
              .maybeSingle();
            senderProf = byUser.data;
          }
        } catch (e) {
          console.warn("[affiliate-approved] senderProf lookup error:", e);
        }
        logger.info("[affiliate-approved] sender_id=", row.sender_id, "found=", !!senderProf, "username=", senderProf?.username);

        if (senderProf?.user_id && senderProf.user_id === user.id) return;

        processedRef.current.add(row.id);

        const meta = (row.metadata || {}) as Record<string, any>;
        if (!active) return;

        playNewMessageSound();
        // Fallback: extrai @username do próprio conteúdo da DM (ex.: "(@mulatacuriosa_ofc)")
        let usernameFromContent: string | null = null;
        try {
          const m = String(row.content || "").match(/@([a-zA-Z0-9_\.]{2,})/);
          if (m) usernameFromContent = m[1];
        } catch {}

        let ownerUsername =
          meta.owner_username ?? senderProf?.username ?? usernameFromContent ?? null;

        // Último fallback: busca direta por profile.id == sender_id (sem .or, sem RLS edge cases)
        if (!ownerUsername) {
          try {
            const { data: p2 } = await (supabase as any)
              .from("profiles")
              .select("username")
              .eq("id", row.sender_id)
              .maybeSingle();
            if (p2?.username) ownerUsername = p2.username;
          } catch {}
        }

        // Tokens de nome real para evitar vazamento como nome do canal
        const realNameTokens = [
          (senderProf as any)?.name,
          (senderProf as any)?.display_name,
          (senderProf as any)?.full_name,
        ]
          .filter(Boolean)
          .map((s: string) => String(s).trim().toLowerCase());

        // Busca o plano mensal ao vivo do criador para garantir nome e banner
        // corretos do Canal VIP — sobrepõe metadados antigos/vazios.
        let livePlanTitle: string | null = null;
        let livePlanBanner: string | null = null;
        try {
          // Tenta por profile.id encontrado; se não houver, tenta o próprio sender_id
          // como profile_id (já que sender_id na convenção do projeto é profile.id).
          const profileIdForPlan = senderProf?.id || row.sender_id;
          if (profileIdForPlan) {
            const { data: plans } = await (supabase as any)
              .from("subscription_plans")
              .select("title, banner_url, monthly_price, created_at")
              .eq("profile_id", profileIdForPlan)
              .order("created_at", { ascending: true });
            const list = (plans || []) as any[];
            const chosen =
              list.find((p) => p.banner_url && (p.title || "").trim()) ||
              list.find((p) => (p.title || "").trim()) ||
              list[0] ||
              null;
            if (chosen) {
              const t = (chosen.title || "").trim();
              if (t && !realNameTokens.includes(t.toLowerCase())) livePlanTitle = t;
              if (chosen.banner_url) livePlanBanner = chosen.banner_url;
            }
            logger.info("[affiliate-approved] livePlan title=", livePlanTitle, "banner=", !!livePlanBanner);
          }
        } catch (e) {
          console.warn("[affiliate-approved] plan lookup error:", e);
        }

        const rawMetaName = (meta.channel_name || "").trim();
        const safeMetaName =
          rawMetaName && !realNameTokens.includes(rawMetaName.toLowerCase())
            ? rawMetaName
            : null;

        const safeChannelName =
          livePlanTitle ||
          safeMetaName ||
          (ownerUsername ? `@${ownerUsername}` : "Canal VIP");

        const safeChannelBanner =
          livePlanBanner ||
          meta.channel_banner ||
          (senderProf as any)?.cover_url ||
          null;

        setData({
          conversationId: String(row.conversation_id),
          channelName: safeChannelName,
          channelBanner: safeChannelBanner,
          ownerUsername,
          ownerAvatar: senderProf?.avatar_url ?? null,
          referralCode: meta.referral_code ?? null,
          referralLink: meta.referral_link ?? null,
        });


        setTimeout(() => {
          if (active) setIsOpen(true);
        }, 100);
      } catch (err) {
        console.warn("[useAffiliateApprovedNotifications] erro:", err);
      }
    };

    const unsub = subscribeTable(
      "messages",
      (payload: any) => {
        const row = payload.new;
        if (!row || row.media_type !== "affiliate_approval") return;
        handleMessage(row);
      },
      { events: ["INSERT"] },
    );

    return () => {
      active = false;
      unsub();
    };
  }, [user]);

  return { data, isOpen, closeModal };
}
