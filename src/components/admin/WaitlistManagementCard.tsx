import { useState } from 'react';
import { Users, Mail, Send, Trash2, ChevronDown, ChevronUp, Calendar, Loader2, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  useWaitlistEntries,
  useInviteNextFromWaitlist,
  useDeleteFromWaitlist,
  useBatchInviteWithEmail,
} from '@/hooks/useWaitlist';
import { useRealtimeCapacityMetrics } from '@/hooks/useCapacityMetrics';
import { exportToCSV, ExportColumn } from '@/lib/exportUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

// Colunas para exportação CSV da waitlist
const waitlistExportColumns: ExportColumn[] = [
  { key: 'email', label: 'Email' },
  { key: 'name', label: 'Nome' },
  { key: 'source', label: 'Origem' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Data de Cadastro', formatter: (v) => new Date(v).toLocaleDateString('pt-BR') },
];

export function WaitlistManagementCard() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inviteCount, setInviteCount] = useState('10');

  const { data: metrics } = useRealtimeCapacityMetrics();
  const { data: entries, isLoading } = useWaitlistEntries('waiting');
  const inviteNext = useInviteNextFromWaitlist();
  const deleteEntry = useDeleteFromWaitlist();
  const batchInviteEmail = useBatchInviteWithEmail();

  const handleInviteNext = () => {
    const count = parseInt(inviteCount);
    if (count > 0) {
      inviteNext.mutate(count);
    }
  };

  const handleInviteWithEmail = () => {
    const count = parseInt(inviteCount);
    if (count > 0) {
      batchInviteEmail.mutate({ count });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'waiting':
        return <Badge variant="secondary">Aguardando</Badge>;
      case 'invited':
        return <Badge className="bg-blue-500/20 text-blue-500">Convidado</Badge>;
      case 'converted':
        return <Badge className="bg-green-500/20 text-green-500">Convertido</Badge>;
      case 'expired':
        return <Badge variant="outline" className="text-muted-foreground">Expirado</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Fila de Espera
            <Badge variant="outline" className="ml-2">
              {metrics?.waitlist_count || 0} aguardando
            </Badge>
          </CardTitle>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="number"
            value={inviteCount}
            onChange={(e) => setInviteCount(e.target.value)}
            className="w-24"
            min={1}
            max={100}
          />
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleInviteNext}
                  disabled={inviteNext.isPending || !entries?.length}
                  variant="outline"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Convidar
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Marca como convidado (sem email)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleInviteWithEmail}
                  disabled={batchInviteEmail.isPending || !entries?.length}
                  className="bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold hover:from-amber-400 hover:to-yellow-300"
                >
                  {batchInviteEmail.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Convidar + Email
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Envia email de convite via Resend</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Botão de Exportar CSV */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (entries && entries.length > 0) {
                      exportToCSV(entries, `waitlist-${new Date().toISOString().split('T')[0]}`, waitlistExportColumns);
                      toast({
                        title: 'CSV exportado',
                        description: `${entries.length} registros exportados com sucesso.`,
                      });
                    }
                  }}
                  disabled={!entries?.length}
                >
                  <Download className="w-4 h-4 mr-2" />
                  CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Exportar lista de espera para CSV</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                Ver Todos
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>Lista de Espera Completa</DialogTitle>
              </DialogHeader>
              <WaitlistFullTable />
            </DialogContent>
          </Dialog>
        </div>

        {/* Expanded Preview */}
        {isExpanded && (
          <div className="border rounded-lg">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : entries && entries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.slice(0, 5).map((entry, index) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        {entry.email}
                      </TableCell>
                      <TableCell>{entry.name || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(entry.created_at), 'dd/MM/yy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Excluir">
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não pode ser desfeita. O email {entry.email} será removido da fila de espera.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteEntry.mutate(entry.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                Nenhum usuário na fila de espera
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Full table for modal
function WaitlistFullTable() {
  const { data: entries, isLoading } = useWaitlistEntries();
  const deleteEntry = useDeleteFromWaitlist();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Nenhum usuário na fila de espera
      </div>
    );
  }

  return (
    <ScrollArea className="h-[60vh]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Origem</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Data</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, index) => (
            <TableRow key={entry.id}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>{entry.email}</TableCell>
              <TableCell>{entry.name || '-'}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {entry.source}
                </Badge>
              </TableCell>
              <TableCell>
                {entry.status === 'waiting' && (
                  <Badge variant="secondary">Aguardando</Badge>
                )}
                {entry.status === 'invited' && (
                  <Badge className="bg-blue-500/20 text-blue-500">Convidado</Badge>
                )}
                {entry.status === 'converted' && (
                  <Badge className="bg-green-500/20 text-green-500">Convertido</Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </div>
              </TableCell>
              <TableCell>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Excluir">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover da fila?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteEntry.mutate(entry.id)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
