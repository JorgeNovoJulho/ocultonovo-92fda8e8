/**
 * Painel de Denúncias Críticas para Admin
 * Exibe denúncias com prioridade máxima e ações de moderação rápida
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldAlert,
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Timer,
} from "lucide-react";
import {
  useCriticalReports,
  useHideContent,
  useRestoreContent,
  useResolveReport,
  REPORT_CATEGORIES,
  type ContentReport,
} from "@/hooks/useContentReports";
import { formatDistanceToNow, differenceInMinutes, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Componente de cronômetro SLA
function SLATimer({ deadline }: { deadline: string }) {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const minutesLeft = differenceInMinutes(deadlineDate, now);
  const hoursLeft = differenceInHours(deadlineDate, now);
  const isExpired = minutesLeft < 0;
  const isUrgent = minutesLeft > 0 && minutesLeft < 30;

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
      isExpired && "bg-destructive/20 text-destructive",
      isUrgent && !isExpired && "bg-[#FF007F]/20 text-[#FF007F] animate-pulse",
      !isExpired && !isUrgent && "bg-orange-500/20 text-orange-500"
    )}>
      <Timer className="h-3 w-3" />
      {isExpired ? (
        <span>SLA EXPIRADO</span>
      ) : hoursLeft > 0 ? (
        <span>{hoursLeft}h {minutesLeft % 60}min restantes</span>
      ) : (
        <span>{minutesLeft}min restantes</span>
      )}
    </div>
  );
}

// Card individual de denúncia crítica
function CriticalReportCard({
  report,
  onHide,
  onRestore,
  onResolve,
}: {
  report: ContentReport;
  onHide: (reportId: string, postId: string) => void;
  onRestore: (reportId: string, postId: string) => void;
  onResolve: (reportId: string, status: 'action_taken' | 'dismissed') => void;
}) {
  const categoryConfig = REPORT_CATEGORIES[report.category];
  const isRevengePorn = report.category === 'revenge_porn';
  const isMinor = report.category === 'minor';

  return (
    <div className={cn(
      "relative p-4 rounded-lg border-2 transition-all",
      "bg-card",
      (isRevengePorn || isMinor) && "border-[#FF007F] animate-[pulse_2s_ease-in-out_infinite]",
      !isRevengePorn && !isMinor && "border-orange-500/50"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-2 rounded-lg",
            (isRevengePorn || isMinor) ? "bg-[#FF007F]/20" : "bg-orange-500/20"
          )}>
            {isRevengePorn || isMinor ? (
              <ShieldAlert className="h-5 w-5 text-[#FF007F]" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{categoryConfig?.label}</span>
              <Badge className="bg-[#FF007F] text-white text-[10px]">
                ALERTA VERMELHO
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Denunciado {formatDistanceToNow(new Date(report.created_at), { 
                addSuffix: true, 
                locale: ptBR 
              })}
            </p>
          </div>
        </div>
        
        {report.sla_deadline && (
          <SLATimer deadline={report.sla_deadline} />
        )}
      </div>

      {/* Conteúdo denunciado */}
      {report.reported_user && (
        <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg mb-3">
          <img loading="lazy" decoding="async"
            src={report.reported_user.avatar_url || '/placeholder.svg'}
            alt={report.reported_user.name}
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{report.reported_user.name}</p>
            <p className="text-sm text-muted-foreground">@{report.reported_user.username}</p>
          </div>
          {report.post_id && (
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <ExternalLink className="h-3 w-3" />
              Ver Post
            </Button>
          )}
        </div>
      )}

      {/* Descrição */}
      {report.description && (
        <div className="p-3 bg-muted/20 rounded-lg mb-3 border border-border/50">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {report.description}
          </p>
        </div>
      )}

      {/* Status atual */}
      <div className="flex items-center gap-2 mb-4">
        <Badge variant="outline" className={cn(
          report.content_hidden && "border-orange-500 text-orange-500"
        )}>
          {report.content_hidden ? (
            <>
              <EyeOff className="h-3 w-3 mr-1" />
              Conteúdo Ocultado
            </>
          ) : (
            <>
              <Eye className="h-3 w-3 mr-1" />
              Conteúdo Visível
            </>
          )}
        </Badge>
        <Badge variant="outline">
          Status: {report.status === 'pending' ? 'Pendente' : 
                  report.status === 'under_review' ? 'Em Análise' : report.status}
        </Badge>
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        {report.post_id && !report.content_hidden && (
          <Button
            variant="destructive"
            size="sm"
            className="gap-1 bg-[#FF007F] hover:bg-[#FF007F]/90"
            onClick={() => onHide(report.id, report.post_id!)}
          >
            <EyeOff className="h-4 w-4" />
            Remoção Cautelar
          </Button>
        )}

        {report.post_id && report.content_hidden && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => onRestore(report.id, report.post_id!)}
          >
            <Eye className="h-4 w-4" />
            Restaurar Conteúdo
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-green-500 border-green-500/30 hover:bg-green-500/10"
          onClick={() => onResolve(report.id, 'action_taken')}
        >
          <CheckCircle className="h-4 w-4" />
          Ação Tomada
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => onResolve(report.id, 'dismissed')}
        >
          <XCircle className="h-4 w-4" />
          Dispensar
        </Button>
      </div>
    </div>
  );
}

