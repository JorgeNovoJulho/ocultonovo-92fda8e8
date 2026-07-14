import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { 
  useCoupleVerificationStatus, 
  useUploadVerificationDoc,
  useUpdatePartnerNames,
  CoupleVerificationDoc
} from "@/hooks/useCoupleVerification";
import { 
  Heart, 
  Upload, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  Camera, 
  IdCard,
  ArrowLeft,
  Loader2,
  Shield,
  AlertTriangle
} from "lucide-react";

type DocType = 'id_front' | 'id_back' | 'selfie';
type PartnerNumber = 1 | 2;

interface DocUploadCardProps {
  type: DocType;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'approved' | 'rejected' | 'not_uploaded';
  storagePath?: string;
  rejectionReason?: string;
  onUpload: (file: File) => void;
  isUploading: boolean;
}

function DocUploadCard({ type, label, icon, status, storagePath, rejectionReason, onUpload, isUploading }: DocUploadCardProps) {
  const [preview, setPreview] = useState<string | null>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validação de tamanho (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    
    // Preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
    
    onUpload(file);
  };
  
  const statusConfig = {
    not_uploaded: { 
      bg: 'bg-muted/50', 
      border: 'border-dashed border-muted-foreground/30',
      icon: <Upload className="h-6 w-6 text-muted-foreground" />,
      label: 'Enviar'
    },
    pending: { 
      bg: 'bg-[#FF007F]/10', 
      border: 'border-[#FF007F]/30',
      icon: <Clock className="h-5 w-5 text-[#FF007F]" />,
      label: 'Aguardando'
    },
    approved: { 
      bg: 'bg-green-500/10', 
      border: 'border-green-500/30',
      icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      label: 'Aprovado'
    },
    rejected: { 
      bg: 'bg-destructive/10', 
      border: 'border-destructive/30',
      icon: <XCircle className="h-5 w-5 text-destructive" />,
      label: 'Rejeitado'
    },
  };
  
  const config = statusConfig[status];

  return (
    <div className={cn(
      "relative flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all",
      config.bg,
      config.border,
      status === 'not_uploaded' && "hover:border-[#FF007F]/50 hover:bg-[#FF007F]/5 cursor-pointer"
    )}>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={status === 'approved' || isUploading}
      />
      
      {isUploading ? (
        <Loader2 className="h-8 w-8 animate-spin text-[#FF007F]" />
      ) : preview || storagePath ? (
        <div className="relative w-16 h-16 rounded-lg overflow-hidden">
          <img loading="lazy" decoding="async" 
            src={preview || storagePath} 
            alt={label}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-0 right-0 m-1">
            {config.icon}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2">{icon}</div>
          {config.icon}
        </>
      )}
      
      <span className="mt-2 text-xs font-medium text-center">{label}</span>
      
      <Badge 
        variant="secondary" 
        className={cn(
          "mt-1 text-[10px]",
          status === 'approved' && "bg-green-500/20 text-green-400",
          status === 'rejected' && "bg-destructive/20 text-destructive",
          status === 'pending' && "bg-[#FF007F]/20 text-[#FF007F]"
        )}
      >
        {config.label}
      </Badge>
      
      {status === 'rejected' && rejectionReason && (
        <p className="mt-2 text-[10px] text-destructive text-center">
          {rejectionReason}
        </p>
      )}
    </div>
  );
}

interface PartnerSectionProps {
  partnerNumber: PartnerNumber;
  name: string;
  onNameChange: (name: string) => void;
  documents: CoupleVerificationDoc[];
  onUpload: (type: DocType, file: File) => void;
  uploadingDoc: DocType | null;
  avatar?: string;
}

