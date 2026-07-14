import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  useMyAfilhadas, 
  useMadrinhaStats, 
  useCreatorReferralCode,
  isReferralActive,
  getRemainingCommissionDays 
} from "@/hooks/useCreatorReferrals";
import { useProfile } from "@/hooks/useProfile";
import { 
  Users, 
  TrendingUp, 
  Copy, 
  Check, 
  Gift, 
  Clock, 
  Sparkles,
  UserPlus,
  Link as LinkIcon,
  BarChart3
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { AfilhadasList } from "./AfilhadasList";
import { useCreatorAffiliateLimit } from "@/hooks/useAffiliateManagement";
import { Progress } from "@/components/ui/progress";

export function MadrinhaDashboard() {
  const { profile, isLoading: loadingProfile } = useProfile();
  const { data: afilhadas, isLoading: loadingAfilhadas } = useMyAfilhadas();
  const { stats, isLoading: loadingStats } = useMadrinhaStats();
  const { code, isLoading: loadingCode, generateCode, isGenerating, getInviteLink } = useCreatorReferralCode();
  const { toast } = useToast();
  const { data: limitInfo } = useCreatorAffiliateLimit(profile?.id);
  const [copied, setCopied] = useState(false);

  const isCreator = profile?.is_creator;
  const inviteLink = getInviteLink();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({
        title: 'Link copiado!',
        description: 'Compartilhe com outras criadoras.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Erro ao copiar',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  if (loadingProfile || loadingStats) {
    return (
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!isCreator) {
    return null;
  }

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20">
              <Sparkles className="h-5 w-5 text-pink-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Programa Madrinhas</CardTitle>
              <CardDescription>
                Convide criadoras e ganhe 5% da receita por 12 meses
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="bg-pink-500/10 text-pink-400">
            5% de comissão
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Invite Link Section */}
        <div className="p-4 rounded-lg bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-pink-500/10 border border-pink-500/20">
          <div className="flex items-center gap-2 mb-3">
            <LinkIcon className="h-4 w-4 text-pink-400" />
            <span className="text-sm font-medium">Seu Link de Convite</span>
          </div>

          {!code && !loadingCode ? (
            <Button 
              onClick={() => generateCode()}
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {isGenerating ? 'Gerando...' : 'Gerar Link de Convite'}
            </Button>
          ) : loadingCode ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex gap-2">
              <code className="flex-1 p-2 bg-background/50 rounded text-xs truncate border border-border/50">
                {inviteLink}
              </code>
              <Button
                size="icon"
                variant="outline"
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Afilhadas</span>
            </div>
            <p className="text-lg font-bold">{stats.totalAfilhadas}</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Ativas</span>
            </div>
            <p className="text-lg font-bold text-green-400">{stats.activeAfilhadas}</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <Gift className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Este Mês</span>
            </div>
            <p className="text-lg font-bold text-pink-400">
              {formatCurrency(stats.monthlyCommission)}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <p className="text-lg font-bold">
              {formatCurrency(stats.totalCommissionEarned)}
            </p>
          </div>
        </div>

        {/* Analytics Link */}
        {stats.totalAfilhadas > 0 && (
          <Link to="/madrinha-analytics">
            <Button 
              variant="outline" 
              className="w-full border-pink-500/30 text-pink-400 hover:bg-pink-500/10"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Ver Analytics Completos
            </Button>
          </Link>
        )}

        {/* How it Works */}
        <div className="p-4 rounded-lg bg-muted/20 border border-border/30">
          <h4 className="text-sm font-medium mb-3">Como Funciona</h4>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 text-[10px] font-bold shrink-0">1</span>
              <p>Compartilhe seu link com criadoras que deseja convidar</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 text-[10px] font-bold shrink-0">2</span>
              <p>Quando ela se cadastrar pelo seu link, você se torna a Madrinha</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 text-[10px] font-bold shrink-0">3</span>
              <p>Receba 5% de tudo que ela vender por 12 meses - sem custo para ela!</p>
            </div>
          </div>
        </div>

        {/* Limite de afiliados */}
        {limitInfo && (
          <div className="rounded-lg border bg-muted/30 p-3 mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">Capacidade de afiliados</span>
              <span className="text-muted-foreground">
                {limitInfo.current_count} / {limitInfo.max_allowed}
              </span>
            </div>
            <Progress value={Math.min(100, (limitInfo.current_count / Math.max(1, limitInfo.max_allowed)) * 100)} className="h-1.5" />
            {!limitInfo.can_add_more && (
              <p className="text-[11px] text-amber-500 mt-1">
                Limite atingido — novos vínculos ficarão bloqueados.
              </p>
            )}
          </div>
        )}

        {/* Afilhadas List */}
        {loadingAfilhadas ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : afilhadas && afilhadas.length > 0 ? (
          <AfilhadasList afilhadas={afilhadas} />
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma afilhada ainda</p>
            <p className="text-xs">Compartilhe seu link para começar!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
