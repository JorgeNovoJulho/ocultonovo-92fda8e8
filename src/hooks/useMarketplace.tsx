import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useToast } from "@/hooks/use-toast";

export interface MarketplaceItem {
  id: string;
  creator_id: string;
  title: string;
  description?: string;
  price: number;
  original_price?: number;
  item_type: 'single' | 'bundle' | 'presale';
  content_type: 'image' | 'video' | 'audio' | 'document' | 'mixed';
  media_urls: string[];
  preview_url?: string;
  thumbnail_url?: string;
  is_active: boolean;
  is_featured: boolean;
  stock_limit?: number;
  sold_count: number;
  tags: string[];
  release_date?: string;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    name: string;
    username?: string;
    avatar_url?: string;
  };
}

export interface MarketplacePurchase {
  id: string;
  buyer_id: string;
  item_id: string;
  price_paid: number;
  payment_method: 'balance' | 'pix' | 'card';
  status: 'pending' | 'completed' | 'refunded' | 'cancelled';
  downloaded: boolean;
  download_count: number;
  created_at: string;
  item?: MarketplaceItem;
}

export interface WishlistItem {
  id: string;
  user_id: string;
  item_id: string;
  notify_on_sale: boolean;
  created_at: string;
  item?: MarketplaceItem;
}

// Buscar itens do marketplace
export function useMarketplaceItems(filters?: {
  creatorId?: string;
  itemType?: string;
  contentType?: string;
  featured?: boolean;
  search?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['marketplace-items', filters],
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<MarketplaceItem[]> => {
      // Decoupled (sem JOIN — evita PGRST200 no DB externo)
      let query = supabase
        .from('marketplace_items')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (filters?.creatorId) query = query.eq('creator_id', filters.creatorId);
      if (filters?.itemType) query = query.eq('item_type', filters.itemType);
      if (filters?.contentType) query = query.eq('content_type', filters.contentType);
      if (filters?.featured) query = query.eq('is_featured', true);
      if (filters?.search) query = query.ilike('title', `%${filters.search}%`);
      if (filters?.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) throw error;
      const items = (data || []) as any[];
      if (items.length === 0) return [];

      const creatorIds = [...new Set(items.map(i => i.creator_id).filter(Boolean))];
      const { data: creators } = await (supabase as any)
        .from('v_public_profiles')
        .select('id, name, username, avatar_url')
        .in('id', creatorIds);

      const map = new Map<string, any>();
      (creators || []).forEach((c: any) => map.set(c.id, c));

      return items.map(item => ({ ...item, creator: map.get(item.creator_id) || null })) as MarketplaceItem[];
    },
  });
}

