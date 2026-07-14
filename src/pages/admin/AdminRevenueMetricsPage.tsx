import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  BarChart3, 
  Download, 
  FileSpreadsheet, 
  Search, 
  DollarSign,
  Users,
  TrendingUp,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { useRevenueMetrics, useAllUsersWithEmail, useConversionMetrics } from "@/hooks/useRevenueMetrics";
import { PlanDistributionChart } from "@/components/admin/PlanDistributionChart";
import { ConversionFunnelChart } from "@/components/admin/ConversionFunnelChart";
import { RevenueProjectionCard } from "@/components/admin/RevenueProjectionCard";
import { exportToCSV, exportToExcel, userBillingExportColumns } from "@/lib/exportUtils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminRevenueMetricsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  
  const { data: metrics, isLoading: loadingMetrics, refetch: refetchMetrics } = useRevenueMetrics();
  const { data: allUsers, isLoading: loadingUsers } = useAllUsersWithEmail();
  const { data: conversion } = useConversionMetrics();

  const formatCurrency = (value: number | null | undefined) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

  const handleExportCSV = () => {
    if (!allUsers || allUsers.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    exportToCSV(allUsers, 'usuarios_billing', userBillingExportColumns);
    toast.success("Arquivo CSV exportado com sucesso!");
  };

  const handleExportExcel = () => {
    if (!allUsers || allUsers.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    exportToExcel(allUsers, 'usuarios_billing', userBillingExportColumns);
    toast.success("Arquivo Excel exportado com sucesso!");
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-revenue-metrics'] });
    queryClient.invalidateQueries({ queryKey: ['admin-plan-distribution'] });
    queryClient.invalidateQueries({ queryKey: ['admin-all-users-with-email'] });
    queryClient.invalidateQueries({ queryKey: ['admin-revenue-timeline'] });
    toast.success("Dados atualizados!");
  };

  // Filtrar usuários pela busca
  const filteredUsers = (allUsers || []).filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.username?.toLowerCase().includes(query)
    );
  }).slice(0, 20); // Limitar a 20 resultados na tabela

  const getPlanBadge = (planType: string | null) => {
    switch (planType) {
      case 'vip':
        return <Badge className="bg-[hsl(45,93%,47%)] text-black">VIP</Badge>;
      case 'premium':
      case 'monthly':
        return <Badge className="bg-primary">Premium</Badge>;
      default:
        return <Badge variant="secondary">Gratuito</Badge>;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'overdue':
        return <Badge variant="destructive">Em Atraso</Badge>;
      case 'suspended':
        return <Badge variant="outline" className="text-destructive">Suspenso</Badge>;
      default:
        return <Badge variant="outline" className="text-green-600">Ativo</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Métricas de Receita</h1>
            <p className="text-muted-foreground">Dashboard financeiro e análise de conversão</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Exportar Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receita Total</p>
                {loadingMetrics ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(metrics?.total_revenue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Receita Mensal</p>
                {loadingMetrics ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(metrics?.monthly_revenue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">MRR Estimado</p>
                {loadingMetrics ? (
                  <Skeleton className="h-7 w-24" />
                ) : (
                  <p className="text-2xl font-bold">{formatCurrency(metrics?.mrr_estimate)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/10">
                <Users className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Usuários Pagantes</p>
                {loadingMetrics ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold">{metrics?.paid_users || 0}</p>
                    <span className="text-xs text-muted-foreground">
                      ({conversion?.conversionRate?.toFixed(1) || 0}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-4">
        <PlanDistributionChart />
        <ConversionFunnelChart />
      </div>

      {/* Revenue Projection */}
      <div className="grid grid-cols-2 gap-4">
        <RevenueProjectionCard />
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Lista de Usuários
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou @username"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-80"
              />
            </div>
            <Badge variant="outline">{allUsers?.length || 0} usuários</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {searchQuery ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          <div>
                            <p>{user.name || 'Sem nome'}</p>
                            {user.username && (
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{user.email || '-'}</TableCell>
                        <TableCell>{getPlanBadge(user.plan_type)}</TableCell>
                        <TableCell>{getStatusBadge(user.payment_status)}</TableCell>
                        <TableCell>
                          {user.payment_due_date 
                            ? new Date(user.payment_due_date).toLocaleDateString('pt-BR')
                            : '-'
                          }
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(user.balance)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          
          {filteredUsers.length === 20 && (
            <p className="text-xs text-muted-foreground text-center mt-4">
              Mostrando os primeiros 20 resultados. Use a busca para refinar.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}