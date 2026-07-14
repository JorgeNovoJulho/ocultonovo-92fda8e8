/**
 * AuctionsFeedStrip — Sessão "Leilões" no feed principal.
 * Aparece após o 9º post (3 após "Eventos"). Lista leilões ativos.
 * Sem leilões ativos → aviso "sem novas peças sendo leiloadas".
 */
import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Gavel, ArrowRight, Timer, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveAuctions, type Auction } from "@/hooks/useAuctions";

function formatBRL(v: number | null | undefined) {
  const n = typeof v === "number" ? v : Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function shortRemaining(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "encerrando";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export const AuctionsFeedStrip = memo(function AuctionsFeedStrip() {
  const navigate = useNavigate();
  const { data, isLoading } = useActiveAuctions();

  const auctions = useMemo<Auction[]>(() => {
    return ((data || []) as Auction[]).slice(0, 8);
  }, [data]);

  return (
    <section
      aria-label="Leilões"
      className="my-4 rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/[0.07] to-transparent p-3"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-200/90">
            Leilões
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-amber-300 hover:text-amber-200"
          onClick={() => navigate("/auctions")}
        >
          Ver todos <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-56 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <Card className="border-dashed border-amber-500/25 bg-background/40">
          <CardContent className="p-5 text-center">
            <Gavel className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground mb-3">
              Sem novas peças sendo leiloadas
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/auctions")}
              className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
            >
              Explorar Leilões
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide snap-x snap-mandatory">
          {auctions.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(`/auctions/${a.id}`)}
              className="snap-start shrink-0 w-56 rounded-xl overflow-hidden border border-amber-500/25 bg-card/60 text-left transition-transform active:scale-[0.98] hover:border-amber-400/50"
            >
              <div
                className="h-24 w-full bg-gradient-to-br from-amber-600/40 to-orange-600/40 bg-cover bg-center relative"
                style={
                  a.media_url
                    ? { backgroundImage: `url(${a.media_url})` }
                    : undefined
                }
              >
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-black/55 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                  <Timer className="h-3 w-3" />
                  {shortRemaining(a.ends_at)}
                </div>
              </div>
              <div className="p-2.5">
                <p className="text-sm font-semibold text-foreground truncate">
                  {a.title}
                </p>
                <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Lance atual</span>
                </div>
                <p className="text-sm font-bold text-amber-300 mt-0.5">
                  {formatBRL(a.current_bid || a.starting_price)}
                </p>
                {typeof a.total_bids === "number" && a.total_bids > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {a.total_bids} {a.total_bids === 1 ? "lance" : "lances"}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
});
