import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { notifyProfileTestimonial } from "@/lib/profileSocialNotify";

export interface TestimonialAuthor {
  id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

export interface ProfileTestimonial {
  id: string;
  author_profile_id: string;
  target_profile_id: string;
  content: string;
  reply: string | null;
  hearts: number;
  created_at: string;
  updated_at: string;
  author?: TestimonialAuthor | null;
  hearted_by_me?: boolean;
}

export function useProfileTestimonials(targetProfileId?: string | null) {
  const { profile } = useProfile();
  const qc = useQueryClient();
  const myProfileId = profile?.id ?? null;
  const key = ["profile-testimonials", targetProfileId, myProfileId] as const;

  const query = useQuery<ProfileTestimonial[]>({
    queryKey: key,
    enabled: !!targetProfileId,
    staleTime: 10_000,
    queryFn: async () => {
      if (!targetProfileId) return [];
      const { data, error } = await (supabase as any)
        .from("oculto_profile_testimonials")
        .select("*")
        .eq("target_profile_id", targetProfileId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        if ((error as any).code === "PGRST205" || (error as any).code === "42P01") return [];
        throw error;
      }
      const rows = (data || []) as ProfileTestimonial[];
      if (rows.length === 0) return [];

      // Authors em batch
      const authorIds = Array.from(new Set(rows.map((r) => r.author_profile_id)));
      const { data: authors } = await supabase
        .from("profiles")
        .select("id, username, name, avatar_url")
        .in("id", authorIds);
      const aMap = new Map((authors || []).map((a: any) => [a.id, a]));

      // Hearts meus
      let myHearts = new Set<string>();
      if (myProfileId) {
        const { data: hs } = await (supabase as any)
          .from("oculto_testimonial_hearts")
          .select("testimonial_id")
          .eq("profile_id", myProfileId)
          .in(
            "testimonial_id",
            rows.map((r) => r.id),
          );
        myHearts = new Set(((hs as any[]) || []).map((h) => h.testimonial_id));
      }
      return rows.map((r) => ({
        ...r,
        author: (aMap.get(r.author_profile_id) as any) || null,
        hearted_by_me: myHearts.has(r.id),
      }));
    },
  });

  // Realtime — atualiza ao inserir/atualizar/excluir depoimento ou coração
  useEffect(() => {
    if (!targetProfileId) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: key });
    const unsubs = [
      subscribeTable("oculto_profile_testimonials", (payload: any) => {
        const row = payload?.new ?? payload?.old;
        if (row?.target_profile_id !== targetProfileId) return;
        invalidate();
      }),
      subscribeTable("oculto_testimonial_hearts", invalidate),
    ];
    return () => { unsubs.forEach((u) => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetProfileId, myProfileId]);

  const create = useMutation({
    mutationFn: async (content: string) => {
      if (!myProfileId) throw new Error("Faça login para deixar um depoimento.");
      if (!targetProfileId) throw new Error("Perfil inválido.");
      if (myProfileId === targetProfileId) throw new Error("Você não pode deixar depoimento no próprio perfil.");
      const text = content.trim();
      if (!text) throw new Error("Escreva um depoimento.");
      if (text.length > 250) throw new Error("Máximo de 250 caracteres.");
      const { error } = await (supabase as any).from("oculto_profile_testimonials").insert({
        author_profile_id: myProfileId,
        target_profile_id: targetProfileId,
        content: text,
      });
      if (error) throw error;
      void notifyProfileTestimonial({
        actorProfileId: myProfileId,
        targetProfileId,
        preview: text,
        url: `${window.location.origin}/creator/${targetProfileId}`,
      });
    },
    onSuccess: () => {
      toast.success("Depoimento enviado!");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao enviar depoimento"),
  });

  const reply = useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const text = reply.trim();
      if (!text) throw new Error("Escreva uma resposta.");
      if (text.length > 500) throw new Error("Máximo de 500 caracteres.");
      const { error } = await (supabase as any)
        .from("oculto_profile_testimonials")
        .update({ reply: text })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resposta publicada!");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao responder"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("oculto_profile_testimonials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Depoimento removido.");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao remover"),
  });

  const toggleHeart = useMutation({
    mutationFn: async ({ id, hearted }: { id: string; hearted: boolean }) => {
      if (!myProfileId) throw new Error("Faça login para reagir.");
      if (hearted) {
        const { error } = await (supabase as any)
          .from("oculto_testimonial_hearts")
          .delete()
          .eq("testimonial_id", id)
          .eq("profile_id", myProfileId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("oculto_testimonial_hearts")
          .insert({ testimonial_id: id, profile_id: myProfileId });
        if (error && (error as any).code !== "23505") throw error;
      }
    },
    onMutate: async ({ id, hearted }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ProfileTestimonial[]>(key);
      if (prev) {
        qc.setQueryData<ProfileTestimonial[]>(
          key,
          prev.map((t) =>
            t.id === id
              ? { ...t, hearted_by_me: !hearted, hearts: Math.max(0, t.hearts + (hearted ? -1 : 1)) }
              : t,
          ),
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("Não foi possível atualizar o coração.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { ...query, create, reply, remove, toggleHeart, myProfileId };
}
