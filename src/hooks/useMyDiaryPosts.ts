import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { getResolvedOwnerIds } from "@/lib/postAuthorResolver";

const NARRATIVE_SECTIONS = ["story", "chapter", "diary", "article", "series", "text_post"] as const;
const OWNER_COLUMNS = ["author_id", "creator_id", "user_id"] as const;

/**
 * Lista posts narrativos (Diário VIP, Histórias, Capítulos, Séries, Textos) do
 * próprio criador logado. Usado na aba "Diário VIP" do perfil pessoal.
 *
 * Estratégia resiliente:
 *  - resolve todos os ids de dono (profile, auth, legados);
 *  - tenta cada coluna de dono separadamente (algumas bases podem não ter user_id);
 *  - filtra por content_format='narrative' OU section_type em lista narrativa;
 *  - faz merge/dedup por id e ordena por created_at desc.
 */
export function useMyDiaryPosts(profileId: string | undefined, limit = 60) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-diary-posts", profileId, limit],
    enabled: !!profileId,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!profileId) return [] as any[];
      const ownerIds = await getResolvedOwnerIds(profileId, user?.id);
      if (!ownerIds.length) return [] as any[];

      const narrativeOr = [
        "content_format.eq.narrative",
        ...NARRATIVE_SECTIONS.map((s) => `section_type.eq.${s}`),
      ].join(",");

      const merged = new Map<string, any>();

      for (const col of OWNER_COLUMNS) {
        try {
          const { data, error } = await (supabase as any)
            .from("posts")
            .select("*")
            .in(col, ownerIds)
            .or(narrativeOr)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (error) {
            // Coluna pode não existir nesta base — segue para a próxima
            console.warn(`[useMyDiaryPosts] coluna ${col} falhou:`, error.message);
            continue;
          }
          for (const row of (data || [])) {
            if (row?.id && !merged.has(row.id)) merged.set(row.id, row);
          }
        } catch (err) {
          console.warn(`[useMyDiaryPosts] erro na coluna ${col}`, err);
        }
      }

      const list = Array.from(merged.values())
        .filter((p) => p?.is_hidden !== true)
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, limit);

      return list;
    },
  });
}
