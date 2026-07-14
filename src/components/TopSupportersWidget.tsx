import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  useTopSupporters, 
  useMyRankingPosition, 
  useCreatorShowsRanking,
  TopSupporter 
} from "@/hooks/useTopSupporters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Crown, 
  Trophy, 
  Medal, 
  Award,
  Ghost,
  Sparkles,
  TrendingUp,
  Gift
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface TopSupportersWidgetProps {
  creatorId: string | undefined;
  currentUserId?: string;
  onSubscribe?: () => void;
}

// Componente para o podium (Top 3)
function PodiumPosition({ 
  supporter, 
  position 
}: { 
  supporter: TopSupporter | undefined; 
  position: 1 | 2 | 3;
}) {
  const navigate = useNavigate();
  
  const config = {
    1: {
      size: "h-20 w-20",
      ring: "ring-4 ring-[hsl(45,93%,47%)] shadow-lg shadow-[hsl(45,93%,47%)]/30",
      icon: Crown,
      iconColor: "text-[hsl(45,93%,47%)]",
      label: "1º",
      order: "order-2",
      marginTop: "mt-0",
    },
    2: {
      size: "h-16 w-16",
      ring: "ring-3 ring-gray-400 shadow-md shadow-gray-400/20",
      icon: Medal,
      iconColor: "text-gray-400",
      label: "2º",
      order: "order-1",
      marginTop: "mt-6",
    },
    3: {
      size: "h-14 w-14",
      ring: "ring-2 ring-amber-700 shadow-md shadow-amber-700/20",
      icon: Award,
      iconColor: "text-amber-700",
      label: "3º",
      order: "order-3",
      marginTop: "mt-8",
    },
  }[position];

  const IconComponent = config.icon;

  if (!supporter) {
    return (
      <div className={cn("flex flex-col items-center", config.order, config.marginTop)}>
        <div className={cn("rounded-full bg-muted/30 flex items-center justify-center", config.size)}>
          <span className="text-muted-foreground/50 text-lg font-bold">{config.label}</span>
        </div>
        <span className="text-xs text-muted-foreground mt-2">—</span>
      </div>
    );
  }

  const handleClick = () => {
    if (!supporter.is_anonymous) {
      navigate(`/creator/${supporter.supporter_id}`);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className={cn("flex flex-col items-center", config.order, config.marginTop)}>
      <div className="relative">
        <IconComponent className={cn("absolute -top-3 left-1/2 -translate-x-1/2 h-5 w-5 z-10", config.iconColor)} />
        <Avatar 
          className={cn(config.size, config.ring, "cursor-pointer transition-transform hover:scale-105")}
          onClick={handleClick}
        >
          {supporter.is_anonymous ? (
            <AvatarFallback className="bg-muted">
              <Ghost className="h-6 w-6 text-muted-foreground" />
            </AvatarFallback>
          ) : (
            <>
              <AvatarImage src={supporter.supporter_avatar || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {supporter.supporter_name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </>
          )}
        </Avatar>
      </div>
      <span className="text-sm font-medium mt-2 truncate max-w-[80px] text-center">
        {supporter.is_anonymous ? "Admirador Secreto" : supporter.supporter_name}
      </span>
      <span className={cn(
        "text-xs font-bold",
        position === 1 && "text-[hsl(45,93%,47%)]",
        position === 2 && "text-gray-400",
        position === 3 && "text-amber-700"
      )}>
        {formatCurrency(supporter.total_spent)}
      </span>
    </div>
  );
}

// Componente para posições 4-10
function RankingRow({ 
  supporter, 
  isCurrentUser 
}: { 
  supporter: TopSupporter; 
  isCurrentUser: boolean;
}) {
  const navigate = useNavigate();
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-3 py-2 px-3 rounded-lg transition-colors",
        isCurrentUser && "bg-primary/10 border border-primary/30",
        !supporter.is_anonymous && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={() => !supporter.is_anonymous && navigate(`/creator/${supporter.supporter_id}`)}
    >
      <span className="text-sm font-bold text-muted-foreground w-6">
        {supporter.rank_position}º
      </span>
      <Avatar className="h-8 w-8">
        {supporter.is_anonymous ? (
          <AvatarFallback className="bg-muted">
            <Ghost className="h-4 w-4 text-muted-foreground" />
          </AvatarFallback>
        ) : (
          <>
            <AvatarImage src={supporter.supporter_avatar || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {supporter.supporter_name?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </>
        )}
      </Avatar>
      <span className="flex-1 text-sm truncate">
        {supporter.is_anonymous ? "Admirador Secreto" : supporter.supporter_name}
        {isCurrentUser && <span className="text-xs text-primary ml-1">(você)</span>}
      </span>
      <span className="text-sm font-medium text-muted-foreground">
        {formatCurrency(supporter.total_spent)}
      </span>
    </div>
  );
}

export function TopSupportersWidget({ 
  creatorId, 
  currentUserId,
  onSubscribe 
}: TopSupportersWidgetProps) {
  const { data: showsRanking, isLoading: loadingSettings } = useCreatorShowsRanking(creatorId);
  const { data: supporters, isLoading: loadingSupporters } = useTopSupporters(creatorId, 10);
  const { data: myPosition } = useMyRankingPosition(creatorId);

  const currentMonth = useMemo(() => {
    return format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Não mostrar se criador desativou ou ainda carregando
  if (loadingSettings) return null;
  if (!showsRanking) return null;

  // Loading state
  if (loadingSupporters) {
    return (
      <Card className="overflow-hidden border-border/30">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-14 w-14 rounded-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sem supporters ainda
  if (!supporters || supporters.length === 0) {
    return (
      <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-[hsl(45,93%,47%)]/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            Ranking de Fãs
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <Crown className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            Seja o primeiro a aparecer no ranking!
          </p>
          {onSubscribe && (
            <Button 
              size="sm" 
              className="mt-4 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black"
              onClick={onSubscribe}
            >
              <Gift className="h-4 w-4 mr-2" />
              Apoiar Agora
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const top3 = supporters.slice(0, 3);
  const rest = supporters.slice(3);

  // Verificar se usuário atual está no ranking
  const currentUserInRanking = currentUserId 
    ? supporters.find(s => s.supporter_id === currentUserId) 
    : null;

  // Verificar se usuário está fora do top 10 e mostrar upsell
  const showUpsell = currentUserId && !currentUserInRanking && myPosition;

  return (
    <Card className="overflow-hidden border-border/30 bg-gradient-to-br from-[hsl(45,93%,47%)]/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            Ranking de Fãs
          </div>
          <span className="text-xs font-normal text-muted-foreground capitalize">
            {currentMonth}
          </span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Podium - Top 3 */}
        <div className="flex justify-center items-end gap-4 pt-4 pb-2">
          <PodiumPosition supporter={top3[1]} position={2} />
          <PodiumPosition supporter={top3[0]} position={1} />
          <PodiumPosition supporter={top3[2]} position={3} />
        </div>

        {/* Divider */}
        {rest.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <div className="space-y-1">
              {rest.map((supporter) => (
                <RankingRow 
                  key={supporter.supporter_id}
                  supporter={supporter}
                  isCurrentUser={currentUserId === supporter.supporter_id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Upsell para quem está fora do ranking */}
        {showUpsell && myPosition.amount_to_top10 > 0 && (
          <div className="border-t border-border/50 pt-4">
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Quase lá!</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Faltam apenas <span className="font-bold text-primary">{formatCurrency(myPosition.amount_to_top10)}</span> para você entrar no TOP 10!
              </p>
              {onSubscribe && (
                <Button 
                  size="sm" 
                  className="bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,93%,47%)] text-black"
                  onClick={onSubscribe}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Apoiar Agora
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Posição atual do usuário se não está no top 10 mas tem gastos */}
        {currentUserId && !currentUserInRanking && myPosition && myPosition.my_position > 0 && myPosition.my_total_spent > 0 && (
          <div className="text-center text-xs text-muted-foreground pt-2">
            Você está na posição <span className="font-bold">{myPosition.my_position}º</span> com {formatCurrency(myPosition.my_total_spent)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
