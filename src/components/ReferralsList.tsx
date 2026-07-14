import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Referral {
  id: string;
  name: string;
  avatar?: string;
  subscribedAt: Date;
  monthlyValue: number;
  isActive: boolean;
  commissionPaid: boolean;
}

interface ReferralsListProps {
  referrals: Referral[];
}

export function ReferralsList({ referrals }: ReferralsListProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (referrals.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p>Nenhum indicado ainda. Compartilhe seu link!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {referrals.map((referral) => {
        const commission = referral.monthlyValue * 0.05;

        return (
          <div
            key={referral.id}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border transition-all",
              referral.commissionPaid
                ? "bg-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/20"
                : "bg-muted/20 border-border/30"
            )}
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={referral.avatar} alt={referral.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {referral.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{referral.name}</p>
                <p className="text-xs text-muted-foreground">
                  Assinou em {new Date(referral.subscribedAt).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {referral.commissionPaid ? (
                <>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[hsl(142,76%,36%)]">
                      +{formatCurrency(commission)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Comissão paga
                    </p>
                  </div>
                  <Badge className="bg-[hsl(142,76%,36%)]/10 text-[hsl(142,76%,36%)] text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Pago
                  </Badge>
                </>
              ) : referral.isActive ? (
                <>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(commission)} (pendente)
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Aguardando 1ª assinatura
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                </>
              ) : (
                <>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {!referral.isActive ? "Inativo" : "Sem assinatura"}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Inativo
                  </Badge>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
