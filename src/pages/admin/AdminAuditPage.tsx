import { useState } from "react";
import { 
  Shield, 
  Search,
  User,
  Ban,
  CheckCircle2,
  Settings,
  Ticket,
  DollarSign,
  Clock,
  Filter,
  Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs, type AuditLog, type AuditActionType } from "@/hooks/useAudit";
import { cn } from "@/lib/utils";

const actionConfig: Record<AuditActionType, { label: string; icon: React.ReactNode; color: string }> = {
  user_banned: { 
    label: 'Usuário Banido', 
    icon: <Ban className="h-4 w-4" />, 
    color: 'text-destructive bg-destructive/10' 
  },
  user_unbanned: { 
    label: 'Usuário Desbanido', 
    icon: <User className="h-4 w-4" />, 
    color: 'text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/10' 
  },
  user_verified: { 
    label: 'Usuário Verificado', 
    icon: <CheckCircle2 className="h-4 w-4" />, 
    color: 'text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/10' 
  },
  user_unverified: { 
    label: 'Verificação Removida', 
    icon: <User className="h-4 w-4" />, 
    color: 'text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10' 
  },
  user_impersonated: { 
    label: 'Impersonificação Iniciada', 
    icon: <Eye className="h-4 w-4" />, 
    color: 'text-orange-500 bg-orange-500/10' 
  },
  impersonation_ended: { 
    label: 'Impersonificação Encerrada', 
    icon: <Eye className="h-4 w-4" />, 
    color: 'text-blue-500 bg-blue-500/10' 
  },
  role_assigned: { 
    label: 'Permissão Concedida', 
    icon: <Shield className="h-4 w-4" />, 
    color: 'text-primary bg-primary/10' 
  },
  role_removed: { 
    label: 'Permissão Removida', 
    icon: <Shield className="h-4 w-4" />, 
    color: 'text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10' 
  },
  setting_changed: { 
    label: 'Configuração Alterada', 
    icon: <Settings className="h-4 w-4" />, 
    color: 'text-secondary bg-secondary/10' 
  },
  ticket_resolved: { 
    label: 'Chamado Resolvido', 
    icon: <Ticket className="h-4 w-4" />, 
    color: 'text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/10' 
  },
  ticket_closed: { 
    label: 'Chamado Fechado', 
    icon: <Ticket className="h-4 w-4" />, 
    color: 'text-muted-foreground bg-muted' 
  },
  coupon_deactivated: { 
    label: 'Cupom Desativado', 
    icon: <Ticket className="h-4 w-4" />, 
    color: 'text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10' 
  },
  withdrawal_approved: { 
    label: 'Saque Aprovado', 
    icon: <DollarSign className="h-4 w-4" />, 
    color: 'text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/10' 
  },
  withdrawal_rejected: { 
    label: 'Saque Rejeitado', 
    icon: <DollarSign className="h-4 w-4" />, 
    color: 'text-destructive bg-destructive/10' 
  },
  feedback_updated: { 
    label: 'Feedback Atualizado', 
    icon: <Ticket className="h-4 w-4" />, 
    color: 'text-primary bg-primary/10' 
  },
  staff_created: { 
    label: 'Staff Criado', 
    icon: <User className="h-4 w-4" />, 
    color: 'text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/10' 
  },
  staff_updated: { 
    label: 'Staff Atualizado', 
    icon: <Settings className="h-4 w-4" />, 
    color: 'text-secondary bg-secondary/10' 
  },
  staff_activated: { 
    label: 'Staff Ativado', 
    icon: <CheckCircle2 className="h-4 w-4" />, 
    color: 'text-[hsl(142,76%,36%)] bg-[hsl(142,76%,36%)]/10' 
  },
  staff_deactivated: { 
    label: 'Staff Desativado', 
    icon: <Ban className="h-4 w-4" />, 
    color: 'text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10' 
  },
  staff_removed: { 
    label: 'Staff Removido', 
    icon: <User className="h-4 w-4" />, 
    color: 'text-destructive bg-destructive/10' 
  },
  // Ações sensíveis durante impersonificação
  sensitive_route_accessed: { 
    label: 'Rota Sensível Acessada', 
    icon: <Eye className="h-4 w-4" />, 
    color: 'text-orange-500 bg-orange-500/10' 
  },
  messages_viewed: { 
    label: 'Mensagens Visualizadas', 
    icon: <Eye className="h-4 w-4" />, 
    color: 'text-red-500 bg-red-500/10' 
  },
  financial_data_viewed: { 
    label: 'Dados Financeiros Visualizados', 
    icon: <DollarSign className="h-4 w-4" />, 
    color: 'text-orange-500 bg-orange-500/10' 
  },
  private_media_viewed: { 
    label: 'Mídia Privada Visualizada', 
    icon: <Eye className="h-4 w-4" />, 
    color: 'text-purple-500 bg-purple-500/10' 
  },
  // Ações de sistema (FASE 1)
  system_broadcast: { 
    label: 'Broadcast do Sistema', 
    icon: <Settings className="h-4 w-4" />, 
    color: 'text-destructive bg-destructive/10' 
  },
  flash_sale_activated: { 
    label: 'Flash Sale Ativada', 
    icon: <DollarSign className="h-4 w-4" />, 
    color: 'text-[hsl(45,93%,47%)] bg-[hsl(45,93%,47%)]/10' 
  },
  flash_sale_deactivated: { 
    label: 'Flash Sale Desativada', 
    icon: <DollarSign className="h-4 w-4" />, 
    color: 'text-muted-foreground bg-muted' 
  },
  ab_test_created: { 
    label: 'Teste A/B Criado', 
    icon: <Settings className="h-4 w-4" />, 
    color: 'text-blue-500 bg-blue-500/10' 
  },
  ab_test_updated: { 
    label: 'Teste A/B Atualizado', 
    icon: <Settings className="h-4 w-4" />, 
    color: 'text-blue-500 bg-blue-500/10' 
  },
  waitlist_exported: { 
    label: 'Waitlist Exportada', 
    icon: <User className="h-4 w-4" />, 
    color: 'text-secondary bg-secondary/10' 
  },
};

