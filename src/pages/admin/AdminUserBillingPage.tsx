import { useState, useEffect } from 'react';
import { 
  Search, 
  CreditCard, 
  Crown, 
  Star, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  XCircle,
  Calendar,
  Wallet,
  Lock,
  Unlock,
  History,
  Sparkles,
  RotateCcw,
  Plus,
  Download,
  FileSpreadsheet,
  Mail,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  useSearchUsersForBilling,
  useUserBillingById,
  useUpdateUserBilling,
  useGrantVipAccess,
  useResetToFreePlan,
  useMarkAsPaid,
  useExtendPaymentDueDate,
  useUserBillingHistory,
  UserBillingData,
} from '@/hooks/useAdminUserBilling';
import { useAllUsersWithEmail } from '@/hooks/useRevenueMetrics';
import { exportToCSV, exportToExcel, userBillingExportColumns } from '@/lib/exportUtils';

export default function AdminUserBillingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  // Form state
  const [editedPlanType, setEditedPlanType] = useState<'free' | 'premium' | 'vip'>('free');
  const [editedPaymentStatus, setEditedPaymentStatus] = useState<'active' | 'overdue' | 'suspended'>('active');
  const [editedDueDate, setEditedDueDate] = useState<Date | undefined>(undefined);
  const [editedIsCreator, setEditedIsCreator] = useState(false);
  const [editedIsVerified, setEditedIsVerified] = useState(false);
  const [editedBalance, setEditedBalance] = useState('0');
  const [editedBalanceFrozen, setEditedBalanceFrozen] = useState(false);

  // Queries
  const { data: searchResults, isLoading: isSearching } = useSearchUsersForBilling(debouncedQuery);
  const { data: selectedUser, isLoading: isLoadingUser } = useUserBillingById(selectedUserId);
  const { data: billingHistory } = useUserBillingHistory(selectedUserId);
  const { data: allUsers } = useAllUsersWithEmail();

  // Mutations
  const updateBilling = useUpdateUserBilling();
  const grantVip = useGrantVipAccess();
  const resetToFree = useResetToFreePlan();
  const markAsPaid = useMarkAsPaid();
  const extendDueDate = useExtendPaymentDueDate();

  // Export handlers
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

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Update form when user is selected
  useEffect(() => {
    if (selectedUser) {
      setEditedPlanType(selectedUser.plan_type);
      setEditedPaymentStatus(selectedUser.payment_status);
      setEditedDueDate(selectedUser.payment_due_date ? parseISO(selectedUser.payment_due_date) : undefined);
      setEditedIsCreator(selectedUser.is_creator);
      setEditedIsVerified(selectedUser.is_verified);
      setEditedBalance(selectedUser.balance.toString());
      setEditedBalanceFrozen(selectedUser.balance_frozen);
    }
  }, [selectedUser]);

  const handleSelectUser = (user: UserBillingData) => {
    setSelectedUserId(user.id);
    setSearchQuery('');
    setDebouncedQuery('');
  };

  const handleSaveChanges = () => {
    if (!selectedUserId) return;

    const updates: Partial<UserBillingData> = {};
    
    if (editedPlanType !== selectedUser?.plan_type) updates.plan_type = editedPlanType;
    if (editedPaymentStatus !== selectedUser?.payment_status) updates.payment_status = editedPaymentStatus;
    if (editedDueDate?.toISOString() !== selectedUser?.payment_due_date) {
      updates.payment_due_date = editedDueDate?.toISOString() || null;
    }
    if (editedIsCreator !== selectedUser?.is_creator) updates.is_creator = editedIsCreator;
    if (editedIsVerified !== selectedUser?.is_verified) updates.is_verified = editedIsVerified;
    
    const newBalance = parseFloat(editedBalance) || 0;
    if (newBalance !== selectedUser?.balance) updates.balance = newBalance;
    if (editedBalanceFrozen !== selectedUser?.balance_frozen) updates.balance_frozen = editedBalanceFrozen;

    if (Object.keys(updates).length > 0) {
      updateBilling.mutate({ userId: selectedUserId, updates });
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'vip':
        return <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white"><Crown className="h-3 w-3 mr-1" /> VIP</Badge>;
      case 'premium':
      case 'monthly':
        return <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"><Star className="h-3 w-3 mr-1" /> Premium</Badge>;
      default:
        return <Badge variant="secondary"><User className="h-3 w-3 mr-1" /> Free</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-500 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" /> Ativo</Badge>;
      case 'overdue':
        return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30"><AlertTriangle className="h-3 w-3 mr-1" /> Em Atraso</Badge>;
      case 'suspended':
        return <Badge className="bg-red-500/20 text-red-500 border-red-500/30"><XCircle className="h-3 w-3 mr-1" /> Suspenso</Badge>;
      default:
        return null;
    }
  };

  const hasChanges = selectedUser && (
    editedPlanType !== selectedUser.plan_type ||
    editedPaymentStatus !== selectedUser.payment_status ||
    editedDueDate?.toISOString() !== selectedUser.payment_due_date ||
    editedIsCreator !== selectedUser.is_creator ||
    editedIsVerified !== selectedUser.is_verified ||
    parseFloat(editedBalance) !== selectedUser.balance ||
    editedBalanceFrozen !== selectedUser.balance_frozen
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Gerenciamento de Billing</h1>
            <p className="text-muted-foreground">Gerencie planos, pagamentos e status de usuários</p>
          </div>
        </div>
        
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Section */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              Buscar Usuário
            </CardTitle>
            <CardDescription>
              Busque por email, nome ou @username
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Digite para buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Search Results */}
            {debouncedQuery.length >= 2 && (
              <ScrollArea className="h-[300px]">
                {isSearching ? (
                  <div className="text-center text-muted-foreground py-4">Buscando...</div>
                ) : searchResults && searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                          "hover:bg-muted/50 border border-transparent hover:border-border",
                          selectedUserId === user.id && "bg-primary/10 border-primary/30"
                        )}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatar_url || ''} />
                          <AvatarFallback>{user.name?.[0] || 'U'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{user.name || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground truncate">@{user.username || 'sem-username'}</p>
                        </div>
                        {getPlanBadge(user.plan_type)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-4">Nenhum usuário encontrado</div>
                )}
              </ScrollArea>
            )}

            {/* Selected User Preview */}
            {selectedUser && (
              <div className="pt-4 border-t">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={selectedUser.avatar_url || ''} />
                    <AvatarFallback>{selectedUser.name?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">{selectedUser.name}</p>
                    <p className="text-sm text-muted-foreground">@{selectedUser.username || 'sem-username'}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {getPlanBadge(selectedUser.plan_type)}
                  {getStatusBadge(selectedUser.payment_status)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Editar Configurações</CardTitle>
            <CardDescription>
              {selectedUser 
                ? `Editando: ${selectedUser.name || selectedUser.username || 'Usuário'}`
                : 'Selecione um usuário para editar'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedUser ? (
              <div className="space-y-6">
                {/* Plan & Status Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Plan Type */}
                  <div className="space-y-2">
                    <Label>Plano de Assinatura</Label>
                    <Select value={editedPlanType} onValueChange={(v) => setEditedPlanType(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="free">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" /> Free
                          </div>
                        </SelectItem>
                        <SelectItem value="premium">
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-purple-500" /> Premium
                          </div>
                        </SelectItem>
                        <SelectItem value="vip">
                          <div className="flex items-center gap-2">
                            <Crown className="h-4 w-4 text-amber-500" /> VIP
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Status */}
                  <div className="space-y-2">
                    <Label>Status de Pagamento</Label>
                    <Select value={editedPaymentStatus} onValueChange={(v) => setEditedPaymentStatus(v as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500" /> Ativo
                          </div>
                        </SelectItem>
                        <SelectItem value="overdue">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" /> Em Atraso
                          </div>
                        </SelectItem>
                        <SelectItem value="suspended">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-500" /> Suspenso
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Due Date Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data de Vencimento</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !editedDueDate && "text-muted-foreground"
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4" />
                          {editedDueDate ? format(editedDueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Sem data definida"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={editedDueDate}
                          onSelect={setEditedDueDate}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label>Estender Vencimento</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => extendDueDate.mutate({ userId: selectedUser.id, months: 1 })}
                        disabled={extendDueDate.isPending}
                      >
                        <Plus className="h-4 w-4 mr-1" /> 1 mês
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => extendDueDate.mutate({ userId: selectedUser.id, months: 12 })}
                        disabled={extendDueDate.isPending}
                      >
                        <Plus className="h-4 w-4 mr-1" /> 12 meses
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Toggles Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between space-x-2 p-3 rounded-lg border">
                    <Label htmlFor="is-creator" className="text-sm">Criador</Label>
                    <Switch
                      id="is-creator"
                      checked={editedIsCreator}
                      onCheckedChange={setEditedIsCreator}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2 p-3 rounded-lg border">
                    <Label htmlFor="is-verified" className="text-sm">Verificado</Label>
                    <Switch
                      id="is-verified"
                      checked={editedIsVerified}
                      onCheckedChange={setEditedIsVerified}
                    />
                  </div>
                  <div className="flex items-center justify-between space-x-2 p-3 rounded-lg border">
                    <Label htmlFor="balance-frozen" className="text-sm">Saldo Congelado</Label>
                    <Switch
                      id="balance-frozen"
                      checked={editedBalanceFrozen}
                      onCheckedChange={setEditedBalanceFrozen}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Saldo (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editedBalance}
                      onChange={(e) => setEditedBalance(e.target.value)}
                      className="h-9"
                    />
                  </div>
                </div>

                <Separator />

                {/* Quick Actions */}
                <div className="space-y-3">
                  <Label>Ações Rápidas</Label>
                  <div className="flex flex-wrap gap-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="default" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                          <Sparkles className="h-4 w-4 mr-2" />
                          Conceder VIP 12 meses
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Conceder VIP?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso irá atualizar o plano para VIP, definir status como ativo e estender o vencimento por 12 meses.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => grantVip.mutate({ userId: selectedUser.id, months: 12 })}
                            className="bg-gradient-to-r from-amber-500 to-orange-500"
                          >
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button
                      variant="outline"
                      className="border-green-500/30 text-green-500 hover:bg-green-500/10"
                      onClick={() => markAsPaid.mutate(selectedUser.id)}
                      disabled={markAsPaid.isPending || selectedUser.payment_status === 'active'}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Marcar como Pago
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Resetar para Free
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Resetar para Free?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso irá remover o plano atual, definir como Free e limpar a data de vencimento.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => resetToFree.mutate(selectedUser.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Confirmar Reset
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* Save Button */}
                {hasChanges && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      onClick={handleSaveChanges}
                      disabled={updateBilling.isPending}
                    >
                      {updateBilling.isPending ? 'Salvando...' : 'Salvar Alterações'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhum usuário selecionado</p>
                <p className="text-sm">Use a busca para encontrar um usuário</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* History Section */}
      {selectedUser && billingHistory && billingHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Alterações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {billingHistory.map((entry: any) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <History className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {entry.action_type === 'billing_update' && 'Billing atualizado'}
                      {entry.action_type === 'plan_granted' && 'Plano concedido'}
                      {entry.action_type === 'plan_reset' && 'Plano resetado'}
                      {entry.action_type === 'payment_marked' && 'Pagamento marcado'}
                      {entry.action_type === 'due_date_extended' && 'Vencimento estendido'}
                    </p>
                    <p className="text-xs text-muted-foreground">{entry.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Por: {entry.performer?.name || 'Admin'} • {format(parseISO(entry.created_at), "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
