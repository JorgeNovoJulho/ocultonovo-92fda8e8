import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, TrendingUp, ArrowRight } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

interface CreditConversion {
  id: string;
  amount: number;
  credits_amount: number;
  created_at: string;
}

export function CreditsConvertedCard() {
  const { user } = useAuth();
  const { data: creditsData, isLoading: loadingCredits } = useCredits();

  // Buscar histórico de conversões via transactions
  const { data: conversionHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['credits-conversion-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) return [];

      // Buscar transações de tipo 'credit_conversion'
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', profile.id)
        .eq('type', 'credit_conversion')
        .order('created_at', { ascending: false })
        .limit(10);

      return (data || []) as any[];
    },
    enabled: !!user?.id,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  // Calcular total convertido
  const totalConverted = conversionHistory?.reduce(
    (sum, c) => sum + Math.abs(c.amount || 0), 0
  ) || 0;

  const creditsBalance = creditsData?.credits?.credits_balance || 0;

  if (loadingCredits || loadingHistory) {
    return (
      <Card className="bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-[hsl(330,80%,60%)]/10 border-[hsl(45,93%,47%)]/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="h-4 w-4 text-[hsl(45,93%,47%)]" />
            Créditos Convertidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-[hsl(330,80%,60%)]/10 border-[hsl(45,93%,47%)]/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Coins className="h-4 w-4 text-[hsl(45,93%,47%)]" />
          Créditos Convertidos
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Saldo Atual</p>
            <p className="text-2xl font-bold text-[hsl(45,93%,47%)]">
              {creditsBalance}
              <span className="text-sm font-normal ml-1">créditos</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Convertido</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(totalConverted)}
            </p>
          </div>
        </div>

        {/* Mini histórico */}
        {conversionHistory && conversionHistory.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-xs text-muted-foreground mb-2">Últimas conversões</p>
            <div className="space-y-2">
              {conversionHistory.slice(0, 3).map((conv) => (
                <div key={conv.id} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      {format(new Date(conv.created_at), 'dd/MM', { locale: ptBR })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      {formatCurrency(Math.abs(conv.amount))}
                    </span>
                    <ArrowRight className="h-3 w-3 text-[hsl(45,93%,47%)]" />
                    <Badge variant="secondary" className="bg-[hsl(45,93%,47%)]/10 text-[hsl(45,93%,47%)]">
                      +{Math.round(Math.abs(conv.amount) * 2)} créditos
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {(!conversionHistory || conversionHistory.length === 0) && (
          <div className="mt-4 pt-4 border-t border-border/30 text-center">
            <p className="text-xs text-muted-foreground">
              Nenhuma conversão realizada ainda.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Converta seu saldo em créditos para enviar presentes!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
