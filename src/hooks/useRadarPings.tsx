import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

export interface RadarPing {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "sent" | "seen";
  created_at: string;
  seen_at: string | null;
}

const PING_COOLDOWN_MS = 60_000; // 1 minute cooldown per user
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

async function resolveProfileIdentity(identifier: string): Promise<{ profileId: string | null; userId: string }> {
  if (!isUuid(identifier)) return { profileId: null, userId: identifier };
  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("id,user_id")
    .or(`id.eq.${identifier},user_id.eq.${identifier}`)
    .maybeSingle();
  if (error || !data) return { profileId: null, userId: identifier };
  return { profileId: data.id ?? null, userId: data.user_id ?? identifier };
}

function getNotificationSenderId(data: any): string | undefined {
  return data?.sender_id || data?.from_user_id || data?.sender || data?.profile_id || undefined;
}

export function useRadarPings() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [pingAnimation, setPingAnimation] = useState<{ targetId: string; timestamp: number } | null>(null);
  const myIdentifiers = useMemo(
    () => Array.from(new Set([user?.id, profile?.id].filter(isUuid))),
    [user?.id, profile?.id]
  );
  const myIdentifierSet = useMemo(() => new Set(myIdentifiers), [myIdentifiers]);
  const radarPingsQueryKey = useMemo(
    () => ["radar-pings", user?.id, profile?.id ?? null] as const,
    [user?.id, profile?.id]
  );

  // Fetch recent pings (last 24h). Faz merge com notificações do tipo
  // "looking_now" para cobrir casos em que o aceno foi gravado apenas
  // como notificação (tabela `pings` ausente/sem RLS de leitura para o
  // receptor, ou push enviado por outro fluxo).
  const { data: pings = [] } = useQuery({
    queryKey: radarPingsQueryKey,
    enabled: !!user?.id,
    queryFn: async (): Promise<RadarPing[]> => {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      const sinceIso = oneDayAgo.toISOString();

      // 1) Tabela pings (se existir e visível)
      let rows: RadarPing[] = [];
      const pingProbe = await (supabase as any).from("pings").select("id").limit(1);
      if (pingProbe.error?.code !== "PGRST205") {
        const orFilter = myIdentifiers.length > 0
          ? myIdentifiers.flatMap((id) => [`sender_id.eq.${id}`, `receiver_id.eq.${id}`]).join(",")
          : `sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`;
        const { data, error } = await (supabase as any)
          .from("pings")
          .select("id,sender_id,receiver_id,status,created_at,seen_at")
          .or(orFilter)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(data)) rows = data as RadarPing[];
      }

      // 2) Fallback/merge a partir de notifications type='looking_now'
      try {
        const { data: notifs } = await (supabase as any)
          .from("notifications")
          .select("id,user_id,type,data,created_at,is_read")
          .in("user_id", myIdentifiers.length > 0 ? myIdentifiers : [user!.id])
          .eq("type", "looking_now")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false });

        if (Array.isArray(notifs)) {
          const existingSenders = new Set(
            rows.filter((r) => r.receiver_id === user!.id).map((r) => r.sender_id)
          );
          for (const n of notifs as any[]) {
            const senderId = getNotificationSenderId(n?.data);
            if (!senderId || senderId === user!.id) continue;
            if (existingSenders.has(senderId)) continue;
            existingSenders.add(senderId);
            const wasSeen = !!n.is_read;
            rows.push({
              id: `notif:${n.id}`,
              sender_id: senderId,
              receiver_id: user!.id,
              status: wasSeen ? "seen" : "sent",
              created_at: n.created_at,
              seen_at: wasSeen ? n.created_at : null,
            });
          }
        }
      } catch (e) {
        // não-crítico: mantém apenas as linhas de pings
      }

      const allIds = Array.from(new Set(rows.flatMap((r) => [r.sender_id, r.receiver_id]).filter(isUuid)));
      if (allIds.length > 0) {
        const [byUser, byProfile] = await Promise.all([
          (supabase as any).from("profiles").select("id,user_id").in("user_id", allIds),
          (supabase as any).from("profiles").select("id,user_id").in("id", allIds),
        ]);
        const idMap = new Map<string, string>();
        for (const row of [...(byUser.data || []), ...(byProfile.data || [])] as any[]) {
          if (row?.user_id) {
            idMap.set(row.user_id, row.user_id);
            if (row.id) idMap.set(row.id, row.user_id);
          }
        }
        rows = rows.map((r) => ({
          ...r,
          sender_id: idMap.get(r.sender_id) ?? r.sender_id,
          receiver_id: idMap.get(r.receiver_id) ?? r.receiver_id,
        }));
      }

      const deduped = new Map<string, RadarPing>();
      for (const row of rows) {
        const key = `${row.sender_id}->${row.receiver_id}`;
        const current = deduped.get(key);
        if (!current || new Date(row.created_at).getTime() > new Date(current.created_at).getTime()) {
          deduped.set(key, row);
        }
      }

      return Array.from(deduped.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Lista enriquecida (com perfis) para o histórico — recebidos e enviados.
  const otherIds = useMemo(() => {
    if (!user?.id) return [] as string[];
    const set = new Set<string>();
    for (const p of pings) {
      const otherId = p.sender_id === user.id ? p.receiver_id : p.sender_id;
      if (otherId) set.add(otherId);
    }
    return Array.from(set);
  }, [pings, user?.id]);

  const { data: pingProfiles = {} } = useQuery({
    queryKey: ["radar-pings:profiles", otherIds.sort().join(",")],
    enabled: otherIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id,user_id,username,name,avatar_url")
        .in("user_id", otherIds);
      const map: Record<string, { id: string; user_id: string; name: string | null; username: string | null; avatar_url: string | null }> = {};
      for (const row of (data || []) as any[]) {
        map[row.user_id] = row;
      }
      return map;
    },
  });

  const enrichedPings = useMemo(() => {
    if (!user?.id) return { received: [], sent: [] } as {
      received: Array<RadarPing & { profile: any | null }>;
      sent: Array<RadarPing & { profile: any | null }>;
    };
    const received = pings
      .filter((p) => p.receiver_id === user.id)
      .map((p) => ({ ...p, profile: (pingProfiles as any)[p.sender_id] ?? null }));
    const sent = pings
      .filter((p) => p.sender_id === user.id)
      .map((p) => ({ ...p, profile: (pingProfiles as any)[p.receiver_id] ?? null }));
    return { received, sent };
  }, [pings, pingProfiles, user?.id]);

  // IDs de quem me acenou / quem eu já acenei. Inclui user_id e profiles.id
  // para o Radar, que renderiza bolhas por profiles.id, bater com a tabela pings
  // que usa auth.users.id.
  const pingersSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of enrichedPings.received) {
      if (p.status !== "sent") continue;
      set.add(p.sender_id);
      if (p.profile?.id) set.add(p.profile.id);
    }
    return set;
  }, [enrichedPings.received]);

  const pingedByMeSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of enrichedPings.sent) {
      set.add(p.receiver_id);
      if (p.profile?.id) set.add(p.profile.id);
    }
    return set;
  }, [enrichedPings.sent]);

  // Send ping mutation
  const sendPing = useMutation({
    mutationFn: async (receiverId: string) => {
      if (!user?.id || !profile?.id) throw new Error("Você precisa estar logado para acenar");
      const targetIdentity = await resolveProfileIdentity(receiverId);
      const targetAuthUserId = targetIdentity.userId;
      const targetProfileId = targetIdentity.profileId ?? receiverId;
      if (targetAuthUserId === user.id || targetProfileId === profile.id) throw new Error("Você não pode acenar para si mesmo");

      const rpc = await (supabase as any).rpc("send_radar_ping", { p_target: receiverId });
      if (!rpc.error) return { targetAuthUserId, targetProfileId };
      const rpcMsg = String(rpc.error?.message || "");
      if (/cannot_ping_self/i.test(rpcMsg)) throw new Error("Você não pode acenar para si mesmo");
      if (/target_profile_not_found/i.test(rpcMsg)) throw new Error("Perfil de destino não encontrado");

      const pingProbe = await (supabase as any).from("pings").select("id").limit(1);
      if (pingProbe.error?.code === "PGRST205") {
        const senderName = profile.username ? `@${profile.username}` : "Alguém";
        const title = `👋 ${senderName} te acenou`;
        const bodyText = `${senderName} acenou para você pelo Radar — um aceno silencioso de interesse.`;
        const payload: Record<string, any> = {
          user_id: targetAuthUserId,
          type: "looking_now",
          title,
          body: bodyText,
          message: bodyText,
          data: { sender_id: user.id, sender_profile_id: profile.id, sender_username: profile.username },
        };

        let { error } = await (supabase as any).from("notifications").insert(payload);

        // Fallback defensivo para schemas externos divergentes.
        // Mantém `message` em todas as tentativas porque alguns bancos legados
        // exigem essa coluna como NOT NULL, enquanto outros já usam `body`.
        if (error && (error.code === "PGRST204" || error.code === "PGRST205" || /data|body|message|column/i.test(error.message || ""))) {
          const trimmed: Record<string, any> = { ...payload };
          if (/'data'|"data"|\bdata\b/i.test(error.message || '')) delete trimmed.data;
          if (/'body'|"body"|\bbody\b/i.test(error.message || '')) delete trimmed.body;
          if (/'message'|"message"|\bmessage\b/i.test(error.message || '')) delete trimmed.message;
          let retry = await (supabase as any).from("notifications").insert(trimmed);

          // Segunda passada: se ainda falhar, tenta o formato mais compatível
          // possível para schemas antigos: sem `data` e sem `body`, mas com
          // `message` e demais campos obrigatórios preservados.
          if (retry.error) {
            const { data: _d, body: _b, ...minimal } = payload;
            retry = await (supabase as any).from("notifications").insert(minimal);
          }
          error = retry.error;
        }

        if (error) throw error;
        return { targetAuthUserId, targetProfileId };
      }

      const attempts = [
        { sender_id: profile.id, receiver_id: targetProfileId },
        { sender_id: user.id, receiver_id: targetAuthUserId },
      ].filter((pair, idx, arr) => idx === arr.findIndex((p) => p.sender_id === pair.sender_id && p.receiver_id === pair.receiver_id));

      let lastError: any = null;
      for (const pair of attempts) {
        await (supabase as any)
          .from("pings")
          .delete()
          .eq("sender_id", pair.sender_id)
          .eq("receiver_id", pair.receiver_id)
          .eq("status", "sent");

        const { error } = await (supabase as any)
          .from("pings")
          .insert(pair);

        if (!error || error.code === "23505") return { targetAuthUserId, targetProfileId };
        lastError = error;
      }

      throw lastError;
    },
    onSuccess: async (result, receiverId) => {
      setPingAnimation({ targetId: result?.targetProfileId ?? receiverId, timestamp: Date.now() });
      queryClient.invalidateQueries({ queryKey: ["radar-pings"] });

      // +5 XP por aceno enviado (idempotente por destinatário via ref_key)
      let awarded = false;
      try {
        const targetKey = result?.targetAuthUserId ?? result?.targetProfileId ?? receiverId;
        const { data, error } = await (supabase as any).rpc("aura_award_xp", {
          p_amount: 5,
          p_reason: `aceno_sent:${targetKey}`,
        });
        if (!error) awarded = true;
        // Atualiza UI de XP/ranking em tempo real
        queryClient.invalidateQueries({ queryKey: ["aura-top-ranking"] });
        queryClient.invalidateQueries({ queryKey: ["aura"] });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      } catch { /* não bloqueia o sucesso do aceno */ }

      toast.success(awarded ? "Aceno enviado! 👋 +5 XP" : "Aceno enviado! 👋");
      setTimeout(() => setPingAnimation(null), 1500);
    },
    onError: (err: any) => {
      console.error("[useRadarPings] sendPing error:", err);
      const msg = err?.message || err?.error_description || "Não foi possível enviar o aceno";
      toast.error(msg);
    },
  });

  // Mark pings as seen
  const markSeen = useCallback(
    async (senderId: string) => {
      if (!user?.id) return;
      const senderIdentity = await resolveProfileIdentity(senderId);
      const senderIds = Array.from(new Set([senderId, senderIdentity.userId, senderIdentity.profileId].filter(isUuid)));
      const receiverIds = myIdentifiers.length > 0 ? myIdentifiers : [user.id];
      const pingProbe = await (supabase as any).from("pings").select("id").limit(1);
      if (pingProbe.error?.code === "PGRST205") return;
      await (supabase as any)
        .from("pings")
        .update({ status: "seen", seen_at: new Date().toISOString() })
        .in("sender_id", senderIds)
        .in("receiver_id", receiverIds)
        .eq("status", "sent");
      queryClient.invalidateQueries({ queryKey: ["radar-pings"] });
    },
    [user?.id, myIdentifiers, queryClient]
  );

  // Mark ALL received pings as seen (bulk)
  const markAllSeen = useCallback(async (): Promise<{ updated: number; error?: string }> => {
    if (!user?.id) return { updated: 0, error: "Não autenticado" };
    const unseen = pings.filter((p) => myIdentifierSet.has(p.receiver_id) && p.status === "sent");
    if (unseen.length === 0) return { updated: 0 };

    const realIds = unseen.filter((p) => !p.id.startsWith("notif:")).map((p) => p.id);
    const notifIds = unseen
      .filter((p) => p.id.startsWith("notif:"))
      .map((p) => p.id.slice("notif:".length));

    // Optimistic update local cache imediato
    queryClient.setQueryData(radarPingsQueryKey, (old: any) => {
      if (!Array.isArray(old)) return old;
      const ids = new Set(unseen.map((p) => p.id));
      return old.map((p: any) => ids.has(p.id) ? { ...p, status: "seen", seen_at: new Date().toISOString() } : p);
    });

    if (realIds.length > 0) {
      const pingProbe = await (supabase as any).from("pings").select("id").limit(1);
      if (pingProbe.error?.code !== "PGRST205") {
        const { error } = await (supabase as any)
          .from("pings")
          .update({ status: "seen", seen_at: new Date().toISOString() })
          .in("id", realIds);
        if (error) {
          queryClient.invalidateQueries({ queryKey: ["radar-pings"] });
          return { updated: 0, error: error.message };
        }
      }
    }

    if (notifIds.length > 0) {
      // marca notificação como lida (best-effort)
      try {
        await (supabase as any)
          .from("notifications")
          .update({ is_read: true })
          .in("id", notifIds);
      } catch { /* noop */ }
    }

    queryClient.invalidateQueries({ queryKey: ["radar-pings"] });
    return { updated: unseen.length };
  }, [user?.id, pings, myIdentifierSet, radarPingsQueryKey, queryClient]);


  useEffect(() => {
    if (!user?.id) return;

    let unsubPings: (() => void) | null = null;
    let unsubNotifs: (() => void) | null = null;
    let cancelled = false;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["radar-pings"] });
    };

    (async () => {
      const pingProbe = await (supabase as any).from("pings").select("id").limit(1);
      if (cancelled) return;

      if (pingProbe.error?.code !== "PGRST205") {
        unsubPings = subscribeTable("pings", (payload: any) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          const involvesMe = myIdentifierSet.has(row.receiver_id) || myIdentifierSet.has(row.sender_id);
          if (!involvesMe) return;
          invalidate();
          if (payload.eventType === "INSERT" && myIdentifierSet.has(row.receiver_id) && !myIdentifierSet.has(row.sender_id)) {
            toast("Alguém acenou para você! 👋", { icon: "👋" });
          }
        });
      }

      // Realtime fallback: notificações looking_now também viram acenos
      unsubNotifs = subscribeTable("notifications", (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row || !myIdentifierSet.has(row.user_id)) return;
        if (row.type !== "looking_now") return;
        invalidate();
        if (payload.eventType === "INSERT") {
          toast("Alguém acenou para você! 👋", { icon: "👋" });
        }
      });
    })();

    return () => {
      cancelled = true;
      if (unsubPings) unsubPings();
      if (unsubNotifs) unsubNotifs();
    };
  }, [user?.id, myIdentifierSet, queryClient]);


  return {
    pings,
    pingersSet,
    pingedByMeSet,
    sendPing,
    markSeen,
    markAllSeen,
    pingAnimation,
    isPingSending: sendPing.isPending,
    enrichedPings,
  };
}