// Buscar item específico
export function useMarketplaceItem(itemId: string | null) {
  return useQuery({
    queryKey: ['marketplace-item', itemId],
    staleTime: 60_000,
    queryFn: async (): Promise<MarketplaceItem | null> => {
      if (!itemId) return null;

      const { data, error } = await supabase
        .from('marketplace_items')
        .select('*')
        .eq('id', itemId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      let creator: any = null;
      if (data.creator_id) {
        const { data: c } = await (supabase as any)
          .from('v_public_profiles')
          .select('id, name, username, avatar_url')
          .eq('id', data.creator_id)
          .maybeSingle();
        creator = c || null;
      }

      return { ...data, creator } as MarketplaceItem;
    },
    enabled: !!itemId,
  });
}

// Buscar itens do criador (para gestão)
export function useCreatorItems(creatorProfileId: string | null) {
  return useQuery({
    queryKey: ['creator-marketplace-items', creatorProfileId],
    queryFn: async (): Promise<MarketplaceItem[]> => {
      if (!creatorProfileId) return [];

      const { data, error } = await supabase
        .from('marketplace_items')
        .select('*')
        .eq('creator_id', creatorProfileId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MarketplaceItem[];
    },
    enabled: !!creatorProfileId,
  });
}

// Criar item no marketplace
export function useCreateMarketplaceItem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: Omit<MarketplaceItem, 'id' | 'created_at' | 'updated_at' | 'sold_count' | 'creator'>) => {
      const { data, error } = await supabase
        .from('marketplace_items')
        .insert(item)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
      queryClient.invalidateQueries({ queryKey: ['creator-marketplace-items'] });
      toast({
        title: "Item criado",
        description: "O item foi adicionado ao marketplace.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar item",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Atualizar item
export function useUpdateMarketplaceItem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<MarketplaceItem> }) => {
      const { data, error } = await supabase
        .from('marketplace_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
      queryClient.invalidateQueries({ queryKey: ['creator-marketplace-items'] });
      queryClient.invalidateQueries({ queryKey: ['marketplace-item'] });
      toast({
        title: "Item atualizado",
        description: "As alterações foram salvas.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Deletar item
export function useDeleteMarketplaceItem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('marketplace_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-items'] });
      queryClient.invalidateQueries({ queryKey: ['creator-marketplace-items'] });
      toast({
        title: "Item removido",
        description: "O item foi excluído do marketplace.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Comprar item
export function usePurchaseItem() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, paymentMethod = 'balance' }: { itemId: string; paymentMethod?: string }) => {
      const { data, error } = await supabase.rpc('purchase_marketplace_item', {
        p_item_id: itemId,
        p_payment_method: paymentMethod,
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; purchase_id?: string };
      if (!result.success) {
        throw new Error(result.error || 'Erro ao processar compra');
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['user-balance'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast({
        title: "✅ Compra realizada!",
        description: "O conteúdo já está disponível na sua biblioteca.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro na compra",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Buscar compras do usuário
export function useMyPurchases() {
  return useQuery({
    queryKey: ['marketplace-purchases'],
    queryFn: async (): Promise<MarketplacePurchase[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('marketplace_purchases')
        .select('*')
        .eq('buyer_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const purchases = (data || []) as any[];
      if (purchases.length === 0) return [];

      const itemIds = [...new Set(purchases.map(p => p.item_id).filter(Boolean))];
      const { data: items } = await supabase
        .from('marketplace_items')
        .select('*')
        .in('id', itemIds);

      const map = new Map<string, any>();
      (items || []).forEach((i: any) => map.set(i.id, i));

      return purchases.map(p => ({ ...p, item: map.get(p.item_id) || null })) as MarketplacePurchase[];
    },
  });
}

// Verificar se já comprou
export function useHasPurchased(itemId: string | null) {
  return useQuery({
    queryKey: ['has-purchased', itemId],
    queryFn: async (): Promise<boolean> => {
      if (!itemId) return false;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return false;

      const { count } = await supabase
        .from('marketplace_purchases')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', profile.id)
        .eq('item_id', itemId)
        .eq('status', 'completed');

      return (count || 0) > 0;
    },
    enabled: !!itemId,
  });
}

// Wishlist
export function useWishlist() {
  return useQuery({
    queryKey: ['wishlist'],
    queryFn: async (): Promise<WishlistItem[]> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from('wishlist')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [];

      const itemIds = [...new Set(rows.map(w => w.item_id).filter(Boolean))];
      const { data: items } = await supabase
        .from('marketplace_items')
        .select('*')
        .in('id', itemIds);

      const itemArr = (items || []) as any[];
      const creatorIds = [...new Set(itemArr.map(i => i.creator_id).filter(Boolean))];
      const { data: creators } = await supabase
        .from('profiles')
        .select('id, name, username, avatar_url')
        .in('id', creatorIds);

      const creatorMap = new Map<string, any>();
      (creators || []).forEach((c: any) => creatorMap.set(c.id, c));
      const itemMap = new Map<string, any>();
      itemArr.forEach((i: any) => itemMap.set(i.id, { ...i, creator: creatorMap.get(i.creator_id) || null }));

      return rows.map(w => ({ ...w, item: itemMap.get(w.item_id) || null })) as WishlistItem[];
    },
  });
}

export function useAddToWishlist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('wishlist')
        .insert({ user_id: profile.id, item_id: itemId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast({
        title: "Adicionado à wishlist",
        description: "Você será notificado sobre promoções.",
      });
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast({
          title: "Já na wishlist",
          description: "Este item já está na sua lista de desejos.",
        });
      } else {
        toast({
          title: "Erro",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });
}

export function useRemoveFromWishlist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('wishlist')
        .delete()
        .eq('user_id', profile.id)
        .eq('item_id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast({
        title: "Removido da wishlist",
      });
    },
  });
}

// Verificar se está na wishlist
export function useIsInWishlist(itemId: string | null) {
  return useQuery({
    queryKey: ['in-wishlist', itemId],
    queryFn: async (): Promise<boolean> => {
      if (!itemId) return false;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return false;

      const { count } = await supabase
        .from('wishlist')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('item_id', itemId);

      return (count || 0) > 0;
    },
    enabled: !!itemId,
  });
}

// Estatísticas de vendas (para criadores)
export function useCreatorSalesStats(creatorProfileId: string | null) {
  return useQuery({
    queryKey: ['creator-sales-stats', creatorProfileId],
    queryFn: async () => {
      if (!creatorProfileId) return null;

      // Total de itens
      const { count: totalItems } = await supabase
        .from('marketplace_items')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creatorProfileId);

      // Total de vendas (batch decoupling: items first, then purchases)
      const { data: itemsForRevenue } = await supabase
        .from('marketplace_items')
        .select('id')
        .eq('creator_id', creatorProfileId);

      const itemIds = (itemsForRevenue || []).map((i: any) => i.id);
      const { data: salesData } = itemIds.length
        ? await supabase
            .from('marketplace_purchases')
            .select('price_paid')
            .eq('status', 'completed')
            .in('item_id', itemIds)
        : { data: [] as any[] };

      const totalSales = salesData?.length || 0;
      const totalRevenue = (salesData || []).reduce((sum: number, s: any) => sum + (Number(s.price_paid) || 0), 0);

      return {
        totalItems: totalItems || 0,
        totalSales,
        totalRevenue,
      };
    },
    enabled: !!creatorProfileId,
  });
}