// Componente principal
export function CriticalReportsPanel() {
  const { data: reports, isLoading } = useCriticalReports();
  const hideContent = useHideContent();
  const restoreContent = useRestoreContent();
  const resolveReport = useResolveReport();

  const [hideConfirm, setHideConfirm] = useState<{ reportId: string; postId: string } | null>(null);
  const [resolveConfirm, setResolveConfirm] = useState<{ 
    reportId: string; 
    status: 'action_taken' | 'dismissed' 
  } | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const handleHide = (reportId: string, postId: string) => {
    setHideConfirm({ reportId, postId });
  };

  const handleRestore = async (reportId: string, postId: string) => {
    await restoreContent.mutateAsync({ reportId, postId });
  };

  const handleResolve = (reportId: string, status: 'action_taken' | 'dismissed') => {
    setResolveConfirm({ reportId, status });
  };

  const confirmHide = async () => {
    if (!hideConfirm) return;
    await hideContent.mutateAsync({
      reportId: hideConfirm.reportId,
      postId: hideConfirm.postId,
      reason: 'Remoção cautelar por denúncia de conteúdo crítico',
    });
    setHideConfirm(null);
  };

  const confirmResolve = async () => {
    if (!resolveConfirm) return;
    await resolveReport.mutateAsync({
      reportId: resolveConfirm.reportId,
      status: resolveConfirm.status,
      notes: resolutionNotes || undefined,
    });
    setResolveConfirm(null);
    setResolutionNotes("");
  };

  const criticalCount = reports?.length || 0;

  return (
    <>
      <Card className={cn(
        "transition-all",
        criticalCount > 0 && "border-[#FF007F] shadow-[0_0_20px_rgba(255,0,127,0.2)]"
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="h-5 w-5 text-[#FF007F]" />
              Denúncias Críticas
              {criticalCount > 0 && (
                <Badge className="bg-[#FF007F] text-white animate-pulse">
                  {criticalCount} {criticalCount === 1 ? 'alerta' : 'alertas'}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>SLA: 2 horas</span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : criticalCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma denúncia crítica pendente</p>
              <p className="text-sm mt-1">Sistema operando normalmente</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports?.map((report) => (
                <CriticalReportCard
                  key={report.id}
                  report={report}
                  onHide={handleHide}
                  onRestore={handleRestore}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmação - Ocultação */}
      <AlertDialog open={!!hideConfirm} onOpenChange={() => setHideConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#FF007F]">
              <EyeOff className="h-5 w-5" />
              Confirmar Remoção Cautelar
            </AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo será imediatamente ocultado de todos os usuários enquanto a 
              moderação analisa o caso. Esta ação pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmHide}
              className="bg-[#FF007F] hover:bg-[#FF007F]/90"
              disabled={hideContent.isPending}
            >
              {hideContent.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <EyeOff className="h-4 w-4 mr-2" />
              )}
              Ocultar Agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação - Resolução */}
      <AlertDialog open={!!resolveConfirm} onOpenChange={() => setResolveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resolveConfirm?.status === 'action_taken' 
                ? 'Marcar como Ação Tomada' 
                : 'Dispensar Denúncia'
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              Adicione notas sobre a resolução (opcional):
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Notas de resolução..."
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResolve}
              disabled={resolveReport.isPending}
            >
              {resolveReport.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
