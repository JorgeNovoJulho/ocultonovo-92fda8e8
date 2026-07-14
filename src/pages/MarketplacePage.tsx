import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, 
  ShoppingBag, 
  Heart, 
  TrendingUp, 
  Sparkles,
  Package,
  Clock,
  Filter,
  SlidersHorizontal,
  Grid3X3,
  LayoutList
} from 'lucide-react';
import { MarketplaceItemCard } from '@/components/marketplace/MarketplaceItemCard';
import { MarketplacePurchaseModal } from '@/components/marketplace/MarketplacePurchaseModal';
import { 
  useMarketplaceItems, 
  useWishlist,
  MarketplaceItem 
} from '@/hooks/useMarketplace';

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

  // Filtros baseados na tab ativa
  const filters = {
    search: searchQuery || undefined,
    itemType: activeTab === 'bundles' ? 'bundle' : activeTab === 'presales' ? 'presale' : undefined,
    featured: activeTab === 'featured' ? true : undefined,
  };

  const { data: items, isLoading } = useMarketplaceItems(filters);
  const { data: featuredItems } = useMarketplaceItems({ featured: true, limit: 4 });
  const { data: wishlistItems } = useWishlist();

  const handleBuyItem = (item: MarketplaceItem) => {
    setSelectedItem(item);
    setPurchaseModalOpen(true);
  };

  const handleViewItem = (item: MarketplaceItem) => {
    navigate(`/marketplace/${item.id}`);
  };

  return (
    <div className="min-h-dvh bg-background">
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-6 w-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Marketplace</h1>
                <p className="text-sm text-muted-foreground">
                  Conteúdos exclusivos para você
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar conteúdo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* View toggle */}
              <div className="flex border rounded-lg">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-9 w-9 rounded-r-none"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-9 w-9 rounded-l-none"
                  onClick={() => setViewMode('list')}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
              </div>

              {/* Wishlist */}
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => navigate('/marketplace/wishlist')}
              >
                <Heart className="h-4 w-4" />
                <span className="hidden md:inline">Wishlist</span>
                {wishlistItems && wishlistItems.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5">
                    {wishlistItems.length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-7xl mx-auto px-4 py-6">
        {/* Featured Section */}
        {activeTab === 'all' && featuredItems && featuredItems.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              <h2 className="text-lg font-semibold">Destaques</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {featuredItems.slice(0, 4).map((item) => (
                <MarketplaceItemCard
                  key={item.id}
                  item={item}
                  onBuy={handleBuyItem}
                  onView={handleViewItem}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="all" className="gap-2">
              <ShoppingBag className="h-4 w-4" />
              Todos
            </TabsTrigger>
            <TabsTrigger value="featured" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Populares
            </TabsTrigger>
            <TabsTrigger value="bundles" className="gap-2">
              <Package className="h-4 w-4" />
              Bundles
            </TabsTrigger>
            <TabsTrigger value="presales" className="gap-2">
              <Clock className="h-4 w-4" />
              Pré-vendas
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            {isLoading ? (
              <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1'}`}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="aspect-square" />
                    <CardContent className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : items && items.length > 0 ? (
              <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1'}`}>
                {items.map((item) => (
                  <MarketplaceItemCard
                    key={item.id}
                    item={item}
                    onBuy={handleBuyItem}
                    onView={handleViewItem}
                    compact={viewMode === 'list'}
                  />
                ))}
              </div>
            ) : (
              <Card className="py-12">
                <CardContent className="text-center">
                  <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">Nenhum item encontrado</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery 
                      ? 'Tente outros termos de busca'
                      : 'Novos conteúdos serão adicionados em breve'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Purchase Modal */}
      <MarketplacePurchaseModal
        open={purchaseModalOpen}
        onOpenChange={setPurchaseModalOpen}
        item={selectedItem}
      />
    </div>
  );
}