function PartnerSection({ 
  partnerNumber, 
  name, 
  onNameChange, 
  documents, 
  onUpload, 
  uploadingDoc,
  avatar 
}: PartnerSectionProps) {
  const getDocStatus = (type: DocType): 'pending' | 'approved' | 'rejected' | 'not_uploaded' => {
    const doc = documents.find(d => d.document_type === type);
    if (!doc) return 'not_uploaded';
    return doc.status as 'pending' | 'approved' | 'rejected';
  };

  const getDocInfo = (type: DocType) => {
    return documents.find(d => d.document_type === type);
  };

  return (
    <Card className="flex-1 bg-card/50 backdrop-blur-sm border-border/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border-2 border-[#FF007F]/30">
            <AvatarImage src={avatar} />
            <AvatarFallback className="bg-[#FF007F]/10 text-[#FF007F]">
              {name?.[0]?.toUpperCase() || partnerNumber}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-base">
              Parceiro(a) {partnerNumber}
            </CardTitle>
            <CardDescription className="text-xs">
              Documentos de verificação
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Nome do parceiro */}
        <div className="space-y-2">
          <Label htmlFor={`partner${partnerNumber}-name`} className="text-xs">
            Seu Nome Real (Parceiro {partnerNumber})
          </Label>
          <Input
            id={`partner${partnerNumber}-name`}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Nome real do parceiro(a)"
            className="bg-background/50"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            🛡️ Seu nome real nunca será mostrado a nenhum usuário, é necessário para confirmação da sua identidade na plataforma conforme Lei LGPD.
          </p>
        </div>
        
        {/* Grid de uploads */}
        <div className="grid grid-cols-3 gap-2">
          <DocUploadCard
            type="id_front"
            label="RG Frente"
            icon={<IdCard className="h-6 w-6 text-muted-foreground" />}
            status={getDocStatus('id_front')}
            storagePath={getDocInfo('id_front')?.storage_path}
            rejectionReason={getDocInfo('id_front')?.rejection_reason || undefined}
            onUpload={(file) => onUpload('id_front', file)}
            isUploading={uploadingDoc === 'id_front'}
          />
          <DocUploadCard
            type="id_back"
            label="RG Verso"
            icon={<IdCard className="h-6 w-6 text-muted-foreground rotate-180" />}
            status={getDocStatus('id_back')}
            storagePath={getDocInfo('id_back')?.storage_path}
            rejectionReason={getDocInfo('id_back')?.rejection_reason || undefined}
            onUpload={(file) => onUpload('id_back', file)}
            isUploading={uploadingDoc === 'id_back'}
          />
          <DocUploadCard
            type="selfie"
            label="Selfie"
            icon={<Camera className="h-6 w-6 text-muted-foreground" />}
            status={getDocStatus('selfie')}
            storagePath={getDocInfo('selfie')?.storage_path}
            rejectionReason={getDocInfo('selfie')?.rejection_reason || undefined}
            onUpload={(file) => onUpload('selfie', file)}
            isUploading={uploadingDoc === 'selfie'}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function CoupleVerificationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: verificationStatus, isLoading } = useCoupleVerificationStatus();
  const uploadDoc = useUploadVerificationDoc();
  const updateNames = useUpdatePartnerNames();
  
  const [partner1Name, setPartner1Name] = useState('');
  const [partner2Name, setPartner2Name] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState<{ partner: PartnerNumber; type: DocType } | null>(null);

  // Atualizar nomes quando verificationStatus carregar
  useEffect(() => {
    if (verificationStatus?.partner1.name) setPartner1Name(verificationStatus.partner1.name);
    if (verificationStatus?.partner2.name) setPartner2Name(verificationStatus.partner2.name);
  }, [verificationStatus]);

  const handleUpload = async (partner: PartnerNumber, type: DocType, file: File) => {
    if (!profile?.id) return;
    
    setUploadingDoc({ partner, type });
    
    try {
      await uploadDoc.mutateAsync({
        partnerNumber: partner,
        documentType: type,
        file
      });
      toast.success("Documento enviado com sucesso!");
    } catch (error) {
      toast.error("Erro ao enviar documento");
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleSaveNames = async () => {
    if (!profile?.id) return;
    
    try {
      await updateNames.mutateAsync({
        partner1Name,
        partner2Name
      });
      toast.success("Nomes atualizados!");
    } catch (error) {
      toast.error("Erro ao atualizar nomes");
    }
  };

  // Calcular progresso
  const calculateProgress = () => {
    if (!verificationStatus) return 0;
    
    const partner1Docs = verificationStatus.partner1.documents.length;
    const partner2Docs = verificationStatus.partner2.documents.length;
    const totalDocs = 6; // 3 docs por parceiro
    const uploadedDocs = partner1Docs + partner2Docs;
    
    return Math.round((uploadedDocs / totalDocs) * 100);
  };

  const progress = calculateProgress();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF007F]" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-[#FF007F]" fill="#FF007F" />
            <h1 className="text-xl font-bold">Verificação de Casal</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Envie os documentos de ambos para receber o selo de casal verificado
          </p>
        </div>
        
        {verificationStatus?.isFullyVerified && (
          <Badge className="bg-[#FF007F] text-white gap-1">
            <Shield className="h-3 w-3" />
            Verificado
          </Badge>
        )}
      </div>

      {/* Progresso */}
      <Card className="bg-card/50 backdrop-blur-sm border-border/30">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Progresso: {progress}%
            </span>
            <span className="text-xs text-muted-foreground">
              {progress === 100 ? 'Documentos completos!' : `${Math.round(progress / 100 * 6)}/6 documentos`}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          
          {progress === 100 && !verificationStatus?.isFullyVerified && (
            <div className="mt-3 flex items-center gap-2 text-sm text-[#FF007F]">
              <Clock className="h-4 w-4" />
              <span>Aguardando revisão da equipe</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aviso */}
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="flex items-start gap-3 pt-4">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-amber-500">Importante</p>
            <p className="text-muted-foreground">
              Seus documentos são criptografados e usados apenas para verificação. 
              Após aprovação, as imagens são excluídas automaticamente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Seções dos parceiros */}
      <div className="grid md:grid-cols-2 gap-4">
        <PartnerSection
          partnerNumber={1}
          name={partner1Name}
          onNameChange={setPartner1Name}
          documents={verificationStatus?.partner1.documents || []}
          onUpload={(type, file) => handleUpload(1, type, file)}
          uploadingDoc={uploadingDoc?.partner === 1 ? uploadingDoc.type : null}
          avatar={profile?.avatar_url || undefined}
        />
        
        <PartnerSection
          partnerNumber={2}
          name={partner2Name}
          onNameChange={setPartner2Name}
          documents={verificationStatus?.partner2.documents || []}
          onUpload={(type, file) => handleUpload(2, type, file)}
          uploadingDoc={uploadingDoc?.partner === 2 ? uploadingDoc.type : null}
        />
      </div>

      {/* Botão salvar nomes */}
      {(partner1Name !== verificationStatus?.partner1.name || partner2Name !== verificationStatus?.partner2.name) && (
        <div className="flex justify-center">
          <Button 
            onClick={handleSaveNames}
            disabled={updateNames.isPending}
            className="bg-[#FF007F] hover:bg-[#FF007F]/90"
          >
            {updateNames.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Nomes
          </Button>
        </div>
      )}

      {/* Benefícios */}
      <Card className="bg-gradient-to-br from-[#FF007F]/10 to-purple-500/10 border-[#FF007F]/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#FF007F]" />
            Benefícios do Selo de Casal Verificado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid sm:grid-cols-2 gap-2 text-sm">
            {[
              "Prioridade no Feed e Stories",
              "Destaque no Radar",
              "Badge exclusivo no perfil",
              "Prioridade nas mensagens",
              "Mais confiança dos outros usuários",
              "Acesso a eventos exclusivos"
            ].map((benefit, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#FF007F] shrink-0" />
                <span className="text-muted-foreground">{benefit}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
