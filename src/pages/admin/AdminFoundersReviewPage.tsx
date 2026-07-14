import { useState } from "react";
import { useAdminFounderApplications, useApproveFounder, useRejectFounder, useFounderVagas } from "@/hooks/useCreatorFounders";
import { useAuthStore } from "@/store/useAuthStore";
import { supabase } from "@/lib/supabaseExternal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Crown, CheckCircle, XCircle, Eye, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AdminFoundersReviewPage() {
  const { user } = useAuthStore();
  const { data: applications, isLoading } = useAdminFounderApplications();
  const { data: vagas } = useFounderVagas();
  const approveMutation = useApproveFounder();
  const rejectMutation = useRejectFounder();

  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("pending");

  const filtered = applications?.filter(a => filterStatus === "all" || a.status === filterStatus) || [];

  const handleApprove = async (appId: string) => {
    if (!user?.id) return;
    try {
      await approveMutation.mutateAsync({ applicationId: appId, adminId: user.id });
      toast.success("Creator Founder aprovado!");
      setSelectedApp(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao aprovar");
    }
  };

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) {
      toast.error("Informe o motivo da reprovação");
      return;
    }
    try {
      // Get application to delete storage files
      const app = applications?.find(a => a.id === rejectId);
      if (app) {
        // Delete uploaded files to save space
        const photoPath = extractStoragePath(app.photo_url);
        const videoPath = extractStoragePath(app.video_url);
        if (photoPath) await supabase.storage.from("founder-media").remove([photoPath]);
        if (videoPath) await supabase.storage.from("founder-media").remove([videoPath]);
      }
      await rejectMutation.mutateAsync({ applicationId: rejectId, reason: rejectReason });
      toast.success("Candidatura reprovada");
      setRejectId(null);
      setRejectReason("");
      setSelectedApp(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao reprovar");
    }
  };

  const filled = vagas?.filled ?? 0;
  const total = vagas?.total ?? 50;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="w-6 h-6 text-amber-400" /> Curadoria Creator Founders
          </h1>
          <p className="text-muted-foreground text-sm">{filled}/{total} vagas preenchidas</p>
        </div>
        <Progress value={(filled / total) * 100} className="w-40 h-3" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["pending", "approved", "rejected", "all"].map(s => (
          <Button
            key={s}
            variant={filterStatus === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(s)}
          >
            {s === "pending" ? "Pendentes" : s === "approved" ? "Aprovados" : s === "rejected" ? "Reprovados" : "Todos"}
            {s === "pending" && ` (${applications?.filter(a => a.status === "pending").length || 0})`}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhuma candidatura encontrada.</p>
      ) : (
        <div className="grid gap-4">
          {filtered.map(app => (
            <Card key={app.id} className="hover:border-amber-500/30 transition-colors cursor-pointer" onClick={() => setSelectedApp(app)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-sm">{app.user_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(app.created_at), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{app.career_description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={
                    app.status === "pending" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                    app.status === "approved" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                    "bg-red-500/20 text-red-400 border-red-500/30"
                  }>
                    {app.status === "pending" ? "Pendente" : app.status === "approved" ? "Aprovado" : "Reprovado"}
                  </Badge>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" /> Detalhes da Candidatura
            </DialogTitle>
          </DialogHeader>
          {selectedApp && (
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">User ID</p>
                <p className="text-sm font-mono">{selectedApp.user_id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Carreira</p>
                <p className="text-sm">{selectedApp.career_description}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Redes Sociais</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(selectedApp.social_links || {}).map(([k, v]) =>
                    v ? (
                      <a key={k} href={String(v).startsWith("http") ? String(v) : `https://${v}`} target="_blank" rel="noopener noreferrer">
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                          {k} <ExternalLink className="w-3 h-3 ml-1" />
                        </Badge>
                      </a>
                    ) : null
                  )}
                </div>
              </div>

              {/* Photo */}
              {selectedApp.photo_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Foto de Conteúdo</p>
                  <img loading="lazy" decoding="async" src={selectedApp.photo_url} alt="Prova" className="rounded-lg max-h-64 object-cover" />
                </div>
              )}

              {/* Video - lightweight player */}
              {selectedApp.video_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Vídeo de Prova</p>
                  <video
                    src={selectedApp.video_url}
                    controls
                    preload="metadata"
                    className="rounded-lg max-h-64 w-full"
                    muted
                  />
                </div>
              )}

              {/* Actions */}
              {selectedApp.status === "pending" && (
                <div className="flex gap-2 pt-4 border-t border-border">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(selectedApp.id)}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                    APROVAR
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setRejectId(selectedApp.id)}
                    disabled={rejectMutation.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-1" /> REPROVAR
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Reason Modal */}
      <Dialog open={!!rejectId} onOpenChange={() => setRejectId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Motivo da Reprovação</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Informe o motivo da reprovação..."
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            rows={4}
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Confirmar Reprovação
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function extractStoragePath(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/founder-media\/(.+)$/);
  return match?.[1] || null;
}
