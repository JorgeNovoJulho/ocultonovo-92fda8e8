import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

// Types
export interface MarketplaceAdminStats {
  total_items: number;
  total_sales: number;
  total_revenue: number;
  pending_items: number;
  total_creators: number;
  avg_item_price: number;
  items_this_month: number;
  sales_this_month: number;
  revenue_this_month: number;
  top_categories: Array<{ category: string; count: number; total_sales: number }>;
}

export interface MarketplaceItemAdmin {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  item_type: string;
  status: string;
  media_url: string;
  preview_url: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string;
  sales_count: number;
  view_count: number;
  created_at: string;
  is_featured: boolean;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MarketplaceSetting {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  description: string;
  updated_at: string;
}

// Hook para estatísticas admin do marketplace
export function useMarketplaceAdminStats() {
  return useQuery({
    queryKey: ["marketplace-admin-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketplace_admin_stats");
      if (error) throw error;
      return data as unknown as MarketplaceAdminStats;
    },
  });
}

// Hook para listar itens do marketplace (admin)
export function useMarketplaceItemsAdmin(filters: {
  status?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["marketplace-items-admin", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketplace_items_admin", {
        p_status: filters.status || null,
        p_category: filters.category || null,
        p_search: filters.search || null,
        p_limit: filters.limit || 50,
        p_offset: filters.offset || 0,
      });
      if (error) throw error;
      return data as MarketplaceItemAdmin[];
    },
  });
}

// Hook para categorias
export function useMarketplaceCategories() {
  return useQuery({
    queryKey: ["marketplace-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as MarketplaceCategory[];
    },
  });
}

// Hook para configurações
export function useMarketplaceSettings() {
  return useQuery({
    queryKey: ["marketplace-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplace_settings")
        .select("*");
      if (error) throw error;
      return data as MarketplaceSetting[];
    },
  });
}

// Mutations
export function useUpdateItemStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const { error } = await supabase
        .from("marketplace_items")
        .update({ is_active: status === "active" } as Record<string, unknown>)
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-items-admin"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-admin-stats"] });
      toast({ title: "Status atualizado com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar status", description: String(error), variant: "destructive" });
    },
  });
}

export function useToggleFeatured() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ itemId, featured }: { itemId: string; featured: boolean }) => {
      if (featured) {
        // Adicionar aos destaques
        const { error } = await supabase
          .from("marketplace_featured")
          .insert({ item_id: itemId, is_active: true });
        if (error) throw error;
      } else {
        // Remover dos destaques
        const { error } = await supabase
          .from("marketplace_featured")
          .delete()
          .eq("item_id", itemId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-items-admin"] });
      toast({ title: "Destaque atualizado" });
    },
    onError: (error) => {
      toast({ title: "Erro ao atualizar destaque", description: String(error), variant: "destructive" });
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (category: Omit<MarketplaceCategory, "id" | "created_at">) => {
      const { error } = await supabase
        .from("marketplace_categories")
        .insert(category);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-categories"] });
      toast({ title: "Categoria criada com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao criar categoria", description: String(error), variant: "destructive" });
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("marketplace_settings")
        .update({ setting_value: value as unknown as Record<string, never>, updated_at: new Date().toISOString() })
        .eq("setting_key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-settings"] });
      toast({ title: "Configuração salva" });
    },
    onError: (error) => {
      toast({ title: "Erro ao salvar", description: String(error), variant: "destructive" });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from("marketplace_items")
        .delete()
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketplace-items-admin"] });
      queryClient.invalidateQueries({ queryKey: ["marketplace-admin-stats"] });
      toast({ title: "Item removido com sucesso" });
    },
    onError: (error) => {
      toast({ title: "Erro ao remover item", description: String(error), variant: "destructive" });
    },
  });
}
