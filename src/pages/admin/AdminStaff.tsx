import { useState } from "react";
import { 
  UserPlus, 
  MoreHorizontal, 
  Shield, 
  ShieldCheck,
  Trash2,
  Edit,
  MapPin,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { 
  useAdminStaff, 
  useCreateStaffMember, 
  useToggleStaffStatus, 
  useRemoveStaffMember,
  useStaffStats,
  type StaffRole,
  type StaffPermissions 
} from "@/hooks/useAdminStaff";

interface NewStaffForm {
  name: string;
  email: string;
  role: StaffRole;
  permissions: StaffPermissions;
  region: string;
}

const defaultPermissions: StaffPermissions = {
  financialAccess: false,
  contentModeration: true,
  supportAccess: true,
  systemSettings: false,
};

export default function AdminStaff() {
  // Hooks com dados reais
  const { data: staffMembers = [], isLoading } = useAdminStaff();
  const createStaff = useCreateStaffMember();
  const toggleStatus = useToggleStaffStatus();
  const removeStaff = useRemoveStaffMember();
  const stats = useStaffStats();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<NewStaffForm>({
    name: '',
    email: '',
    role: 'moderator',
    permissions: { ...defaultPermissions },
    region: '',
  });

  const handleCreateStaff = async () => {
    if (!formData.name || !formData.email) {
      return;
    }

    createStaff.mutate({
      name: formData.name,
      email: formData.email,
      role: formData.role,
      permissions: formData.permissions,
      region: formData.region || undefined,
    }, {
      onSuccess: () => {
        setShowCreateModal(false);
        setFormData({
          name: '',
          email: '',
          role: 'moderator',
          permissions: { ...defaultPermissions },
          region: '',
        });
      }
    });
  };

  const handleToggleStatus = (staffId: string, currentStatus: boolean) => {
    toggleStatus.mutate({ id: staffId, is_active: !currentStatus });
  };

  const handleRemoveStaff = (staffId: string) => {
    removeStaff.mutate(staffId);
  };

  const getRoleBadge = (role: StaffRole) => {
    switch (role) {
      case 'admin_master':
        return <Badge className="bg-destructive/20 text-destructive border-destructive/30">Master</Badge>;
      case 'admin_regional':
        return <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">Regional</Badge>;
      case 'moderator':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Moderador</Badge>;
      default:
        return null;
    }
  };

  const getPermissionsList = (permissions: StaffPermissions) => {
    const list = [];
    if (permissions.financialAccess) list.push('Financeiro');
    if (permissions.contentModeration) list.push('Moderação');
    if (permissions.supportAccess) list.push('Suporte');
    if (permissions.systemSettings) list.push('Sistema');
    return list.length > 0 ? list.join(', ') : 'Nenhuma';
  };

  const updatePermission = (key: keyof StaffPermissions, value: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: value,
      },
    }));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipe Administrativa</h1>
          <p className="text-muted-foreground">
            {isLoading ? (
              <Skeleton className="h-4 w-32 inline-block" />
            ) : (
              `${staffMembers.length} membros na equipe`
            )}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Criar Novo Administrador
        </Button>
      </div>

      {/* Role Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/20">
                <Shield className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admin Master</p>
                <p className="text-xl font-bold">
                  {isLoading ? <Skeleton className="h-6 w-8" /> : stats.masters}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/20">
                <ShieldCheck className="h-5 w-5 text-[hsl(45,93%,47%)]" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Admin Regional</p>
                <p className="text-xl font-bold">
                  {isLoading ? <Skeleton className="h-6 w-8" /> : stats.regionals}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Moderadores</p>
                <p className="text-xl font-bold">
                  {isLoading ? <Skeleton className="h-6 w-8" /> : stats.moderators}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Staff Table */}
      <Card className="bg-card border-border/50">
        <CardHeader className="pb-0">
          <CardTitle className="text-lg">Lista de Administradores</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-32" />
                  <Skeleton className="h-10 w-48" />
                  <Skeleton className="h-10 w-24" />
                  <Skeleton className="h-10 flex-1" />
                </div>
              ))}
            </div>
          ) : staffMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mb-3 opacity-30" />
              <p>Nenhum administrador cadastrado</p>
              <p className="text-sm">Clique em "Criar Novo Administrador" para começar</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Região</TableHead>
                  <TableHead>Permissões</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffMembers.map((staff) => (
                  <TableRow key={staff.id} className="border-border/50">
                    <TableCell className="font-medium">{staff.name}</TableCell>
                    <TableCell className="text-muted-foreground">{staff.email}</TableCell>
                    <TableCell>{getRoleBadge(staff.role)}</TableCell>
                    <TableCell>
                      {staff.region ? (
                        <div className="flex items-center gap-1 text-sm">
                          <MapPin className="h-3 w-3" />
                          {staff.region}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Global</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {getPermissionsList(staff.permissions)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {staff.is_active ? (
                        <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border-border">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Mais opções">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem className="gap-2">
                            <Edit className="h-4 w-4" />
                            Editar Permissões
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="gap-2"
                            onClick={() => handleToggleStatus(staff.id, staff.is_active)}
                            disabled={toggleStatus.isPending}
                          >
                            {toggleStatus.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            {staff.is_active ? 'Desativar Acesso' : 'Ativar Acesso'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => handleRemoveStaff(staff.id)}
                            disabled={removeStaff.isPending}
                          >
                            {removeStaff.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Staff Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Criar Novo Administrador
            </DialogTitle>
            <DialogDescription>
              Adicione um novo membro à equipe administrativa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome Completo *</Label>
              <Input
                placeholder="Nome do administrador"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="email@oculto.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select
                value={formData.role}
                onValueChange={(v) => setFormData(prev => ({ ...prev, role: v as StaffRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_regional">Admin Regional</SelectItem>
                  <SelectItem value="moderator">Moderador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Região (opcional)</Label>
              <Input
                placeholder="Ex: São Paulo - Capital"
                value={formData.region}
                onChange={(e) => setFormData(prev => ({ ...prev, region: e.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <Label>Permissões</Label>
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="financial"
                    checked={formData.permissions.financialAccess}
                    onCheckedChange={(checked) => updatePermission('financialAccess', !!checked)}
                  />
                  <Label htmlFor="financial" className="font-normal cursor-pointer">
                    Acesso Financeiro (Ver Ganhos)
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="moderation"
                    checked={formData.permissions.contentModeration}
                    onCheckedChange={(checked) => updatePermission('contentModeration', !!checked)}
                  />
                  <Label htmlFor="moderation" className="font-normal cursor-pointer">
                    Moderação de Conteúdo (Banir Usuários/Posts)
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="support"
                    checked={formData.permissions.supportAccess}
                    onCheckedChange={(checked) => updatePermission('supportAccess', !!checked)}
                  />
                  <Label htmlFor="support" className="font-normal cursor-pointer">
                    Suporte (Ver Tickets)
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="system"
                    checked={formData.permissions.systemSettings}
                    onCheckedChange={(checked) => updatePermission('systemSettings', !!checked)}
                  />
                  <Label htmlFor="system" className="font-normal cursor-pointer">
                    Configurações do Sistema
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateStaff}
              disabled={createStaff.isPending || !formData.name || !formData.email}
            >
              {createStaff.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Administrador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
