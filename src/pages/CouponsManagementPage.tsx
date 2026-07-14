import { useState, useMemo } from "react";
import { 
  Ticket, 
  Plus, 
  TrendingUp, 
  DollarSign, 
  Users,
  Calendar,
  Pause,
  Play,
  Trash2,
  Copy,
  ExternalLink,
  Instagram,
  Twitter,
  Smartphone,
  Globe,
  BarChart3,
  Search,
  Lock,
  Crown,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { CreateCouponModal } from "@/components/CreateCouponModal";
import { useCreatorCoupons, useToggleCoupon, useDeleteCoupon } from "@/hooks/useCoupons";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";
import { PlanFeatureBanner } from "@/components/PlanFeatureLock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const platformIcons: Record<string, React.ReactNode> = {
  instagram: <Instagram className="h-3 w-3" />,
  tiktok: <Smartphone className="h-3 w-3" />,
  twitter: <Twitter className="h-3 w-3" />,
  other: <Globe className="h-3 w-3" />,
};

const platformColors: Record<string, string> = {
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  tiktok: 'bg-gradient-to-r from-gray-800 to-gray-600 text-white',
  twitter: 'bg-gradient-to-r from-blue-400 to-blue-500 text-white',
  other: 'bg-muted text-muted-foreground',
};

