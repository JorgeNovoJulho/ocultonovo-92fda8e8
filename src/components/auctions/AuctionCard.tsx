import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Gavel, Users, Eye, Lock } from "lucide-react";
import { AuctionTimer } from "./AuctionTimer";
import { AuctionBidModal } from "./AuctionBidModal";
import { Auction } from "@/hooks/useAuctions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface AuctionCardProps {
  auction: Auction;
  showCreator?: boolean;
}

export function AuctionCard({ auction, showCreator = true }: AuctionCardProps) {
  const [showBidModal, setShowBidModal] = useState(false);
  const { user } = useAuth();
  
  const isCreator = user?.id && auction.creator?.id === user.id;
  const isCurrentBidder = auction.current_bidder_id && 
    user?.id && 
    auction.current_bidder?.id === user.id;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
        {/* Media Preview with Blur */}
        <Link to={`/auction/${auction.id}`}>
          <div className="relative aspect-square overflow-hidden">
            <img loading="lazy" decoding="async"
              src={auction.media_url}
              alt={auction.title}
              className="w-full h-full object-cover filter blur-lg group-hover:blur-md transition-all"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            
            {/* Lock overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/60 rounded-full p-4">
                <Lock className="h-8 w-8 text-white" />
              </div>
            </div>

            {/* Timer overlay */}
            <div className="absolute top-3 right-3">
              <Badge variant="secondary" className="bg-black/70 backdrop-blur-sm">
                <AuctionTimer endsAt={auction.ends_at} showIcon={true} />
              </Badge>
            </div>

            {/* Bid count */}
            <div className="absolute top-3 left-3">
              <Badge variant="secondary" className="bg-black/70 backdrop-blur-sm gap-1">
                <Users className="h-3 w-3" />
                {auction.total_bids} lances
              </Badge>
            </div>

            {/* Winning badge */}
            {isCurrentBidder && (
              <div className="absolute bottom-3 left-3 right-3">
                <Badge className="w-full justify-center py-2 bg-green-500/90 hover:bg-green-500">
                  🏆 Você está ganhando!
                </Badge>
              </div>
            )}
          </div>
        </Link>

        <CardContent className="p-4 space-y-3">
          {/* Creator info */}
          {showCreator && auction.creator && (
            <Link 
              to={`/creator/${auction.creator.username || auction.creator.id}`}
              className="flex items-center gap-2 hover:opacity-80"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={auction.creator.avatar_url || undefined} />
                <AvatarFallback>{auction.creator.name?.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate">
                {auction.creator.name}
              </span>
            </Link>
          )}

          {/* Title */}
          <Link to={`/auction/${auction.id}`}>
            <h3 className="font-semibold line-clamp-2 hover:text-primary transition-colors">
              {auction.title}
            </h3>
          </Link>

          {/* Current bid */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                {auction.current_bid > 0 ? "Lance atual" : "Lance inicial"}
              </p>
              <p className="text-xl font-bold text-primary">
                {formatCurrency(auction.current_bid > 0 ? auction.current_bid : auction.starting_price)}
              </p>
            </div>
            
            {auction.current_bidder && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Avatar className="h-5 w-5">
                  <AvatarImage src={auction.current_bidder.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {auction.current_bidder.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[80px]">
                  {auction.current_bidder.name}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {isCreator ? (
              <Button variant="outline" className="flex-1" asChild>
                <Link to={`/auction/${auction.id}`}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver Leilão
                </Link>
              </Button>
            ) : (
              <>
                <Button 
                  className="flex-1 gap-2"
                  onClick={() => setShowBidModal(true)}
                  disabled={isCurrentBidder}
                >
                  <Gavel className="h-4 w-4" />
                  {isCurrentBidder ? "Aguardando..." : "Dar Lance"}
                </Button>
                <Button variant="outline" size="icon" asChild aria-label="Ação">
                  <Link to={`/auction/${auction.id}`}>
                    <Eye className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <AuctionBidModal
        open={showBidModal}
        onOpenChange={setShowBidModal}
        auction={auction}
      />
    </>
  );
}