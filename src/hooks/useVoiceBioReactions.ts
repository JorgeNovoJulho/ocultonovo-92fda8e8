/**
 * useVoiceBioReactions — gerencia likes/dislikes da bio de áudio.
 * - reagir (toggle: clicar de novo no mesmo botão remove; clicar no outro troca)
 * - resumo (likes, dislikes, reação atual do viewer)
 * - lista de quem reagiu (apenas o dono enxerga via RPC SECURITY DEFINER)
 *
 * Backend: tabela oculto_voice_bio_reactions + RPCs:
 *   voice_bio_react(p_owner uuid, p_reaction text)
 *   voice_bio_reactions_summary(p_owner uuid)
 *   voice_bio_reactions_list(p_owner uuid, p_reaction text)
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "./useAuth";

export type Reaction = "like" | "dislike" | null;

export interface VoiceBioSummary {
  likes: number;
  dislikes: number;
  my_reaction: Reaction;
}

export interface VoiceBioReactor {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  reaction: "like" | "dislike";
  reacted_at: string;
}

export function useVoiceBioReactions(ownerId?: string | null) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<VoiceBioSummary>({ likes: 0, dislikes: 0, my_reaction: null });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("voice_bio_reactions_summary", { p_owner: ownerId });
      if (!error && data) {
        setSummary({
          likes: Number(data.likes || 0),
          dislikes: Number(data.dislikes || 0),
          my_reaction: (data.my_reaction as Reaction) ?? null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: atualiza contadores ao receber qualquer mudança
  useEffect(() => {
    if (!ownerId) return;
    const unsub = subscribeTable(
      "oculto_voice_bio_reactions",
      (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row || row.owner_id !== ownerId) return;
        load();
      },
    );
    return () => { try { unsub(); } catch { /* noop */ } };
  }, [ownerId, load]);

  const react = useCallback(async (next: "like" | "dislike") => {
    if (!user || !ownerId || busy) return;
    if (user.id === ownerId) return; // não reagir à própria bio
    setBusy(true);
    // Otimista
    const prev = summary;
    setSummary((s) => {
      const removing = s.my_reaction === next;
      const switching = s.my_reaction && s.my_reaction !== next;
      let likes = s.likes;
      let dislikes = s.dislikes;
      if (removing) {
        if (next === "like") likes = Math.max(0, likes - 1);
        else dislikes = Math.max(0, dislikes - 1);
        return { likes, dislikes, my_reaction: null };
      }
      if (switching) {
        if (s.my_reaction === "like") likes = Math.max(0, likes - 1);
        if (s.my_reaction === "dislike") dislikes = Math.max(0, dislikes - 1);
      }
      if (next === "like") likes += 1; else dislikes += 1;
      return { likes, dislikes, my_reaction: next };
    });
    try {
      await (supabase as any).rpc("voice_bio_react", { p_owner: ownerId, p_reaction: next });
      load();
    } catch {
      setSummary(prev);
    } finally {
      setBusy(false);
    }
  }, [user, ownerId, busy, summary, load]);

  return { ...summary, loading, busy, react, reload: load };
}

/** Lista de quem deu like/deslike (apenas dono — protegido no RPC). */
export async function fetchVoiceBioReactors(ownerId: string, reaction: "like" | "dislike"): Promise<VoiceBioReactor[]> {
  const { data, error } = await (supabase as any).rpc("voice_bio_reactions_list", {
    p_owner: ownerId,
    p_reaction: reaction,
  });
  if (error || !Array.isArray(data)) return [];
  return data as VoiceBioReactor[];
}
