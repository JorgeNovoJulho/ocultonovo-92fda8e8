import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft, 
  Gavel, 
  Lock, 
  Users, 
  Clock, 
  Trophy,
  AlertTriangle,
  CheckCircle2,
  PartyPopper
} from "lucide-react";
import { AuctionTimer, AuctionBidModal } from "@/components/auctions";
import { useAuction, useBidderCard } from "@/hooks/useAuctions";
import { useAuth } from "@/hooks/useAuth";
import confetti from "canvas-confetti";

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [showBidModal, setShowBidModal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const { user } = useAuth();
  const { data, isLoading, error } = useAuction(id);
  const { data: bidderCard } = useBidderCard();

  const auction = data?.auction;
  const bids = data?.bids || [];

  const isCreator = user?.id && auction?.creator?.id === user.id;
  const isWinner = auction?.winner_id && auction?.winner_id === user?.id;
  const isCurrentBidder = auction?.current_bidder_id && user?.id && 
    auction?.current_bidder?.id === user.id;

  // Confetti for winner
  useEffect(() => {
    if (isWinner && !showConfetti) {
      setShowConfetti(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [isWinner, showConfetti]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="p-4 text-center py-12">
        <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium">Leilão não encontrado</h2>
        <Link to="/auctions">
          <Button variant="outline" className="mt-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const minBid = auction.current_bid > 0 
    ? auction.current_bid + auction.min_increment 
    : auction.starting_price;

  return (
    <div className="min-h-dvh pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center gap-3 p-4">
          <Link to="/auctions">
            <Button variant="ghost" size="icon" aria-label="Voltar">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{auction.title}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3 w-3" />
              {auction.total_bids} lances
            </div>
          </div>
          {auction.status === "active" && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              <AuctionTimer endsAt={auction.ends_at} showIcon={false} />
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Winner celebration */}
        {isWinner && (
          <Card className="bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50">
            <CardContent className="p-4 flex items-center gap-4">
              <PartyPopper className="h-10 w-10 text-yellow-500" />
              <div>
                <h3 className="font-bold text-lg">🎉 Parabéns, você venceu!</h3>
                <p className="text-sm text-muted-foreground">
                  {auction.content_delivered 
                    ? "Seu conteúdo foi desbloqueado!" 
                    : "Aguarde o processamento do pagamento..."
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Media Preview */}
        <div className="relative aspect-square rounded-xl overflow-hidden">
          <img loading="lazy" decoding="async"
            src={auction.media_url}
            alt={auction.title}
            className={`w-full h-full object-cover ${
              isWinner && auction.content_delivered ? "" : "filter blur-xl"
            }`}
          />
          {!(isWinner && auction.content_delivered) && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/60 rounded-full p-6">
                  <Lock className="h-12 w-12 text-white" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Creator info */}
        {auction.creator && (
          <Link 
            to={`/creator/${auction.creator.username || auction.creator.id}`}
            className="flex items-center gap-3 hover:opacity-80"
          >
            <Avatar className="h-12 w-12">
              <AvatarImage src={auction.creator.avatar_url || undefined} />
              <AvatarFallback>{auction.creator.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{auction.creator.name}</p>
              <p className="text-sm text-muted-foreground">
                @{auction.creator.username || auction.creator.id.slice(0, 8)}
              </p>
            </div>
          </Link>
        )}

        {/* Description */}
        {auction.description && (
          <p className="text-muted-foreground">{auction.description}</p>
        )}

        <Separator />

        {/* Bid info */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  {auction.status === "ended" ? "Lance vencedor" : 
                    auction.current_bid > 0 ? "Lance atual" : "Lance inicial"}
                </p>
                <p className="text-3xl font-bold text-primary">
                  {formatCurrency(auction.current_bid > 0 ? auction.current_bid : auction.starting_price)}
                </p>
              </div>
              
              {auction.current_bidder && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-1">Líder</p>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={auction.current_bidder.avatar_url || undefined} />
                      <AvatarFallback>
                        {auction.current_bidder.name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {auction.current_bidder.name}
                    </span>
                    {isCurrentBidder && (
                      <Trophy className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                </div>
              )}
            </div>

            {auction.status === "active" && !isCreator && (
              <>
                <Separator />
                
                {/* Card status */}
                {bidderCard ? (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Cartão verificado: •••• {bidderCard.card_last_four}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="h-4 w-4" />
                    Cadastre um cartão para dar lances
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => setShowBidModal(true)}
                  disabled={isCurrentBidder}
                >
                  <Gavel className="h-5 w-5 mr-2" />
                  {isCurrentBidder 
                    ? "Você está ganhando!" 
                    : `Dar Lance (mín. ${formatCurrency(minBid)})`
                  }
                </Button>
              </>
            )}

            {auction.status === "ended" && (
              <Badge className="w-full justify-center py-2" variant="secondary">
                Leilão encerrado
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Bid history */}
        <div>
          <h3 className="font-semibold mb-3">Histórico de Lances</h3>
          {bids.length > 0 ? (
            <div className="space-y-2">
              {bids.map((bid, index) => (
                <div
                  key={bid.id}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    index === 0 ? "bg-primary/10" : "bg-muted/50"
                  }`}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={bid.bidder?.avatar_url || undefined} />
                    <AvatarFallback>
                      {bid.bidder?.name?.charAt(0) || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {bid.bidder?.name || "Anônimo"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(bid.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency(bid.amount)}</p>
                    {index === 0 && bid.is_winning && (
                      <Badge variant="default" className="text-xs">
                        Líder
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Nenhum lance ainda. Seja o primeiro!
            </p>
          )}
        </div>
      </div>

      {/* Bid Modal */}
      <AuctionBidModal
        open={showBidModal}
        onOpenChange={setShowBidModal}
        auction={auction}
      />
    </div>
  );
}