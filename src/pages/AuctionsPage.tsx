import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Gavel, Plus, Trophy, History, ChevronLeft, Lock, Crown } from "lucide-react";
import { Link } from "react-router-dom";
import { AuctionCard, CreateAuctionModal } from "@/components/auctions";
import { useActiveAuctions, useMyAuctions, useMyBids } from "@/hooks/useAuctions";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { usePlanPermissions } from "@/hooks/usePlanPermissions";
import { PlanFeatureBanner } from "@/components/PlanFeatureLock";

export default function AuctionsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { user } = useAuth();
  const { profile } = useProfile();
  const { canCreateAuctions, isFree } = usePlanPermissions();
  const { data: activeAuctions, isLoading: loadingActive } = useActiveAuctions();
  const { data: myAuctions, isLoading: loadingMy } = useMyAuctions();
  const { data: myBids, isLoading: loadingBids } = useMyBids();

  const isCreator = profile?.is_creator;
  const canCreate = canCreateAuctions; // Qualquer premium+ pode criar leilão

  return (
    <div className="min-h-dvh pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Link to="/feed">
              <Button variant="ghost" size="icon" aria-label="Voltar">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Gavel className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Leilões</h1>
            </div>
          </div>
          
          {isCreator && (
            canCreate ? (
              <Button onClick={() => setShowCreateModal(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Criar Leilão
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                <Crown className="h-4 w-4 text-[hsl(45,93%,47%)]" />
                <span>Premium+ para criar leilões</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Free plan paywall banner */}
      {isFree && isCreator && (
        <div className="mx-4 mt-4">
          <PlanFeatureBanner
            featureName="Criar leilões"
            requiredPlan="premium"
            description="Faça upgrade para criar leilões e monetizar com seus fãs."
          />
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="active" className="p-4">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="active" className="gap-2">
            <Gavel className="h-4 w-4" />
            Ativos
          </TabsTrigger>
          {canCreate && (
            <TabsTrigger value="my-auctions" className="gap-2">
              <Trophy className="h-4 w-4" />
              Meus Leilões
            </TabsTrigger>
          )}
          <TabsTrigger value="my-bids" className="gap-2">
            <History className="h-4 w-4" />
            Meus Lances
          </TabsTrigger>
        </TabsList>

        {/* Active Auctions */}
        <TabsContent value="active" className="mt-4">
          {canCreate && (
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Leilão
              </Button>
            </div>
          )}
          {loadingActive ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-80 rounded-xl" />
              ))}
            </div>
          ) : activeAuctions && activeAuctions.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeAuctions.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Gavel className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhum leilão ativo</h3>
              <p className="text-muted-foreground">
                {canCreate 
                  ? "Crie o primeiro leilão clicando no botão acima!"
                  : "Novos leilões em breve!"
                }
              </p>
            </div>
          )}
        </TabsContent>

        {/* My Auctions (Creator - Premium+) */}
        {canCreate && (
          <TabsContent value="my-auctions" className="mt-4">
            {loadingMy ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-80 rounded-xl" />
                ))}
              </div>
            ) : myAuctions && myAuctions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} showCreator={false} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nenhum leilão criado</h3>
                <p className="text-muted-foreground mb-4">
                  Crie seu primeiro leilão e deixe os fãs disputarem!
                </p>
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Leilão
                </Button>
              </div>
            )}
          </TabsContent>
        )}

        {/* My Bids */}
        <TabsContent value="my-bids" className="mt-4">
          {loadingBids ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : myBids && myBids.length > 0 ? (
            <div className="space-y-4">
              {myBids.map((bid: any) => (
                <Link
                  key={bid.id}
                  to={`/auction/${bid.auction?.id}`}
                  className="block"
                >
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <img loading="lazy" decoding="async"
                      src={bid.auction?.media_url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover filter blur-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{bid.auction?.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Seu lance: R$ {bid.amount.toFixed(2)}
                      </p>
                      {bid.is_winning ? (
                        <span className="text-xs text-green-500 font-medium">
                          🏆 Você está ganhando!
                        </span>
                      ) : bid.outbid_at ? (
                        <span className="text-xs text-destructive font-medium">
                          ❌ Superado
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        R$ {bid.auction?.current_bid?.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {bid.auction?.status === "ended" ? "Encerrado" : "Lance atual"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Nenhum lance dado</h3>
              <p className="text-muted-foreground">
                Participe de leilões e dispute conteúdos exclusivos!
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Auction Modal */}
      <CreateAuctionModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />
    </div>
  );
}
