import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { useEffect } from "react";

export interface Auction {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  media_url: string;
  media_type: string;
  starting_price: number;
  min_increment: number;
  current_bid: number;
  current_bidder_id: string | null;
  starts_at: string;
  ends_at: string;
  original_end_at: string;
  status: string;
  winner_id: string | null;
  winner_charged: boolean;
  content_delivered: boolean;
  total_bids: number;
  created_at: string;
  updated_at: string;
  creator?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
  current_bidder?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

export interface AuctionBid {
  id: string;
  auction_id: string;
  bidder_id: string;
  amount: number;
  is_winning: boolean;
  outbid_at: string | null;
  created_at: string;
  bidder?: {
    id: string;
    name: string;
    username: string | null;
    avatar_url: string | null;
  };
}

export interface BidderCard {
  id: string;
  user_id: string;
  card_last_four: string | null;
  card_brand: string | null;
  is_valid: boolean;
  verified_at: string;
}

// Fetch active auctions (decoupled — sem JOIN p/ evitar PGRST200 no DB externo)
export function useActiveAuctions() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["auctions", "active"],
    // Leilão muda rápido (lances, encerramento com anti-sniping): 10 min de
    // cache sem revalidar ao abrir a tela mostrava lances e prazos velhos.
    staleTime: 30_000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,

    queryFn: async () => {
      const { data, error } = await supabase
        .from("auctions")
        .select("*")
        .eq("status", "active")
        .gt("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true });

      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [] as Auction[];

      const profileIds = [
        ...new Set([
          ...rows.map(r => r.creator_id),
          ...rows.map(r => r.current_bidder_id),
        ].filter(Boolean)),
      ];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url")
        .in("id", profileIds);

      const map = new Map<string, any>();
      (profiles || []).forEach((p: any) => map.set(p.id, p));

      return rows.map(r => ({
        ...r,
        creator: map.get(r.creator_id) || null,
        current_bidder: r.current_bidder_id ? map.get(r.current_bidder_id) || null : null,
      })) as Auction[];
    },
  });

  // Real-time — canal único por instância evita colisões entre múltiplas montagens
  useEffect(() => {
    const unsub = subscribeTable('auctions', () => {
      queryClient.invalidateQueries({ queryKey: ["auctions"] });
    });
    return () => { unsub(); };
  }, [queryClient]);


  return query;
}

// Fetch single auction with bids
export function useAuction(auctionId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["auction", auctionId],
    queryFn: async () => {
      if (!auctionId) return null;

      const { data, error } = await supabase.functions.invoke("auction-gateway", {
        body: { action: "get-auction", auction_id: auctionId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return {
        auction: data.auction as Auction,
        bids: data.bids as AuctionBid[],
      };
    },
    enabled: !!auctionId,
    // Realtime cobre updates; polling serve só como fallback (canal caiu)
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  // Real-time subscription for this specific auction
  useEffect(() => {
    if (!auctionId) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["auction", auctionId] });

    const unsubA = subscribeTable('auctions', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.id !== auctionId) return;
      invalidate();
    });
    const unsubB = subscribeTable('auction_bids', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      if (payload?.new?.auction_id !== auctionId) return;
      invalidate();
    });

    return () => { unsubA(); unsubB(); };
  }, [auctionId, queryClient]);


  return query;
}

// Check if user has a verified card
export function useBidderCard() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bidder-card", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Get profile ID first
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return null;

      const { data, error } = await supabase
        .from("bidder_cards")
        .select("*")
        .eq("user_id", profile.id)
        .eq("is_valid", true)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as BidderCard | null;
    },
    enabled: !!user?.id,
  });
}

