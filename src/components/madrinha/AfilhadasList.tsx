import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  CreatorReferral, 
  isReferralActive, 
  getRemainingCommissionDays 
} from "@/hooks/useCreatorReferrals";
import { CheckCircle2, Clock, AlertCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface AfilhadasListProps {
  afilhadas: CreatorReferral[];
}

export function AfilhadasList({ afilhadas }: AfilhadasListProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  if (afilhadas.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p className="text-sm">Nenhuma afilhada ainda.</p>
        <p className="text-xs">Compartilhe seu link para convidar criadoras!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <TrendingUp className="h-4 w-4" />
        Suas Afilhadas ({afilhadas.length})
      </h4>
      
      <div className="space-y-2">
        {afilhadas.map((afilhada) => {
          const isActive = isReferralActive(afilhada.expires_at, afilhada.is_active);
          const daysRemaining = getRemainingCommissionDays(afilhada.expires_at);
          const profile = afilhada.afilhada_profile;

          return (
            <div
              key={afilhada.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-all",
                isActive
                  ? "bg-green-500/5 border-green-500/20 hover:bg-green-500/10"
                  : "bg-muted/20 border-border/30 opacity-70"
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 border-2 border-background">
                  <AvatarImage src={profile?.avatar_url || ''} alt={profile?.name || ''} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {profile?.name?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{profile?.name || 'Usuário'}</p>
                    {profile?.is_verified && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Desde {formatDate(afilhada.started_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isActive ? (
                  <>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-400">
                        {formatCurrency(afilhada.total_commission_earned || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock className="h-3 w-3" />
                        {daysRemaining} dias restantes
                      </p>
                    </div>
                    <Badge className="bg-green-500/10 text-green-400 text-xs shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ativo
                    </Badge>
                  </>
                ) : (
                  <>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(afilhada.total_commission_earned || 0)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Período encerrado
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Expirado
                    </Badge>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
