/**
 * useHasAnyPost — verifica se o usuário logado já publicou pelo menos
 * 1 post no feed (qualquer status, qualquer visibilidade). Usado para
 * decidir se mostramos o card "Faça sua primeira publicação" no topo
 * do carrossel Descubra o Universo Oculto.
 *
 * Estratégia resiliente: tenta creator_id (auth.users.id), depois
 * author_id (profile.id). Cache 60s. Não falha — em erro assume true
 * para não incomodar usuários antigos.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export function useHasAnyPost() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const profileId = profile?.id;
  return useQuery({
    queryKey: ["has-any-post", user?.id, profileId],
    enabled: !!user?.id || !!profileId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      const candidates: Array<{ col: string; val: string }> = [];
      if (user?.id) candidates.push({ col: "creator_id", val: user.id });
      if (profileId) candidates.push({ col: "author_id", val: profileId });
      if (user?.id) candidates.push({ col: "user_id", val: user.id });
      for (const c of candidates) {
        try {
          const { count, error } = await (supabase as any)
            .from("posts")
            .select("id", { count: "exact", head: true })
            .eq(c.col, c.val)
            .limit(1);
          if (error) continue;
          if ((count ?? 0) > 0) return true;
        } catch {
          /* tenta próximo */
        }
      }
      return false;
    },
  });
}