// Create auction
export function useCreateAuction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      media_url: string;
      media_type?: string;
      starting_price: number;
      min_increment: number;
      duration_hours: number;
    }) => {
      // Get profile ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user?.id)
        .single();

      if (!profile) throw new Error("Perfil não encontrado");

      const endsAt = new Date();
      endsAt.setHours(endsAt.getHours() + data.duration_hours);

      const { data: auction, error } = await supabase
        .from("auctions")
        .insert({
          creator_id: profile.id,
          title: data.title,
          description: data.description,
          media_url: data.media_url,
          media_type: data.media_type || "image",
          starting_price: data.starting_price,
          min_increment: data.min_increment,
          ends_at: endsAt.toISOString(),
          original_end_at: endsAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return auction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auctions"] });
      toast.success("Leilão criado com sucesso!");
    },
    onError: (error) => {
      toast.error(`Erro ao criar leilão: ${error.message}`);
    },
  });
}

// Place bid
export function usePlaceBid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ auctionId, amount }: { auctionId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("auction-gateway", {
        body: {
          action: "place-bid",
          auction_id: auctionId,
          amount,
        },
      });

      if (error) throw error;
      if (!data.success) {
        if (data.requires_card) {
          throw new Error("REQUIRES_CARD");
        }
        throw new Error(data.error);
      }
      
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["auction", variables.auctionId] });
      queryClient.invalidateQueries({ queryKey: ["auctions"] });
      
      if (data.time_extended) {
        toast.success("Lance aceito! ⏱️ +2 minutos adicionados!");
      } else {
        toast.success("Lance aceito com sucesso!");
      }
    },
    onError: (error) => {
      if (error.message === "REQUIRES_CARD") {
        toast.error("Cadastre um cartão válido antes de dar lances");
      } else {
        toast.error(`Erro ao dar lance: ${error.message}`);
      }
    },
  });
}

// Verify card
export function useVerifyCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cardData: {
      card_number: string;
      card_exp_month: string;
      card_exp_year: string;
      card_cvc: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("auction-gateway", {
        body: {
          action: "verify-card",
          ...cardData,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["bidder-card"] });
      toast.success(`Cartão verificado: •••• ${data.card_last_four}`);
    },
    onError: (error) => {
      toast.error(`Erro ao verificar cartão: ${error.message}`);
    },
  });
}

// Fetch user's auctions (creator)
export function useMyAuctions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-auctions", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get profile ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from("auctions")
        .select("*")
        .eq("creator_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data || []) as any[];
      if (rows.length === 0) return [] as Auction[];

      const bidderIds = [...new Set(rows.map(r => r.current_bidder_id).filter(Boolean))];
      let bidderMap = new Map<string, any>();
      if (bidderIds.length > 0) {
        const { data: bidders } = await supabase
          .from("profiles")
          .select("id, name, username, avatar_url")
          .in("id", bidderIds);
        (bidders || []).forEach((b: any) => bidderMap.set(b.id, b));
      }

      return rows.map(r => ({
        ...r,
        current_bidder: r.current_bidder_id ? bidderMap.get(r.current_bidder_id) || null : null,
      })) as Auction[];
    },
    enabled: !!user?.id,
  });
}

// Fetch user's bid history
export function useMyBids() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-bids", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get profile ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return [];

      const { data, error } = await supabase
        .from("auction_bids")
        .select("*")
        .eq("bidder_id", profile.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const bids = (data || []) as any[];
      if (bids.length === 0) return [];

      const auctionIds = [...new Set(bids.map(b => b.auction_id).filter(Boolean))];
      const { data: auctions } = await supabase
        .from("auctions")
        .select("id, title, media_url, current_bid, ends_at, status, creator_id")
        .in("id", auctionIds);

      const aArr = (auctions || []) as any[];
      const creatorIds = [...new Set(aArr.map(a => a.creator_id).filter(Boolean))];
      const { data: creators } = await supabase
        .from("profiles")
        .select("id, name, username, avatar_url")
        .in("id", creatorIds);

      const cMap = new Map<string, any>();
      (creators || []).forEach((c: any) => cMap.set(c.id, c));
      const aMap = new Map<string, any>();
      aArr.forEach((a: any) => aMap.set(a.id, { ...a, creator: cMap.get(a.creator_id) || null }));

      return bids.map(b => ({ ...b, auction: aMap.get(b.auction_id) || null }));
    },
    enabled: !!user?.id,
  });
}