export default function AdminAuditPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const { data: logs, isLoading } = useAuditLogs(100);

  const filteredLogs = (logs || []).filter(log => {
    const matchesSearch = 
      log.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target_resource?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      JSON.stringify(log.details || {}).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;

    return matchesSearch && matchesAction;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDetails = (details: Record<string, unknown> | null) => {
    if (!details) return '-';
    
    const entries = Object.entries(details);
    if (entries.length === 0) return '-';

    return entries.map(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `${formattedKey}: ${typeof value === 'object' ? JSON.stringify(value) : value}`;
    }).join(', ');
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Logs de Auditoria
        </h1>
        <p className="text-muted-foreground">
          Histórico de ações administrativas na plataforma
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nos logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(actionConfig).map(([key, config]) => (
              <SelectItem key={key} value={key}>{config.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Total (24h)</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logs?.filter(l => new Date(l.created_at) > new Date(Date.now() - 24*60*60*1000)).length || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <Ban className="h-4 w-4" />
              <span className="text-sm">Banimentos</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logs?.filter(l => l.action_type === 'user_banned').length || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-[hsl(142,76%,36%)]/5 border-[hsl(142,76%,36%)]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[hsl(142,76%,36%)]">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Verificações</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logs?.filter(l => l.action_type === 'user_verified').length || 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-primary">
              <Shield className="h-4 w-4" />
              <span className="text-sm">Permissões</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {logs?.filter(l => l.action_type.includes('role')).length || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Logs Table */}
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Timeline de Ações</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum log encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Admin</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const config = actionConfig[log.action_type as AuditActionType] || {
                      label: log.action_type,
                      icon: <Settings className="h-4 w-4" />,
                      color: 'text-muted-foreground bg-muted',
                    };

                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={log.admin_profile?.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">
                                {log.admin_profile?.name?.charAt(0) || 'A'}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium truncate max-w-[120px]">
                              {log.admin_profile?.name || 'Admin'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1", config.color)}>
                            {config.icon}
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.target_resource || '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {formatDetails(log.details)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