export default function CouponsManagementPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const { data: coupons, isLoading } = useCreatorCoupons();
  const { profile } = useProfile();
  const toggleCoupon = useToggleCoupon();
  const deleteCoupon = useDeleteCoupon();

  // Check user plan - VIP can create coupons, Premium only has referral coupon
  const isVip = profile?.plan_type === 'vip';
  const isPremium = profile?.plan_type === 'premium';
  const isFree = profile?.plan_type === 'free';
  const canCreateCoupons = isVip;
  const canEditCoupons = isVip;

  // Calculate stats
  const stats = useMemo(() => {
    if (!coupons || coupons.length === 0) {
      return {
        activeCoupons: 0,
        totalUses: 0,
        totalRevenue: 0,
        conversionRate: 0,
      };
    }

    const activeCoupons = coupons.filter(c => c.is_active).length;
    const totalUses = coupons.reduce((acc, c) => acc + (c.current_uses || 0), 0);
    const avgPrice = 29.90;
    const totalRevenue = coupons.reduce((acc, c) => {
      const discountedPrice = avgPrice * (1 - c.discount / 100);
      return acc + (c.current_uses || 0) * discountedPrice;
    }, 0);
    const conversionRate = totalUses > 0 ? (totalUses / (totalUses * 5)) * 100 : 0;

    return { activeCoupons, totalUses, totalRevenue, conversionRate };
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    if (!coupons) return [];
    if (!searchQuery.trim()) return coupons;

    return coupons.filter(c => 
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.campaign_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [coupons, searchQuery]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Código copiado!',
      description: `O código ${code} foi copiado para a área de transferência.`,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isExpired = (endDate: string) => new Date(endDate) < new Date();
  const isUpcoming = (startDate: string) => new Date(startDate) > new Date();

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div>
            <Skeleton className="h-6 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6">
      {/* Plan restriction banner for free/premium users */}
      {isFree && (
        <PlanFeatureBanner
          featureName="Cupons Promocionais"
          requiredPlan="vip"
          description="Cupons promocionais estão disponíveis apenas para usuários VIP. Faça upgrade para criar campanhas de desconto."
        />
      )}

      {isPremium && (
        <PlanFeatureBanner
          featureName="Criar cupons personalizados"
          requiredPlan="vip"
          description="Você tem acesso ao cupom de indicação. Para criar cupons promocionais personalizados, faça upgrade para VIP."
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Ticket className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Cupons Promocionais</h1>
            <p className="text-sm text-muted-foreground truncate">
              {canCreateCoupons 
                ? 'Crie e gerencie suas campanhas de desconto'
                : isPremium 
                  ? 'Gerencie seu cupom de indicação'
                  : 'Visualize seus cupons de desconto'
              }
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link to="/earnings/analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden xs:inline">Analytics</span>
            </Link>
          </Button>
          {canCreateCoupons ? (
            <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Cupom
            </Button>
          ) : (
            <Button size="sm" disabled className="gap-2" title="Disponível apenas para VIP">
              <Lock className="h-4 w-4" />
              Criar Cupom
            </Button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary mb-1">
              <Ticket className="h-4 w-4" />
              <span className="text-xs">Cupons Ativos</span>
            </div>
            <p className="text-2xl font-bold">{stats.activeCoupons}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Total de Usos</span>
            </div>
            <p className="text-2xl font-bold">{stats.totalUses}</p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[hsl(142,76%,36%)] mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs">Receita Gerada</span>
            </div>
            <p className="text-2xl font-bold text-[hsl(142,76%,36%)]">{formatCurrency(stats.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs">Taxa de Conversão</span>
            </div>
            <p className="text-2xl font-bold">{stats.conversionRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por código ou campanha..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Coupons List */}
      {filteredCoupons.length === 0 ? (
        <Card className="bg-card/50 border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Ticket className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {searchQuery ? 'Nenhum cupom encontrado' : 'Nenhum cupom criado'}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery 
                ? 'Tente buscar por outro termo'
                : 'Crie seu primeiro cupom promocional para atrair novos assinantes.'
              }
            </p>
                {!searchQuery && canCreateCoupons && (
                  <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Criar Cupom
                  </Button>
                )}
                {!searchQuery && !canCreateCoupons && (
                  <Button disabled className="gap-2 opacity-50 cursor-not-allowed" title="Disponível apenas para VIP">
                    <Lock className="h-4 w-4" />
                    Criar Cupom
                  </Button>
                )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCoupons.map((coupon) => {
            const expired = isExpired(coupon.end_date);
            const upcoming = isUpcoming(coupon.start_date);
            const platform = (coupon as any).platform_source || 'other';
            const clicks = (coupon as any).clicks_count || 0;
            const conversions = coupon.current_uses || 0;
            const revenue = conversions * 29.90 * (1 - coupon.discount / 100);

            return (
              <Card 
                key={coupon.id} 
                className={cn(
                  "bg-card/50 border-border/50 transition-all",
                  expired && "opacity-60",
                  !coupon.is_active && "opacity-60"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Main Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <Badge 
                          variant="outline" 
                          className="font-mono text-sm px-3 py-1 cursor-pointer hover:bg-muted"
                          onClick={() => handleCopyCode(coupon.code)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          {coupon.code}
                        </Badge>
                        <Badge className="bg-primary/10 text-primary border-primary/30">
                          -{coupon.discount}%
                        </Badge>
                        {platform !== 'other' && (
                          <Badge className={cn("gap-1", platformColors[platform])}>
                            {platformIcons[platform]}
                            <span className="capitalize">{platform}</span>
                          </Badge>
                        )}
                        {expired && (
                          <Badge variant="outline" className="text-destructive border-destructive/30">
                            Expirado
                          </Badge>
                        )}
                        {upcoming && (
                          <Badge variant="outline" className="text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">
                            Agendado
                          </Badge>
                        )}
                        {!coupon.is_active && !expired && (
                          <Badge variant="outline" className="text-muted-foreground">
                            Pausado
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-lg">{coupon.campaign_name}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(coupon.start_date)} - {formatDate(coupon.end_date)}
                        </span>
                        {coupon.max_uses && (
                          <span>Limite: {coupon.max_uses} usos</span>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex gap-4 md:gap-6">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Cliques</p>
                        <p className="text-lg font-bold">{clicks}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Conversões</p>
                        <p className="text-lg font-bold text-primary">{conversions}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Receita</p>
                        <p className="text-lg font-bold text-[hsl(142,76%,36%)]">{formatCurrency(revenue)}</p>
                      </div>
                    </div>

                    {/* Actions - VIP can edit/delete, Premium can only toggle */}
                    <div className="flex gap-2">
                      {/* Toggle is available for all paid plans */}
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleCoupon.mutate({ couponId: coupon.id, isActive: !coupon.is_active })}
                        disabled={expired || isFree}
                        title={coupon.is_active ? 'Pausar cupom' : 'Ativar cupom'}
                      >
                        {coupon.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      
                      {/* Delete only for VIP */}
                      {canEditCoupons ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10"
                             aria-label="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O cupom "{coupon.code}" será excluído permanentemente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteCoupon.mutate(coupon.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <Button
                          variant="outline"
                          size="icon"
                          disabled
                          title="Apenas VIP pode excluir cupons"
                         aria-label="Bloqueado">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateCouponModal 
        open={showCreateModal} 
        onOpenChange={setShowCreateModal}
        onCreateCoupon={(coupon) => {
          // The hook handles the creation
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}
