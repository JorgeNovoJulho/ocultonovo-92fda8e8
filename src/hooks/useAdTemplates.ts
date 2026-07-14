import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";

export interface AdTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  thumb_url: string | null;
  payload: Record<string, any>;
  owner_id: string | null;
  is_public: boolean;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export const AD_TEMPLATE_CATEGORIES = [
  { value: "all", label: "Todos" },
  { value: "promocao", label: "Promoções" },
  { value: "lancamento", label: "Lançamentos" },
  { value: "evento", label: "Eventos" },
  { value: "produto", label: "Produtos" },
  { value: "servico", label: "Serviços" },
] as const;

/** Lista templates públicos + do próprio usuário. Resiliente a tabela inexistente. */
export function useAdTemplates(category?: string, search?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ad-templates", category ?? "all", search ?? ""],
    staleTime: 60_000,
    queryFn: async () => {
      try {
        let q = (supabase as any)
          .from("oculto_ad_templates")
          .select("*")
          .eq("is_active", true)
          .order("usage_count", { ascending: false });
        if (category && category !== "all") q = q.eq("category", category);
        if (search && search.trim()) q = q.ilike("name", `%${search.trim()}%`);
        const { data, error } = await q.limit(60);
        if (error) {
          console.warn("[useAdTemplates] tabela ausente?", error.message);
          return [] as AdTemplate[];
        }
        return (data || []) as AdTemplate[];
      } catch (err) {
        console.warn("[useAdTemplates] fallback vazio", err);
        return [] as AdTemplate[];
      }
    },
  });
}

/** Salva um template personalizado do criador (privado por padrão). */
export function useSaveAdTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Pick<AdTemplate, "name" | "category" | "description" | "thumb_url" | "payload"> & {
        is_public?: boolean;
      },
    ) => {
      if (!user?.id) throw new Error("Faça login para salvar templates.");
      const { data, error } = await (supabase as any)
        .from("oculto_ad_templates")
        .insert({
          name: input.name,
          category: input.category,
          description: input.description ?? null,
          thumb_url: input.thumb_url ?? null,
          payload: input.payload ?? {},
          owner_id: user.id,
          is_public: input.is_public ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as AdTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ad-templates"] }),
  });
}
