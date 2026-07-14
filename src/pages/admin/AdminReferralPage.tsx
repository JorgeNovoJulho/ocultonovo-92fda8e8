import { useState } from "react";
import { AdminReferralNetworkTab } from "@/components/admin/AdminReferralNetworkTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Users, Link2, DollarSign, TrendingUp, MousePointerClick,
  UserPlus, Award, CreditCard, RefreshCw, CheckCircle2,
  XCircle, Clock, Percent, Layers
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useReferralPrograms,
  useUpdateReferralProgram,
  useReferralAffiliates,
  useApproveAffiliate,
  useReferralCommissions,
  useApproveCommission,
  useReferralPayouts,
  useProcessPayout,
  useReferralStats,
} from "@/hooks/useReferralSystem";

export default function AdminReferralPage() {
  const [activeTab, setActiveTab] = useState("overview");
  
  const { data: programs, isLoading: loadingPrograms, refetch } = useReferralPrograms();
  const { data: affiliates, isLoading: loadingAffiliates } = useReferralAffiliates();
  const { data: commissions, isLoading: loadingCommissions } = useReferralCommissions();
  const { data: payouts, isLoading: loadingPayouts } = useReferralPayouts();
  const { data: stats, isLoading: loadingStats } = useReferralStats();
  
  const updateProgram = useUpdateReferralProgram();
  const approveAffiliate = useApproveAffiliate();
  const approveCommission = useApproveCommission();
  const processPayout = useProcessPayout();

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { color: string; icon: React.ReactNode }> = {
      pending: { color: "bg-amber-500/20 text-amber-400", icon: <Clock className="h-3 w-3" /> },
      active: { color: "bg-green-500/20 text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
      approved: { color: "bg-green-500/20 text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
      suspended: { color: "bg-destructive/20 text-destructive", icon: <XCircle className="h-3 w-3" /> },
      banned: { color: "bg-destructive/20 text-destructive", icon: <XCircle className="h-3 w-3" /> },
      cancelled: { color: "bg-muted text-muted-foreground", icon: <XCircle className="h-3 w-3" /> },
      completed: { color: "bg-green-500/20 text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
      failed: { color: "bg-destructive/20 text-destructive", icon: <XCircle className="h-3 w-3" /> },
      processing: { color: "bg-blue-500/20 text-blue-400", icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
      paid: { color: "bg-green-500/20 text-green-400", icon: <CheckCircle2 className="h-3 w-3" /> },
    };
    const config = configs[status] || configs.pending;
    return (
      <Badge className={`${config.color} gap-1`}>
        {config.icon}
        {status}
      </Badge>
    );
  };

  const getProgramTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      standard: "bg-muted text-muted-foreground",
      madrinha: "bg-pink-500/20 text-pink-400",
      affiliate: "bg-blue-500/20 text-blue-400",
      partner: "bg-purple-500/20 text-purple-400",
    };
    return <Badge className={colors[type] || colors.standard}>{type}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Link2 className="h-6 w-6 text-primary" />
            Sistema de Referral
          </h1>
          <p className="text-muted-foreground">
            Gerencie programas de afiliados, comissões e payouts
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {loadingStats ? (
          Array(5).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="bg-gradient-to-br from-primary/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Afiliados
                </p>
                <p className="text-2xl font-bold">{stats?.total_affiliates || 0}</p>
                <p className="text-xs text-green-400">{stats?.active_affiliates || 0} ativos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MousePointerClick className="h-3 w-3" /> Cliques
                </p>
                <p className="text-2xl font-bold">{stats?.total_clicks || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <UserPlus className="h-3 w-3" /> Conversões
                </p>
                <p className="text-2xl font-bold">{stats?.total_conversions || 0}</p>
                <p className="text-xs text-muted-foreground">{stats?.conversion_rate || 0}% taxa</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Receita Gerada
                </p>
                <p className="text-2xl font-bold">R$ {(stats?.total_revenue || 0).toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-500/10 to-transparent">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Award className="h-3 w-3" /> Comissões Pendentes
                </p>
                <p className="text-2xl font-bold">R$ {(stats?.pending_commissions || 0).toFixed(2)}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Programas
          </TabsTrigger>
          <TabsTrigger value="network" className="gap-2">
            <Users className="h-4 w-4" />
            Rede
          </TabsTrigger>
          <TabsTrigger value="affiliates" className="gap-2">
            <Users className="h-4 w-4" />
            Afiliados
          </TabsTrigger>
          <TabsTrigger value="commissions" className="gap-2">
            <Percent className="h-4 w-4" />
            Comissões
          </TabsTrigger>
          <TabsTrigger value="payouts" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payouts
          </TabsTrigger>
        </TabsList>

        {/* Network Tab */}
        <TabsContent value="network" className="space-y-4">
          <AdminReferralNetworkTab />
        </TabsContent>

        {/* Programs Tab */}
        <TabsContent value="overview" className="space-y-4">
          <h2 className="text-lg font-semibold">Programas de Referral</h2>
          
          <ScrollArea className="h-[500px]">
            {loadingPrograms ? (
              <div className="space-y-3">
                {Array(3).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {programs?.map((program) => (
                  <Card key={program.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{program.name}</h3>
                          {getProgramTypeBadge(program.program_type)}
                          {program.is_active ? (
                            <Badge className="bg-green-500/20 text-green-400">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{program.description}</p>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Comissão</p>
                            <p className="font-medium">{program.commission_rate}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Recorrente</p>
                            <p className="font-medium">{program.recurring_commission ? 'Sim' : 'Não'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Níveis</p>
                            <p className="font-medium flex items-center gap-1">
                              <Layers className="h-3 w-3" />
                              {program.max_levels}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Mín. Saque</p>
                            <p className="font-medium">R$ {program.min_revenue_to_withdraw}</p>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={program.is_active}
                        onCheckedChange={(checked) => 
                          updateProgram.mutate({ id: program.id, is_active: checked })
                        }
                      />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Affiliates Tab */}
        <TabsContent value="affiliates" className="space-y-4">
          <h2 className="text-lg font-semibold">Afiliados Cadastrados</h2>
          
          <ScrollArea className="h-[500px]">
            {loadingAffiliates ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : affiliates?.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum afiliado cadastrado</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {affiliates?.map((affiliate) => (
                  <Card key={affiliate.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                            {affiliate.referral_code}
                          </code>
                          {getStatusBadge(affiliate.status)}
                          {getProgramTypeBadge(affiliate.referral_programs?.program_type || 'standard')}
                        </div>
                        <div className="flex items-center gap-6 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <MousePointerClick className="h-3 w-3" />
                            {affiliate.total_clicks} cliques
                          </span>
                          <span className="flex items-center gap-1">
                            <UserPlus className="h-3 w-3" />
                            {affiliate.total_signups} signups
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />
                            {affiliate.total_conversions} conversões
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            R$ {affiliate.total_commission_earned.toFixed(2)} ganho
                          </span>
                          <span className="text-amber-400">
                            R$ {affiliate.pending_commission.toFixed(2)} pendente
                          </span>
                        </div>
                      </div>
                      <Select
                        value={affiliate.status}
                        onValueChange={(value) => 
                          approveAffiliate.mutate({ 
                            id: affiliate.id, 
                            status: value as 'active' | 'suspended' | 'banned' 
                          })
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativo</SelectItem>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="suspended">Suspenso</SelectItem>
                          <SelectItem value="banned">Banido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Commissions Tab */}
        <TabsContent value="commissions" className="space-y-4">
          <h2 className="text-lg font-semibold">Comissões</h2>
          
          <ScrollArea className="h-[500px]">
            {loadingCommissions ? (
              <div className="space-y-3">
                {Array(10).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : commissions?.length === 0 ? (
              <Card className="p-8 text-center">
                <Percent className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma comissão registrada</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {commissions?.map((commission) => (
                  <Card key={commission.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-bold text-green-400">
                            +R$ {commission.commission_amount.toFixed(2)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {commission.commission_rate}% de R$ {commission.source_amount.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <Badge variant="outline">{commission.source_type}</Badge>
                          {commission.level > 1 && (
                            <Badge variant="secondary" className="ml-2">Nível {commission.level}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(commission.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </span>
                        {getStatusBadge(commission.status)}
                        {commission.status === 'pending' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-green-400"
                              onClick={() => approveCommission.mutate({ id: commission.id, status: 'approved' })}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-destructive"
                              onClick={() => approveCommission.mutate({ id: commission.id, status: 'cancelled' })}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts" className="space-y-4">
          <h2 className="text-lg font-semibold">Payouts</h2>
          
          <ScrollArea className="h-[500px]">
            {loadingPayouts ? (
              <div className="space-y-3">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : payouts?.length === 0 ? (
              <Card className="p-8 text-center">
                <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum payout solicitado</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {payouts?.map((payout) => (
                  <Card key={payout.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-bold text-lg">R$ {payout.net_amount.toFixed(2)}</p>
                          {getStatusBadge(payout.status)}
                          <Badge variant="outline">{payout.payout_method}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {payout.commissions_count} comissões • 
                          Taxa: R$ {payout.fee.toFixed(2)} • 
                          {format(new Date(payout.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </p>
                        {payout.transaction_id && (
                          <p className="text-xs text-muted-foreground mt-1">
                            TX: {payout.transaction_id}
                          </p>
                        )}
                      </div>
                      {payout.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => processPayout.mutate({ id: payout.id, status: 'completed' })}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => processPayout.mutate({ id: payout.id, status: 'failed' })}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
