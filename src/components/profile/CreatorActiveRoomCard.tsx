import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CreatorActiveRoomCardProps {
  userId?: string | null;
}

interface ActiveRoom {
  slug: string;
  name: string;
  emoji?: string | null;
  theme?: string | null;
  last_ping?: string | null;
}

/**
 * Mostra a sala do Aura Match em que o usuário está ativo agora.
 * Considera "ativo" presença com last_ping nos últimos 3 minutos.
 */
export function CreatorActiveRoomCard({ userId }: CreatorActiveRoomCardProps) {
  const navigate = useNavigate();

  const { data: room } = useQuery({
    queryKey: ["creator-active-aura-room", userId],
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ActiveRoom | null> => {
      // Tenta RPC dedicada; fallback para query direta.
      try {
        const { data, error } = await (supabase as any).rpc("aura_user_active_room", {
          p_user: userId,
        });
        if (!error && data) {
          const row = Array.isArray(data) ? data[0] : data;
          if (row?.slug) return row as ActiveRoom;
        }
      } catch { /* fallback */ }

      // Fallback: lê presença + nome da sala diretamente.
      const since = new Date(Date.now() - 3 * 60_000).toISOString();
      const { data: pres } = await (supabase as any)
        .from("oculto_aura_room_presence")
        .select("room_slug, last_ping")
        .eq("user_id", userId)
        .gte("last_ping", since)
        .order("last_ping", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pres?.room_slug) return null;
      const { data: r } = await (supabase as any)
        .from("oculto_aura_rooms")
        .select("slug, name, emoji, theme")
        .eq("slug", pres.room_slug)
        .maybeSingle();
      if (!r) return null;
      return { ...r, last_ping: pres.last_ping } as ActiveRoom;
    },
  });

  if (!room?.slug) return null;

  return (
    <div className="max-w-sm mx-auto w-full rounded-xl border border-secondary/40 bg-gradient-to-br from-secondary/10 to-primary/10 p-3">
      <div className="flex items-center gap-2 text-[11px] text-secondary font-semibold uppercase tracking-wider">
        <Sparkles className="h-3 w-3" />
        Ativo agora no Aura Match
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {room.emoji ? `${room.emoji} ` : ""}{room.name}
          </p>
          {room.theme && (
            <p className="text-[11px] text-muted-foreground truncate">{room.theme}</p>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-secondary text-secondary-foreground hover:bg-secondary/90"
          onClick={() => navigate(`/aura-match?room=${encodeURIComponent(room.slug)}`)}
        >
          Entrar <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
