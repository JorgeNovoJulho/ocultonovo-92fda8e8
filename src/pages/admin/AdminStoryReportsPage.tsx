import { useState } from "react";
import { 
  useStoryReports, 
  useHideStory, 
  useDismissReport, 
  useEscalateReport 
} from "@/hooks/useStoryReports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Flag, 
  Eye, 
  EyeOff, 
  Ban, 
  X, 
  AlertTriangle, 
  Clock,
  ArrowUpCircle,
  Loader2,
  User
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UserDisciplineModal } from "@/components/admin/UserDisciplineModal";
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

const CATEGORY_LABELS: Record<string, string> = {
  spam: "Spam ou Golpe",
  harassment: "Assédio ou Ameaças",
  fake_profile: "Perfil Falso",
  minor: "Menor de Idade",
  revenge_porn: "Conteúdo Não Autorizado",
  other: "Outros",
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  critical: {
    label: "Crítico",
    color: "bg-red-500/10 text-red-500 border-red-500/30",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  high: {
    label: "Alta",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  normal: {
    label: "Normal",
    color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    icon: <Clock className="h-4 w-4" />,
  },
  low: {
    label: "Baixa",
    color: "bg-muted text-muted-foreground border-muted",
    icon: <Clock className="h-4 w-4" />,
  },
};

export default function AdminStoryReportsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [disciplineModalOpen, setDisciplineModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "hide" | "dismiss" | "escalate";
    reportId: string;
    storyId?: string;
  } | null>(null);

  const { data: reports, isLoading } = useStoryReports(
    activeTab === "all" ? undefined : activeTab
  );
  const hideStory = useHideStory();
  const dismissReport = useDismissReport();
  const escalateReport = useEscalateReport();

  const criticalCount = reports?.filter((r) => r.priority_level === "critical").length || 0;
  const highCount = reports?.filter((r) => r.priority_level === "high").length || 0;
  const normalCount = reports?.filter((r) => r.priority_level === "normal").length || 0;

  const handleConfirmAction = () => {
    if (!confirmAction) return;

    if (confirmAction.type === "hide" && confirmAction.storyId) {
      hideStory.mutate({
        reportId: confirmAction.reportId,
        storyId: confirmAction.storyId,
      });
    } else if (confirmAction.type === "dismiss") {
      dismissReport.mutate({ reportId: confirmAction.reportId });
    } else if (confirmAction.type === "escalate") {
      escalateReport.mutate({ reportId: confirmAction.reportId });
    }

    setConfirmAction(null);
  };

  const getSlaStatus = (deadline: string | null) => {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const hoursLeft = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursLeft < 0) {
      return { label: "SLA Expirado", color: "text-red-500" };
    } else if (hoursLeft < 2) {
      return { label: `${Math.round(hoursLeft * 60)}min restantes`, color: "text-red-500" };
    } else {
      return { label: `${Math.round(hoursLeft)}h restantes`, color: "text-yellow-500" };
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive/10">
          <Flag className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Denúncias de Stories</h1>
          <p className="text-muted-foreground">
            Gerencie denúncias de conteúdo com ações rápidas
          </p>
        </div>
      </div>

      {/* Priority Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" className="gap-2">
            Todas
            <Badge variant="secondary" className="ml-1">
              {reports?.length || 0}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="critical" className="gap-2">
            🔴 Críticas
            {criticalCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {criticalCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="high" className="gap-2">
            🟠 Alta
            {highCount > 0 && (
              <Badge className="ml-1 bg-orange-500">
                {highCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="normal" className="gap-2">
            🟡 Normal
            {normalCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {normalCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : reports?.length === 0 ? (
            <div className="text-center py-12">
              <Flag className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">Nenhuma denúncia pendente</h3>
              <p className="text-muted-foreground">
                Todas as denúncias de stories foram resolvidas.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports?.map((report) => {
                const priority = PRIORITY_CONFIG[report.priority_level] || PRIORITY_CONFIG.normal;
                const slaStatus = getSlaStatus(report.sla_deadline);

                return (
                  <Card key={report.id} className="border-l-4" style={{
                    borderLeftColor: report.priority_level === "critical" 
                      ? "rgb(239 68 68)" 
                      : report.priority_level === "high"
                      ? "rgb(249 115 22)"
                      : "rgb(234 179 8)"
                  }}>
                    <CardContent className="p-4 space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Badge className={priority.color}>
                            {priority.icon}
                            <span className="ml-1">{priority.label}</span>
                          </Badge>
                          <Badge variant="outline">
                            {CATEGORY_LABELS[report.category] || report.category}
                          </Badge>
                          {slaStatus && (
                            <span className={`text-xs font-medium ${slaStatus.color}`}>
                              ⏰ {slaStatus.label}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(report.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex gap-6">
                        {/* Reported User ID */}
                        {report.reported_user_id && (
                          <div className="flex items-center gap-2">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback>
                                <User className="h-5 w-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">
                                Usuário Denunciado
                              </p>
                              <p className="text-xs text-muted-foreground">ID: {report.reported_user_id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        )}

                        {/* Reporter */}
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm">
                              Denunciante
                            </p>
                            <p className="text-xs text-muted-foreground">ID: {report.reporter_id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </div>

                      {/* Description */}
                      {report.description && (
                        <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          "{report.description}"
                        </p>
                      )}

                      {/* Story Preview */}
                      {report.story?.media_url && (
                        <div className="relative h-32 w-24 rounded-lg overflow-hidden bg-muted">
                          <img loading="lazy" decoding="async"
                            src={report.story.media_url}
                            alt="Story denunciado"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() =>
                            setConfirmAction({
                              type: "hide",
                              reportId: report.id,
                              storyId: report.story_id || undefined,
                            })
                          }
                          disabled={!report.story_id}
                        >
                          <EyeOff className="h-4 w-4" />
                          Ocultar Story
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-2"
                          onClick={() => {
                            setSelectedUserId(report.reported_user_id);
                            setDisciplineModalOpen(true);
                          }}
                          disabled={!report.reported_user_id}
                        >
                          <Ban className="h-4 w-4" />
                          Banir Usuário
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-2"
                          onClick={() =>
                            setConfirmAction({
                              type: "dismiss",
                              reportId: report.id,
                            })
                          }
                        >
                          <X className="h-4 w-4" />
                          Dispensar
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 text-orange-500 border-orange-500/30"
                          onClick={() =>
                            setConfirmAction({
                              type: "escalate",
                              reportId: report.id,
                            })
                          }
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                          Escalar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Discipline Modal */}
      {selectedUserId && (
        <UserDisciplineModal
          open={disciplineModalOpen}
          onOpenChange={setDisciplineModalOpen}
          user={{
            id: selectedUserId,
            name: "Usuário Denunciado",
          }}
        />
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "hide" && "Ocultar Story?"}
              {confirmAction?.type === "dismiss" && "Dispensar Denúncia?"}
              {confirmAction?.type === "escalate" && "Escalar Denúncia?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "hide" &&
                "O story será removido da visualização e a denúncia será marcada como resolvida."}
              {confirmAction?.type === "dismiss" &&
                "A denúncia será marcada como infundada e arquivada."}
              {confirmAction?.type === "escalate" &&
                "A denúncia será enviada para um admin master e marcada como crítica."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
