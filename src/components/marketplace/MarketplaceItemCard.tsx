import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Heart, 
  ShoppingCart, 
  Play, 
  Image as ImageIcon, 
  FileText, 
  Music,
  Package,
  Clock,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { MarketplaceItem, useAddToWishlist, useRemoveFromWishlist, useIsInWishlist, useHasPurchased } from '@/hooks/useMarketplace';
import { cn } from '@/lib/utils';

interface MarketplaceItemCardProps {
  item: MarketplaceItem;
  onBuy?: (item: MarketplaceItem) => void;
  onView?: (item: MarketplaceItem) => void;
  compact?: boolean;
}

const contentTypeIcons = {
  image: ImageIcon,
  video: Play,
  audio: Music,
  document: FileText,
  mixed: Package,
};

export function MarketplaceItemCard({ item, onBuy, onView, compact }: MarketplaceItemCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const { data: isInWishlist } = useIsInWishlist(item.id);
  const { data: hasPurchased } = useHasPurchased(item.id);
  const addToWishlist = useAddToWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  const ContentIcon = contentTypeIcons[item.content_type] || ImageIcon;
  const hasDiscount = item.original_price && item.original_price > item.price;
  const discountPercent = hasDiscount 
    ? Math.round((1 - item.price / item.original_price!) * 100) 
    : 0;
  const isPresale = item.item_type === 'presale' && item.release_date && new Date(item.release_date) > new Date();
  const isOutOfStock = item.stock_limit !== null && item.sold_count >= item.stock_limit;

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInWishlist) {
      removeFromWishlist.mutate(item.id);
    } else {
      addToWishlist.mutate(item.id);
    }
  };

  const handleBuy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBuy?.(item);
  };

  return (
    <Card 
      className={cn(
        "overflow-hidden cursor-pointer transition-all duration-300 group",
        isHovered && "ring-2 ring-primary/50 shadow-lg"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onView?.(item)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square overflow-hidden bg-muted">
        {item.thumbnail_url || item.preview_url ? (
          <img loading="lazy" decoding="async"
            src={item.thumbnail_url || item.preview_url}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-pink-500/20">
            <ContentIcon className="h-12 w-12 text-muted-foreground" />
          </div>
        )}

        {/* Overlay com badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Top badges */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {item.item_type === 'bundle' && (
            <Badge variant="secondary" className="bg-purple-500/90 text-white text-xs">
              <Package className="h-3 w-3 mr-1" />
              Bundle
            </Badge>
          )}
          {isPresale && (
            <Badge variant="secondary" className="bg-orange-500/90 text-white text-xs">
              <Clock className="h-3 w-3 mr-1" />
              Pré-venda
            </Badge>
          )}
          {item.is_featured && (
            <Badge className="bg-primary/90 text-xs">Destaque</Badge>
          )}
          {hasDiscount && (
            <Badge variant="destructive" className="text-xs">
              -{discountPercent}%
            </Badge>
          )}
        </div>

        {/* Wishlist button */}
        <button
          onClick={handleWishlistToggle}
          className="absolute top-2 right-2 p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors"
        >
          <Heart 
            className={cn(
              "h-4 w-4 transition-colors",
              isInWishlist ? "fill-red-500 text-red-500" : "text-white"
            )} 
          />
        </button>

        {/* Content type indicator */}
        <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Badge variant="outline" className="bg-black/50 border-white/30 text-white text-xs">
            <ContentIcon className="h-3 w-3 mr-1" />
            {item.content_type}
          </Badge>
        </div>

        {/* Purchased indicator */}
        {hasPurchased && (
          <div className="absolute bottom-2 right-2">
            <Badge className="bg-green-500/90 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Comprado
            </Badge>
          </div>
        )}
      </div>

      <CardContent className={cn("p-3", compact && "p-2")}>
        {/* Creator */}
        {item.creator && !compact && (
          <div className="flex items-center gap-2 mb-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={item.creator.avatar_url} />
              <AvatarFallback className="text-[10px]">
                {item.creator.name?.charAt(0) || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">
              {item.creator.name}
            </span>
          </div>
        )}

        {/* Title */}
        <h3 className={cn(
          "font-semibold line-clamp-2 mb-2",
          compact ? "text-sm" : "text-base"
        )}>
          {item.title}
        </h3>

        {/* Price and actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className={cn(
              "font-bold text-primary",
              compact ? "text-base" : "text-lg"
            )}>
              R$ {item.price.toFixed(2).replace('.', ',')}
            </span>
            {hasDiscount && (
              <span className="text-xs text-muted-foreground line-through">
                R$ {item.original_price!.toFixed(2).replace('.', ',')}
              </span>
            )}
          </div>

          {!hasPurchased && (
            <Button
              size="sm"
              onClick={handleBuy}
              disabled={isOutOfStock}
              className={cn(
                "h-8",
                compact && "h-7 text-xs"
              )}
            >
              {isOutOfStock ? (
                <Lock className="h-3 w-3" />
              ) : (
                <>
                  <ShoppingCart className="h-3 w-3 mr-1" />
                  {isPresale ? 'Reservar' : 'Comprar'}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Stock info */}
        {item.stock_limit && (
          <p className="text-xs text-muted-foreground mt-2">
            {isOutOfStock 
              ? 'Esgotado' 
              : `${item.stock_limit - item.sold_count} restantes`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
