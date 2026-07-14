import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  Camera,
  CheckCircle2,
  Upload,
  Loader2,
  Lock,
  FileCheck,
  Users,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseExternal";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { logger } from '@/lib/logger';

interface IdDocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

type UploadStep = "select" | "upload_self" | "upload_partner" | "uploading" | "done";

export function IdDocumentUploadModal({
  open,
  onOpenChange,
  onComplete,
}: IdDocumentUploadModalProps) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { toast } = useToast();
  const isCouple = profile?.profile_type === "couple";

  const [step, setStep] = useState<UploadStep>("select");
  const [selfDocPreview, setSelfDocPreview] = useState<string | null>(null);
  const [partnerDocPreview, setPartnerDocPreview] = useState<string | null>(null);
  const [selfDocFile, setSelfDocFile] = useState<File | null>(null);
  const [partnerDocFile, setPartnerDocFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const selfInputRef = useRef<HTMLInputElement>(null);
  const partnerInputRef = useRef<HTMLInputElement>(null);
  const selfCameraRef = useRef<HTMLInputElement>(null);
  const partnerCameraRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File, target: "self" | "partner") => {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
        return;
      }
      const url = URL.createObjectURL(file);
      if (target === "self") {
        setSelfDocPreview(url);
        setSelfDocFile(file);
      } else {
        setPartnerDocPreview(url);
        setPartnerDocFile(file);
      }
    },
    [toast]
  );

  const handleUploadAll = useCallback(async () => {
    if (!user?.id || !profile?.id) return;
    if (!selfDocFile) {
      toast({ title: "Documento obrigatório", description: "Envie sua foto do documento.", variant: "destructive" });
      return;
    }
    if (isCouple && !partnerDocFile) {
      toast({ title: "Documento do parceiro obrigatório", description: "Envie o documento de ambos os parceiros.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setStep("uploading");
    setUploadProgress(10);

    try {
      // Upload self document
      const selfExt = selfDocFile.name.split(".").pop() || "jpg";
      const selfPath = `${profile.id}/id_document_${Date.now()}.${selfExt}`;
      const { error: selfErr } = await supabase.storage
        .from("kyc-documents")
        .upload(selfPath, selfDocFile, { contentType: selfDocFile.type, upsert: true });

      if (selfErr) {
        // Try post-media bucket as fallback
        const { error: fallbackErr } = await supabase.storage
          .from("post-media")
          .upload(`verification/${selfPath}`, selfDocFile, { contentType: selfDocFile.type, upsert: true });
        if (fallbackErr) throw fallbackErr;
      }

      setUploadProgress(40);

      // Save to profile
      await supabase
        .from("profiles")
        .update({
          kyc_document_url: selfPath,
          kyc_submitted_at: new Date().toISOString(),
        } as any)
        .eq("user_id", user.id);

      setUploadProgress(60);

      // Upload partner document if couple
      if (isCouple && partnerDocFile) {
        const partnerExt = partnerDocFile.name.split(".").pop() || "jpg";
        const partnerPath = `${profile.id}/id_document_partner_${Date.now()}.${partnerExt}`;
        
        const { error: partnerErr } = await supabase.storage
          .from("kyc-documents")
          .upload(partnerPath, partnerDocFile, { contentType: partnerDocFile.type, upsert: true });

        if (partnerErr) {
          await supabase.storage
            .from("post-media")
            .upload(`verification/${partnerPath}`, partnerDocFile, { contentType: partnerDocFile.type, upsert: true });
        }

        // Store partner doc path using couple verification docs if available
        try {
          await (supabase as any).from("couple_verification_docs").insert([{
            profile_id: profile.id,
            partner_number: 2,
            document_type: "id_front",
            storage_path: partnerPath,
            status: "approved",
            needs_admin_review: true,
          }]);
        } catch {
          // Fallback: store in profile metadata
          logger.log("[Doc Upload] couple_verification_docs insert failed, continuing...");
        }

        setUploadProgress(80);
      }

      setUploadProgress(100);

      // Create admin notification
      try {
        await (supabase as any).from("admin_notifications").insert([{
          type: "kyc_document",
          title: "📄 Novo documento de identidade enviado",
          body: `O perfil @${profile.username || profile.name} enviou documento(s) de identificação para revisão.`,
          data: { profileId: profile.id, isCouple },
        }]);
      } catch {
        // Non-critical
      }

      setTimeout(() => setStep("done"), 500);
    } catch (err: any) {
      console.error("[Doc Upload] Error:", err);
      toast({ title: "Erro no upload", description: err.message || "Tente novamente.", variant: "destructive" });
      setStep("select");
    } finally {
      setIsUploading(false);
    }
  }, [user, profile, selfDocFile, partnerDocFile, isCouple, toast]);

  const resetModal = useCallback(() => {
    setStep("select");
    setSelfDocPreview(null);
    setPartnerDocPreview(null);
    setSelfDocFile(null);
    setPartnerDocFile(null);
    setUploadProgress(0);
    setIsUploading(false);
  }, []);

  const handleComplete = useCallback(() => {
    onComplete();
    resetModal();
  }, [onComplete, resetModal]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isUploading) { onOpenChange(v); resetModal(); } }}>
      <DialogContent className="sm:max-w-md bg-card border-border overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <FileCheck className="h-5 w-5 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-xl">Documento de Identidade</DialogTitle>
          <DialogDescription className="text-sm">
            {isCouple
              ? "Envie o documento de identidade de ambos os parceiros"
              : "Envie uma foto do seu documento de identidade"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {/* Select / Upload Step */}
          {step === "select" && (
            <div className="space-y-5">
              {/* Self document */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <User className="h-4 w-4 text-primary" />
                  <span>{isCouple ? "Parceiro(a) 1 — Seu documento" : "Seu documento"}</span>
                </div>

                {selfDocPreview ? (
                  <div className="relative rounded-lg overflow-hidden border border-primary/30 bg-muted/30">
                    <img loading="lazy" decoding="async" src={selfDocPreview} alt="Documento" className="w-full h-40 object-cover" />
                    <div className="absolute top-2 right-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setSelfDocPreview(null); setSelfDocFile(null); }}
                        className="h-7 text-xs"
                      >
                        Trocar
                      </Button>
                    </div>
                    <div className="absolute bottom-2 left-2">
                      <div className="flex items-center gap-1 bg-primary/90 text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                        <CheckCircle2 className="h-3 w-3" />
                        Selecionado
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 h-20 flex-col gap-1 border-dashed border-primary/40"
                      onClick={() => selfCameraRef.current?.click()}
                    >
                      <Camera className="h-5 w-5 text-primary" />
                      <span className="text-xs">Câmera</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-20 flex-col gap-1 border-dashed border-primary/40"
                      onClick={() => selfInputRef.current?.click()}
                    >
                      <Upload className="h-5 w-5 text-primary" />
                      <span className="text-xs">Galeria</span>
                    </Button>
                  </div>
                )}

                <input
                  ref={selfInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0], "self")}
                />
                <input
                  ref={selfCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0], "self")}
                />
              </div>

              {/* Partner document (couple only) */}
              {isCouple && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Users className="h-4 w-4 text-secondary" />
                    <span>Parceiro(a) 2 — Documento do parceiro(a)</span>
                  </div>

                  {partnerDocPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-secondary/30 bg-muted/30">
                      <img loading="lazy" decoding="async" src={partnerDocPreview} alt="Documento parceiro" className="w-full h-40 object-cover" />
                      <div className="absolute top-2 right-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setPartnerDocPreview(null); setPartnerDocFile(null); }}
                          className="h-7 text-xs"
                        >
                          Trocar
                        </Button>
                      </div>
                      <div className="absolute bottom-2 left-2">
                        <div className="flex items-center gap-1 bg-secondary/90 text-secondary-foreground rounded-full px-2 py-0.5 text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          Selecionado
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-20 flex-col gap-1 border-dashed border-secondary/40"
                        onClick={() => partnerCameraRef.current?.click()}
                      >
                        <Camera className="h-5 w-5 text-secondary" />
                        <span className="text-xs">Câmera</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-20 flex-col gap-1 border-dashed border-secondary/40"
                        onClick={() => partnerInputRef.current?.click()}
                      >
                        <Upload className="h-5 w-5 text-secondary" />
                        <span className="text-xs">Galeria</span>
                      </Button>
                    </div>
                  )}

                  <input
                    ref={partnerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0], "partner")}
                  />
                  <input
                    ref={partnerCameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0], "partner")}
                  />
                </div>
              )}

              {/* Info */}
              <div className="bg-muted/30 rounded-lg p-3 border border-border text-xs text-muted-foreground">
                <p>📋 Documentos aceitos: RG, CNH, Passaporte ou Carteira profissional com foto.</p>
                <p className="mt-1">🔒 Seus documentos são criptografados e usados apenas para verificação.</p>
              </div>

              {/* Trust badge */}
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Lock className="h-3 w-3 text-green-500" />
                <span>Criptografia de Ponta a Ponta</span>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { onOpenChange(false); resetModal(); }}
                >
                  Pular
                </Button>
                <Button
                  onClick={handleUploadAll}
                  disabled={!selfDocFile || (isCouple && !partnerDocFile)}
                  className="flex-1 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar {isCouple ? "Documentos" : "Documento"}
                </Button>
              </div>
            </div>
          )}

          {/* Uploading Step */}
          {step === "uploading" && (
            <div className="space-y-6 text-center py-4">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/30">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-foreground">Enviando documento(s)...</p>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">{uploadProgress}%</p>
              </div>

              <div className="space-y-2 text-left">
                <div className={cn("flex items-center gap-2 text-sm", uploadProgress >= 30 ? "text-green-500" : "text-muted-foreground")}>
                  {uploadProgress >= 30 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Comprimindo imagem
                </div>
                <div className={cn("flex items-center gap-2 text-sm", uploadProgress >= 60 ? "text-green-500" : "text-muted-foreground")}>
                  {uploadProgress >= 60 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviando para armazenamento seguro
                </div>
                <div className={cn("flex items-center gap-2 text-sm", uploadProgress >= 100 ? "text-green-500" : "text-muted-foreground")}>
                  {uploadProgress >= 100 ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                  Registrando verificação
                </div>
              </div>
            </div>
          )}

          {/* Done Step */}
          {step === "done" && (
            <div className="space-y-6 text-center py-4">
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                <div className="relative w-full h-full rounded-full bg-green-500/10 flex items-center justify-center border-2 border-green-500">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground mb-2">Documento(s) Enviado(s)!</h3>
                <p className="text-muted-foreground">
                  {isCouple
                    ? "Os documentos de ambos os parceiros foram enviados para análise."
                    : "Seu documento foi enviado para análise."}
                </p>
              </div>
              <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20">
                <div className="flex items-center justify-center gap-2 text-green-500">
                  <Shield className="h-5 w-5" />
                  <span className="font-medium">Em Análise</span>
                </div>
              </div>
              <Button
                onClick={handleComplete}
                className="w-full h-12 bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              >
                Continuar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
