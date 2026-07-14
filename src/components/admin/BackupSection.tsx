import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Database, 
  Download, 
  Clock, 
  HardDrive, 
  RefreshCw,
  Plus,
  History,
  Calendar,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  useBackupStats, 
  useBackupSchedules, 
  useBackupHistory,
  useCreateBackup,
  useUpdateSchedule,
  useDeleteBackup,
  useBackupDownloadUrl,
  BackupSchedule,
  BackupHistory
} from '@/hooks/useBackupSystem';
import { BackupScheduleModal } from './BackupScheduleModal';
import { BackupHistoryModal } from './BackupHistoryModal';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getStatusBadge(status: BackupHistory['status']) {
  switch (status) {
    case 'completed':
      return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30"><CheckCircle2 className="h-3 w-3 mr-1" /> Concluído</Badge>;
    case 'running':
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30"><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Em andamento</Badge>;
    case 'failed':
      return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30"><XCircle className="h-3 w-3 mr-1" /> Falhou</Badge>;
    default:
      return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>;
  }
}

function getFrequencyLabel(schedule: BackupSchedule): string {
  const time = schedule.time_of_day?.slice(0, 5) || '03:00';
  
  switch (schedule.frequency) {
    case 'daily':
      return `Todos os dias às ${time}`;
    case 'weekly':
      const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      return `${days[schedule.day_of_week || 0]} às ${time}`;
    case 'monthly':
      return `Dia ${schedule.day_of_month || 1} de cada mês às ${time}`;
    default:
      return 'Personalizado';
  }
}

export function BackupSection() {
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<BackupSchedule | null>(null);
  const [deletingBackupId, setDeletingBackupId] = useState<string | null>(null);

  const { data: stats, isLoading: loadingStats } = useBackupStats();
  const { data: schedules, isLoading: loadingSchedules } = useBackupSchedules();
  const { data: history, isLoading: loadingHistory } = useBackupHistory(5);

  const createBackup = useCreateBackup();
  const updateSchedule = useUpdateSchedule();
  const deleteBackup = useDeleteBackup();
  const downloadUrl = useBackupDownloadUrl();

  const handleToggleSchedule = async (schedule: BackupSchedule) => {
    await updateSchedule.mutateAsync({
      id: schedule.id,
      is_active: !schedule.is_active,
    });
  };

  const handleEditSchedule = (schedule: BackupSchedule) => {
    setEditingSchedule(schedule);
    setShowScheduleModal(true);
  };

  const handleDeleteBackup = async (backup: BackupHistory) => {
    if (!confirm('Tem certeza que deseja excluir este backup? Esta ação não pode ser desfeita.')) return;
    setDeletingBackupId(backup.id);
    try {
      await deleteBackup.mutateAsync(backup);
    } finally {
      setDeletingBackupId(null);
    }
  };

  const handleDownload = async (backup: BackupHistory) => {
    if (!backup.storage_path) return;
    downloadUrl.mutate(backup.storage_path, {
      onSuccess: (url) => {
        const a = document.createElement('a');
        a.href = url;
        a.download = backup.storage_path!.split('/').pop() || 'backup.json';
        a.click();
      },
    });
  };

  if (loadingStats || loadingSchedules) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backup & Restauração da Plataforma
          </CardTitle>
          <CardDescription>
            Gerencie backups completos de todos os dados, mídias e configurações
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Estatísticas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <HardDrive className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_backups || 0}</p>
                    <p className="text-xs text-muted-foreground">Backups totais</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.successful_backups || 0}</p>
                    <p className="text-xs text-muted-foreground">Bem-sucedidos</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/10">
                    <Database className="h-5 w-5 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatBytes(stats?.total_size_bytes || 0)}</p>
                    <p className="text-xs text-muted-foreground">Espaço usado</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Calendar className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.active_schedules || 0}</p>
                    <p className="text-xs text-muted-foreground">Agendamentos ativos</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Ações Rápidas */}
          <div className="flex flex-wrap gap-3">
            <Button 
              onClick={() => createBackup.mutate({})}
              disabled={createBackup.isPending}
            >
              {createBackup.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Criar Backup Agora
            </Button>

            <Button variant="outline" onClick={() => setShowHistoryModal(true)}>
              <History className="h-4 w-4 mr-2" />
              Ver Histórico
            </Button>

            {stats?.last_backup_at && (
              <div className="flex items-center text-sm text-muted-foreground ml-auto">
                <Clock className="h-4 w-4 mr-1" />
                Último backup: {formatDistanceToNow(new Date(stats.last_backup_at), { addSuffix: true, locale: ptBR })}
              </div>
            )}
          </div>

          {/* Agendamentos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Agendamentos Ativos
              </h3>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  setEditingSchedule(null);
                  setShowScheduleModal(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Novo Agendamento
              </Button>
            </div>

            {(!schedules || schedules.length === 0) ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>Nenhum agendamento configurado</p>
                  <p className="text-sm">Configure backups automáticos para proteger seus dados</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {schedules.map((schedule) => (
                  <Card key={schedule.id} className={!schedule.is_active ? 'opacity-60' : ''}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Switch
                          checked={schedule.is_active}
                          onCheckedChange={() => handleToggleSchedule(schedule)}
                        />
                        <div>
                          <p className="font-medium">{schedule.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {getFrequencyLabel(schedule)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {schedule.next_run_at && schedule.is_active && (
                          <div className="text-right text-sm">
                            <p className="text-muted-foreground">Próximo:</p>
                            <p>{format(new Date(schedule.next_run_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                          </div>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditSchedule(schedule)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Últimos Backups */}
          {history && history.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <History className="h-4 w-4" />
                Últimos Backups
              </h3>

              <div className="space-y-2">
                {history.slice(0, 3).map((backup) => (
                  <Card key={backup.id}>
                    <CardContent className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(backup.status)}
                        <div>
                          <p className="text-sm">
                            {backup.backup_type === 'manual' && 'Backup Manual'}
                            {backup.backup_type === 'full' && 'Backup Completo'}
                            {backup.backup_type === 'pre_restore' && 'Backup Pré-Restauração'}
                            {backup.backup_type === 'incremental' && 'Backup Incremental'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(backup.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {backup.file_size_bytes && (
                          <span className="text-sm text-muted-foreground">
                            {formatBytes(backup.file_size_bytes)}
                          </span>
                        )}
                        {backup.status === 'completed' && backup.storage_path && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(backup)}
                            title="Baixar backup"
                          >
                            {downloadUrl.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteBackup(backup)}
                          disabled={deletingBackupId === backup.id}
                          title="Excluir backup"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {deletingBackupId === backup.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Aviso de Segurança */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-500">Informações Importantes</p>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  <li>• Backups são criptografados e armazenados com segurança</li>
                  <li>• Apenas administradores Master podem criar e restaurar backups</li>
                  <li>• A restauração sobrescreverá TODOS os dados atuais</li>
                  <li>• Recomendamos manter pelo menos um backup semanal ativo</li>
                  <li>• Backups duplicados são bloqueados automaticamente (intervalo mínimo: 10 min)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <BackupScheduleModal
        open={showScheduleModal}
        onOpenChange={setShowScheduleModal}
        schedule={editingSchedule}
      />

      <BackupHistoryModal
        open={showHistoryModal}
        onOpenChange={setShowHistoryModal}
      />
    </>
  );
}
