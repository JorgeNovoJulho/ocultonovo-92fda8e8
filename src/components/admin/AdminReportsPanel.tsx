/**
 * Painel Admin para Gestão de Denúncias Anônimas
 */
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Flag, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Filter,
  Eye,
  Loader2,
  ChevronDown,
  User,
  FileText,
  MessageSquare,
  Calendar
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  useAdminReports, 
  useUpdateReport,
  useReportStats,
  AnonymousReport,
  ReportStatus,
  ReportCategory,
  ReportSeverity,
  reportCategoryLabels,
  reportSeverityLabels,
  reportStatusLabels
} from "@/hooks/useAnonymousReport";
import { useAuth } from "@/hooks/useAuth";

export function AdminReportsPanel() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("pending");
  const [selectedReport, setSelectedReport] = useState<AnonymousReport | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actionTaken, setActionTaken] = useState("");

  const { data: reports = [], isLoading } = useAdminReports({
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const { data: stats } = useReportStats();
  const updateReport = useUpdateReport();

  const getSeverityColor = (severity: ReportSeverity) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
      case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
      case 'low': return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/20 text-amber-400';
      case 'reviewing': return 'bg-blue-500/20 text-blue-400';
      case 'action_taken': return 'bg-green-500/20 text-green-400';
      case 'dismissed': return 'bg-muted text-muted-foreground';
      case 'escalated': return 'bg-destructive/20 text-destructive';
    }
  };

  const getTargetIcon = (type: string) => {
    switch (type) {
      case 'user': return <User className="h-4 w-4" />;
      case 'post': return <FileText className="h-4 w-4" />;
      case 'message': return <MessageSquare className="h-4 w-4" />;
      case 'event': return <Calendar className="h-4 w-4" />;
      default: return <Flag className="h-4 w-4" />;
    }
  };

  const handleUpdateStatus = async (status: ReportStatus) => {
    if (!selectedReport || !user) return;

    await updateReport.mutateAsync({
      reportId: selectedReport.id,
      status,
      resolutionNotes: resolutionNotes.trim() || undefined,
      actionTaken: actionTaken || undefined,
      reviewedBy: user.id,
    });

    setSelectedReport(null);
    setResolutionNotes("");
    setActionTaken("");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5 text-destructive" />
                Denúncias Anônimas
              </CardTitle>
              <CardDescription>
                Gerencie denúncias de conteúdo e usuários
              </CardDescription>
            </div>

            {/* Stats */}
            {stats && (
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{stats.critical}</p>
                  <p className="text-xs text-muted-foreground">Críticas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
                  <p className="text-xs text-muted-foreground">Resolvidas</p>
                </div>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="reviewing">Em Análise</SelectItem>
                  <SelectItem value="action_taken">Ação Tomada</SelectItem>
                  <SelectItem value="dismissed">Arquivadas</SelectItem>
                  <SelectItem value="escalated">Escaladas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reports List */}
          {reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Flag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma denúncia encontrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <Collapsible key={report.id}>
                  <div className="p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors">
                    <CollapsibleTrigger asChild>
                      <div className="flex items-start justify-between cursor-pointer">
                        <div className="flex items-start gap-3">
                          {/* Severity indicator */}
                          <div className={`p-2 rounded-lg ${getSeverityColor(report.severity)}`}>
                            {report.is_urgent ? (
                              <AlertTriangle className="h-4 w-4" />
                            ) : (
                              getTargetIcon(report.target_type)
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {reportCategoryLabels[report.category]}
                              </span>
                              <Badge variant="outline" className={getSeverityColor(report.severity)}>
                                {reportSeverityLabels[report.severity]}
                              </Badge>
                              <Badge variant="outline" className={getStatusColor(report.status)}>
                                {reportStatusLabels[report.status]}
                              </Badge>
                              {report.is_urgent && (
                                <Badge variant="destructive">URGENTE</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {report.target_type.toUpperCase()} • 
                              {format(new Date(report.created_at), " dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            #{report.priority_score}
                          </Badge>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent className="pt-4 space-y-3">
                      {report.description && (
                        <div className="p-3 rounded bg-muted/50">
                          <p className="text-sm">{report.description}</p>
                        </div>
                      )}

                      {report.evidence_urls && report.evidence_urls.length > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Evidências:</p>
                          <div className="flex gap-2 flex-wrap">
                            {report.evidence_urls.map((url, i) => (
                              <a 
                                key={i} 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline"
                              >
                                Anexo {i + 1}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {report.resolution_notes && (
                        <div className="p-3 rounded bg-green-500/10 border border-green-500/30">
                          <p className="text-xs text-green-400 font-medium mb-1">Resolução:</p>
                          <p className="text-sm">{report.resolution_notes}</p>
                        </div>
                      )}

                      {report.status === 'pending' && (
                        <div className="flex gap-2 pt-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedReport(report)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Analisar
                          </Button>
                        </div>
                      )}
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-destructive" />
              Analisar Denúncia
            </DialogTitle>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-4">
              {/* Report Info */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className={getSeverityColor(selectedReport.severity)}>
                    {reportSeverityLabels[selectedReport.severity]}
                  </Badge>
                  <span className="font-medium">
                    {reportCategoryLabels[selectedReport.category]}
                  </span>
                </div>
                {selectedReport.description && (
                  <p className="text-sm text-muted-foreground">{selectedReport.description}</p>
                )}
              </div>

              {/* Action Taken */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ação tomada</label>
                <Select value={actionTaken} onValueChange={setActionTaken}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a ação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="warning">Advertência</SelectItem>
                    <SelectItem value="content_removed">Conteúdo Removido</SelectItem>
                    <SelectItem value="suspension">Suspensão</SelectItem>
                    <SelectItem value="ban">Banimento</SelectItem>
                    <SelectItem value="none">Nenhuma ação necessária</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Resolution Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notas da resolução</label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="Descreva a análise e decisão tomada..."
                  rows={3}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => handleUpdateStatus('dismissed')}
                  disabled={updateReport.isPending}
                >
                  <XCircle className="h-4 w-4" />
                  Arquivar
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => handleUpdateStatus('action_taken')}
                  disabled={updateReport.isPending || !actionTaken}
                >
                  {updateReport.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Resolver
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
