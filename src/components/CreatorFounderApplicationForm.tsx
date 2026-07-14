import { useState } from "react";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from '@/lib/appConfig';
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { useMyFounderApplication, useFounderVagas } from "@/hooks/useCreatorFounders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Crown, Upload, CheckCircle, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

interface FounderFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function CreatorFounderApplicationForm({ open, onOpenChange }: FounderFormProps) {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  // submission is now handled entirely via edge function
  const { data: existingApp } = useMyFounderApplication();
  const { data: vagas } = useFounderVagas();

  const [step, setStep] = useState(1);
  const [applicantName, setApplicantName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [socialLinks, setSocialLinks] = useState({ instagram: "", twitter: "", tiktok: "", onlyfans: "", other: "" });
  const [careerDesc, setCareerDesc] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Already applied
  if (existingApp) {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", text: "Em análise pela curadoria" },
      approved: { color: "bg-green-500/20 text-green-400 border-green-500/30", text: "Aprovado! Você é um Creator Founder 🎉" },
      rejected: { color: "bg-red-500/20 text-red-400 border-red-500/30", text: `Reprovado: ${existingApp.rejection_reason || "Sem motivo informado"}` },
    };
    const s = statusMap[existingApp.status] || statusMap.pending;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Crown className="w-5 h-5 text-amber-400" /> Sua Candidatura</DialogTitle>
          </DialogHeader>
          <div className="text-center py-6">
            <Badge className={`${s.color} text-sm px-4 py-2`}>{s.text}</Badge>
            {existingApp.status === "rejected" && (
              <p className="text-xs text-muted-foreground mt-4">Você pode se candidatar novamente após corrigir os pontos indicados.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (vagas?.is_full) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Vagas Esgotadas</DialogTitle>
          </DialogHeader>
          <div className="text-center py-6">
            <p className="text-muted-foreground mb-4">Todas as 50 vagas de Creator Founder foram preenchidas.</p>
            <Button onClick={() => { onOpenChange(false); navigate("/pricing"); }}>
              Ver Planos Pagos
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const handleSubmit = async () => {
    if (!user?.id && (!applicantName.trim() || !applicantEmail.trim())) {
      toast.error("Preencha seu nome e e-mail para se candidatar.");
      return;
    }
    if (!photoFile || !videoFile) {
      toast.error("Envie a foto e o vídeo obrigatórios.");
      return;
    }

    try {
      const videoDuration = await getVideoDuration(videoFile);
      if (videoDuration < 180) {
        toast.error("O vídeo precisa ter no mínimo 3 minutos.");
        return;
      }
    } catch {
      // If we can't check duration, proceed
    }

    setIsUploading(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress(p => Math.min(p + 3, 90));
    }, 500);

    try {
      // Send everything to edge function (bypasses all RLS)
      const formData = new FormData();
      formData.append("photo", photoFile);
      formData.append("video", videoFile);
      formData.append("social_links", JSON.stringify(socialLinks));
      formData.append("career_description", careerDesc);
      if (user?.id) {
        formData.append("user_id", user.id);
      } else {
        formData.append("applicant_name", applicantName.trim());
        formData.append("applicant_email", applicantEmail.trim());
      }

      const supabaseUrl = EXTERNAL_SUPABASE_URL;
      const anonKey = EXTERNAL_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/submit-founder-application`, {
        method: "POST",
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
        body: formData,
      });

      clearInterval(interval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao enviar candidatura");
      }

      toast.success("Candidatura enviada! Seu perfil está em análise pela nossa curadoria.");
      onOpenChange(false);
    } catch (err: any) {
      clearInterval(interval);
      toast.error(err.message || "Erro ao enviar candidatura. Tente novamente.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto scrollbar-hide p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" />
            Candidatura Creator Founder
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 1 ? "bg-amber-500" : "bg-muted"}`} />
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 2 ? "bg-amber-500" : "bg-muted"}`} />
        </div>
        <p className="text-xs text-muted-foreground text-center mb-4">Passo {step} de 2</p>

        {step === 1 && (
          <div className="space-y-4">
            {/* Name/Email for unauthenticated users */}
            {!user && (
              <>
                <div>
                  <Label>Seu nome completo *</Label>
                  <Input placeholder="Nome completo" value={applicantName} onChange={e => setApplicantName(e.target.value)} />
                </div>
                <div>
                  <Label>Seu e-mail *</Label>
                  <Input type="email" placeholder="seu@email.com" value={applicantEmail} onChange={e => setApplicantEmail(e.target.value)} />
                </div>
              </>
            )}
            <div>
              <Label>OnlyFans / Privacy</Label>
              <Input placeholder="Link do perfil" value={socialLinks.onlyfans} onChange={e => setSocialLinks(s => ({ ...s, onlyfans: e.target.value }))} />
            </div>
            <div>
              <Label>Xvideos RED</Label>
              <Input placeholder="Link do perfil" value={socialLinks.tiktok} onChange={e => setSocialLinks(s => ({ ...s, tiktok: e.target.value }))} />
            </div>
            <div>
              <Label>Outro link</Label>
              <Input placeholder="Site, portfólio..." value={socialLinks.other} onChange={e => setSocialLinks(s => ({ ...s, other: e.target.value }))} />
            </div>
            <div>
              <Label>Descreva brevemente sua carreira como criador(a)</Label>
              <Textarea
                placeholder="Ex: Sou criador de conteúdo adulto há 2 anos, com foco em..."
                value={careerDesc}
                onChange={e => setCareerDesc(e.target.value)}
                rows={4}
              />
            </div>
            <Button
              className="w-full"
              disabled={!careerDesc.trim() || (!user && (!applicantName.trim() || !applicantEmail.trim()))}
              onClick={() => setStep(2)}
            >
              Próximo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">📸 Foto de Conteúdo (obrigatória)</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={e => setPhotoFile(e.target.files?.[0] || null)}
                />
                {photoFile && <p className="text-xs text-green-400 mt-1">✓ {photoFile.name}</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">🎬 Vídeo (mín. 3 minutos, obrigatório)</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  type="file"
                  accept="video/*"
                  onChange={e => setVideoFile(e.target.files?.[0] || null)}
                />
                {videoFile && <p className="text-xs text-green-400 mt-1">✓ {videoFile.name}</p>}
              </CardContent>
            </Card>

            {isUploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Enviando arquivos...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isUploading}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-bold"
                disabled={!photoFile || !videoFile || isUploading}
                onClick={handleSubmit}
              >
                {isUploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  <><CheckCircle className="w-4 h-4 mr-2" /> Enviar Candidatura</>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = reject;
    video.src = URL.createObjectURL(file);
  });
}
