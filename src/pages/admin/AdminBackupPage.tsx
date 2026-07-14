import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { 
  Database, 
  Download, 
  Calendar, 
  Clock, 
  HardDrive, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Plus, 
  Trash2,
  RotateCcw,
  Play,
  Pause,
  AlertTriangle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useBackupStats,
  useBackupSchedules,
  useBackupHistory,
  useCreateBackup,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useRestoreBackup,
  useBackupDownloadUrl,
  useDeleteBackup,
  BackupSchedule,
  BackupHistory
} from "@/hooks/useBackupSystem";

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function AdminBackupPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showNewSchedule, setShowNewSchedule] = useState(false);
  const [showManualBackup, setShowManualBackup] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupHistory | null>(null);
  const [restoreCode, setRestoreCode] = useState("");
  const [includeMedia, setIncludeMedia] = useState(false);
  const [includeMessages, setIncludeMessages] = useState(true);

  // Dados
  const { data: stats } = useBackupStats();
  const { data: schedules = [] } = useBackupSchedules();
  const { data: history = [] } = useBackupHistory();

  // Mutations
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const createManualBackup = useCreateBackup();
  const restoreBackup = useRestoreBackup();
  const deleteBackup = useDeleteBackup();
  const getDownloadUrl = useBackupDownloadUrl();

  // Form state para novo agendamento
  const [newSchedule, setNewSchedule] = useState<{
    name: string;
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
    time_of_day: string;
    day_of_week: number | null;
    day_of_month: number | null;
    include_media: boolean;
    include_messages: boolean;
    retention_days: number;
    is_active: boolean;
    next_run_at: string | null;
    created_by: string | null;
  }>({
    name: "",
    frequency: "daily",
    time_of_day: "03:00",
    day_of_week: null,
    day_of_month: null,
    include_media: false,
    include_messages: true,
    retention_days: 30,
    is_active: true,
    next_run_at: null,
    created_by: null
  });

  const handleCreateSchedule = () => {
    createSchedule.mutate(newSchedule, {
      onSuccess: () => {
        setShowNewSchedule(false);
        setNewSchedule({
          name: "",
          frequency: "daily",
          time_of_day: "03:00",
          day_of_week: null,
          day_of_month: null,
          include_media: false,
          include_messages: true,
          retention_days: 30,
          is_active: true,
          next_run_at: null,
          created_by: null
        });
      }
    });
  };

  const handleManualBackup = () => {
    createManualBackup.mutate({
      include_media: includeMedia,
      include_messages: includeMessages
    }, {
      onSuccess: () => setShowManualBackup(false)
    });
  };

  const handleRestore = () => {
    if (selectedBackup) {
      restoreBackup.mutate({
        backup_id: selectedBackup.id,
        confirmation_code: restoreCode
      }, {
        onSuccess: () => {
          setShowRestoreDialog(false);
          setSelectedBackup(null);
          setRestoreCode("");
        }
      });
    }
  };

  const handleDownload = async (backup: BackupHistory) => {
    if (backup.storage_path) {
      getDownloadUrl.mutate(backup.storage_path, {
        onSuccess: (url) => {
          window.open(url, '_blank');
        }
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-primary/20 text-primary"><CheckCircle2 className="h-3 w-3 mr-1" /> Concluído</Badge>;
      case 'running':
      case 'in_progress':
        return <Badge className="bg-accent/20 text-accent-foreground"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Em Progresso</Badge>;
      case 'failed':
        return <Badge className="bg-destructive/20 text-destructive"><XCircle className="h-3 w-3 mr-1" /> Falhou</Badge>;
      case 'pending':
        return <Badge className="bg-muted text-muted-foreground"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Sistema de Backup
          </h1>
          <p className="text-muted-foreground">Gerencie backups e restaurações do sistema</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showManualBackup} onOpenChange={setShowManualBackup}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Backup Manual
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Backup Manual</DialogTitle>
                <DialogDescription>
                  Inicie um backup imediato do banco de dados
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  <Label>Incluir mídia</Label>
                  <Switch checked={includeMedia} onCheckedChange={setIncludeMedia} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Incluir mensagens</Label>
                  <Switch checked={includeMessages} onCheckedChange={setIncludeMessages} />
                </div>
                <div className="bg-muted/50 p-3 rounded-lg text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 inline mr-2" />
                  O backup será processado em segundo plano e pode levar alguns minutos.
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowManualBackup(false)}>Cancelar</Button>
                <Button onClick={handleManualBackup} disabled={createManualBackup.isPending}>
                  {createManualBackup.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Iniciar Backup
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Backups</p>
                <p className="text-2xl font-bold">{stats?.total_backups || 0}</p>
              </div>
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tamanho Total</p>
                <p className="text-2xl font-bold">{formatFileSize(stats?.total_size_bytes || 0)}</p>
              </div>
              <HardDrive className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Agendamentos Ativos</p>
                <p className="text-2xl font-bold">{stats?.active_schedules || 0}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Último Backup</p>
                <p className="text-2xl font-bold">
                  {stats?.last_backup_at 
                    ? formatDistanceToNow(new Date(stats.last_backup_at), { locale: ptBR, addSuffix: true })
                    : "Nunca"}
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="schedules">Agendamentos</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Próximos Backups */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Próximos Backups Agendados</CardTitle>
              </CardHeader>
              <CardContent>
                {schedules.filter(s => s.is_active).length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum agendamento ativo</p>
                ) : (
                  <div className="space-y-3">
                    {schedules.filter(s => s.is_active).slice(0, 5).map(schedule => (
                      <div key={schedule.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium">{schedule.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {schedule.next_run_at 
                              ? format(new Date(schedule.next_run_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : "Não agendado"}
                          </p>
                        </div>
                        <Badge variant="outline">{schedule.frequency}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Backups Recentes */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Backups Recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum backup realizado</p>
                ) : (
                  <div className="space-y-3">
                    {history.slice(0, 5).map(backup => (
                      <div key={backup.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium capitalize">{backup.backup_type}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(backup.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {backup.file_size_bytes && (
                            <span className="text-sm text-muted-foreground">
                              {formatFileSize(backup.file_size_bytes)}
                            </span>
                          )}
                          {getStatusBadge(backup.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showNewSchedule} onOpenChange={setShowNewSchedule}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Agendamento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Criar Agendamento</DialogTitle>
                  <DialogDescription>
                    Configure um novo agendamento de backup automático
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Nome do Agendamento</Label>
                    <Input 
                      value={newSchedule.name}
                      onChange={e => setNewSchedule(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Backup Diário Noturno"
                    />
                  </div>
                  <div>
                    <Label>Frequência</Label>
                    <Select 
                      value={newSchedule.frequency}
                      onValueChange={v => setNewSchedule(prev => ({ ...prev, frequency: v as 'daily' | 'weekly' | 'monthly' | 'custom' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diário</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Horário</Label>
                    <Input 
                      type="time"
                      value={newSchedule.time_of_day}
                      onChange={e => setNewSchedule(prev => ({ ...prev, time_of_day: e.target.value }))}
                    />
                  </div>
                  {newSchedule.frequency === 'weekly' && (
                    <div>
                      <Label>Dia da Semana</Label>
                      <Select 
                        value={String(newSchedule.day_of_week ?? 0)}
                        onValueChange={v => setNewSchedule(prev => ({ ...prev, day_of_week: Number(v) }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Domingo</SelectItem>
                          <SelectItem value="1">Segunda</SelectItem>
                          <SelectItem value="2">Terça</SelectItem>
                          <SelectItem value="3">Quarta</SelectItem>
                          <SelectItem value="4">Quinta</SelectItem>
                          <SelectItem value="5">Sexta</SelectItem>
                          <SelectItem value="6">Sábado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {newSchedule.frequency === 'monthly' && (
                    <div>
                      <Label>Dia do Mês</Label>
                      <Input 
                        type="number"
                        min={1}
                        max={28}
                        value={newSchedule.day_of_month ?? 1}
                        onChange={e => setNewSchedule(prev => ({ ...prev, day_of_month: Number(e.target.value) }))}
                      />
                    </div>
                  )}
                  <div>
                    <Label>Retenção (dias)</Label>
                    <Input 
                      type="number"
                      min={1}
                      value={newSchedule.retention_days}
                      onChange={e => setNewSchedule(prev => ({ ...prev, retention_days: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Incluir mídia</Label>
                    <Switch 
                      checked={newSchedule.include_media}
                      onCheckedChange={v => setNewSchedule(prev => ({ ...prev, include_media: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Incluir mensagens</Label>
                    <Switch 
                      checked={newSchedule.include_messages}
                      onCheckedChange={v => setNewSchedule(prev => ({ ...prev, include_messages: v }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNewSchedule(false)}>Cancelar</Button>
                  <Button onClick={handleCreateSchedule} disabled={!newSchedule.name || createSchedule.isPending}>
                    {createSchedule.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Próxima Execução</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum agendamento configurado
                    </TableCell>
                  </TableRow>
                ) : (
                  schedules.map(schedule => (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium">{schedule.name}</TableCell>
                      <TableCell className="capitalize">{schedule.frequency}</TableCell>
                      <TableCell>{schedule.time_of_day}</TableCell>
                      <TableCell>
                        {schedule.next_run_at 
                          ? format(new Date(schedule.next_run_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {schedule.is_active ? (
                          <Badge className="bg-primary/20 text-primary">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateSchedule.mutate({ 
                              id: schedule.id, 
                              is_active: !schedule.is_active 
                            })}
                          >
                            {schedule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteSchedule.mutate(schedule.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Iniciado em</TableHead>
                  <TableHead>Concluído em</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum backup no histórico
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map(backup => (
                    <TableRow key={backup.id}>
                      <TableCell className="capitalize font-medium">{backup.backup_type}</TableCell>
                      <TableCell>
                        {format(new Date(backup.started_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {backup.completed_at 
                          ? format(new Date(backup.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {backup.file_size_bytes ? formatFileSize(backup.file_size_bytes) : "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(backup.status)}</TableCell>
                      <TableCell className="text-right">
                        {backup.status === 'completed' && (
                          <div className="flex justify-end gap-2 items-center">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDownload(backup)}
                              disabled={getDownloadUrl.isPending}
                              className="gap-1.5"
                            >
                              {getDownloadUrl.isPending
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Download className="h-4 w-4" />
                              }
                              Baixar
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => {
                                setSelectedBackup(backup);
                                setShowRestoreDialog(true);
                              }}
                              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-sm"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Restaurar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm('Tem certeza que deseja excluir este backup permanentemente?')) {
                                  deleteBackup.mutate(backup);
                                }
                              }}
                              disabled={deleteBackup.isPending}
                              className="gap-1.5"
                            >
                              {deleteBackup.isPending
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />
                              }
                              Excluir
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Restore Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="max-w-md w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              ⚠️ Restaurar Backup — Ação Irreversível
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm pt-1">
                {selectedBackup && (
                  <div className="rounded-md border border-border bg-muted/50 p-3 space-y-1">
                    <p className="font-medium text-foreground text-xs uppercase tracking-wide">Backup selecionado</p>
                    <p className="text-muted-foreground">📅 {format(new Date(selectedBackup.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
                    <p className="text-muted-foreground">📦 Tipo: {selectedBackup.backup_type}</p>
                    <p className="text-muted-foreground">💾 Tamanho: {selectedBackup.file_size_bytes ? formatFileSize(selectedBackup.file_size_bytes) : "N/A"}</p>
                  </div>
                )}

                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <p className="font-semibold text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> O que acontecerá:
                  </p>
                  <ul className="space-y-1 text-muted-foreground list-none text-xs">
                    <li>• <strong className="text-foreground">Todos os dados atuais serão apagados</strong> e substituídos pelos dados deste backup</li>
                    <li>• Usuários, posts, mensagens e configurações serão revertidos</li>
                    <li>• Sessões ativas podem ser encerradas</li>
                  </ul>
                </div>

                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-amber-600 dark:text-amber-400 text-xs">
                    ✅ Um <strong>backup de segurança</strong> do estado atual será criado automaticamente antes da restauração.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="font-medium">Código de Confirmação</Label>
              <p className="text-xs text-muted-foreground mb-2">Digite <strong>RESTAURAR</strong> para confirmar</p>
              <Input 
                value={restoreCode}
                onChange={e => setRestoreCode(e.target.value.toUpperCase())}
                placeholder="Digite RESTAURAR"
                className="border-destructive/40 focus-visible:ring-destructive/40"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowRestoreDialog(false); setRestoreCode(""); }}>Cancelar</Button>
            <Button 
              variant="destructive" 
              onClick={handleRestore}
              disabled={restoreCode !== "RESTAURAR" || restoreBackup.isPending}
              className="gap-1.5"
            >
              {restoreBackup.isPending 
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Restaurando...</>
                : <><RotateCcw className="h-4 w-4" /> Confirmar Restauração</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
