import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  Trash2,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Database,
  Image,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useBackupHistory,
  useDeleteBackup,
  useRestoreBackup,
  useBackupDownloadUrl,
  BackupHistory,
} from '@/hooks/useBackupSystem';

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
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Concluído
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/30">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Em andamento
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
          <XCircle className="h-3 w-3 mr-1" /> Falhou
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" /> Pendente
        </Badge>
      );
  }
}

function getTypeBadge(type: BackupHistory['backup_type']) {
  switch (type) {
    case 'manual':
      return <Badge variant="secondary">Manual</Badge>;
    case 'full':
      return <Badge>Agendado</Badge>;
    case 'pre_restore':
      return <Badge variant="outline">Pré-Restauração</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

interface BackupHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BackupHistoryModal({ open, onOpenChange }: BackupHistoryModalProps) {
  const [restoreBackup, setRestoreBackup] = useState<BackupHistory | null>(null);
  const [confirmationCode, setConfirmationCode] = useState('');
  const [deleteBackup, setDeleteBackup] = useState<BackupHistory | null>(null);

  const { data: history, isLoading } = useBackupHistory(50);
  const deleteBackupMutation = useDeleteBackup();
  const restoreBackupMutation = useRestoreBackup();
  const downloadUrlMutation = useBackupDownloadUrl();

  const handleDownload = async (backup: BackupHistory) => {
    if (!backup.storage_path) return;
    
    const url = await downloadUrlMutation.mutateAsync(backup.storage_path);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const handleRestore = async () => {
    if (!restoreBackup) return;

    await restoreBackupMutation.mutateAsync({
      backup_id: restoreBackup.id,
      confirmation_code: confirmationCode,
    });

    setRestoreBackup(null);
    setConfirmationCode('');
  };

  const handleDelete = async () => {
    if (!deleteBackup) return;
    await deleteBackupMutation.mutateAsync(deleteBackup);
    setDeleteBackup(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Histórico de Backups</DialogTitle>
            <DialogDescription>
              Visualize, baixe ou restaure backups anteriores
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[500px] pr-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : !history || history.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum backup encontrado</p>
                <p className="text-sm">Crie um backup manual para começar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((backup) => (
                  <Card key={backup.id}>
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(backup.status)}
                            {getTypeBadge(backup.backup_type)}
                            {backup.media_included && (
                              <Badge variant="outline" className="text-xs">
                                <Image className="h-3 w-3 mr-1" />
                                {backup.media_count} mídias
                              </Badge>
                            )}
                          </div>

                          <div className="text-sm">
                            <span className="text-muted-foreground">
                              {format(new Date(backup.started_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>

                          {backup.tables_included && (
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Database className="h-3 w-3" />
                                {Object.keys(backup.tables_included).length} tabelas
                              </span>
                              <span>
                                {Object.values(backup.tables_included as Record<string, number>).reduce((a, b) => a + b, 0)} registros
                              </span>
                              {backup.file_size_bytes && (
                                <span>{formatBytes(backup.file_size_bytes)}</span>
                              )}
                            </div>
                          )}

                          {backup.error_message && (
                            <p className="text-xs text-destructive">{backup.error_message}</p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 items-end shrink-0">
                          {backup.status === 'completed' && backup.storage_path && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => setRestoreBackup(backup)}
                                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-1.5 w-full"
                              >
                                <Upload className="h-4 w-4" />
                                Restaurar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload(backup)}
                                disabled={downloadUrlMutation.isPending}
                                className="w-full gap-1.5"
                              >
                                {downloadUrlMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                                Baixar
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteBackup(backup)}
                            className="w-full gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Restauração */}
      <AlertDialog open={!!restoreBackup} onOpenChange={() => { setRestoreBackup(null); setConfirmationCode(''); }}>
        <AlertDialogContent className="max-w-md w-[95vw]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              ⚠️ Restaurar Backup — Ação Irreversível
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                {/* Info do backup selecionado */}
                {restoreBackup && (
                  <div className="rounded-md border border-border bg-muted/50 p-3 space-y-1">
                    <p className="font-medium text-foreground text-xs uppercase tracking-wide">Backup selecionado</p>
                    <p className="text-muted-foreground">
                      📅 {format(new Date(restoreBackup.started_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {restoreBackup.tables_included && (
                      <p className="text-muted-foreground">
                        🗄️ {Object.keys(restoreBackup.tables_included).length} tabelas •{' '}
                        {Object.values(restoreBackup.tables_included as Record<string, number>).reduce((a, b) => a + b, 0)} registros
                        {restoreBackup.file_size_bytes ? ` • ${formatBytes(restoreBackup.file_size_bytes)}` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Avisos em destaque */}
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <p className="font-semibold text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> O que acontecerá:
                  </p>
                  <ul className="space-y-1 text-muted-foreground list-none">
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

                <div className="space-y-1.5">
                  <p className="font-medium text-foreground">
                    Para confirmar, digite <strong>RESTAURAR</strong> abaixo:
                  </p>
                  <Input
                    value={confirmationCode}
                    onChange={(e) => setConfirmationCode(e.target.value.toUpperCase())}
                    placeholder="Digite RESTAURAR"
                    className="border-destructive/40 focus-visible:ring-destructive/40"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmationCode('')}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={confirmationCode !== 'RESTAURAR' || restoreBackupMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {restoreBackupMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {restoreBackupMutation.isPending ? 'Restaurando...' : 'Confirmar Restauração'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={!!deleteBackup} onOpenChange={() => setDeleteBackup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Backup</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este backup? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteBackupMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBackupMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
