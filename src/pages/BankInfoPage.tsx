import { useState, useEffect } from "react";
import {
  Landmark,
  Key,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  Copy,
  Check,
  Pencil,
  Info,
  ChevronRight,
  CreditCard,
  Phone,
  Mail,
  Hash,
  Building2,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF", icon: CreditCard, placeholder: "000.000.000-00", mask: true },
  { value: "cnpj", label: "CNPJ", icon: Building2, placeholder: "00.000.000/0000-00", mask: true },
  { value: "phone", label: "Celular", icon: Phone, placeholder: "+55 (11) 99999-9999", mask: false },
  { value: "email", label: "E-mail", icon: Mail, placeholder: "seu@email.com", mask: false },
  { value: "random", label: "Chave Aleatória", icon: Hash, placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", mask: false },
];

export default function BankInfoPage() {
  const { user } = useAuth();
  const { profile, isLoading } = useProfile();

  // Form state
  const [pixKeyType, setPixKeyType] = useState("cpf");
  const [pixKey, setPixKey] = useState("");
  const [asaasWalletId, setAsaasWalletId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Modal states
  const [showEditPixModal, setShowEditPixModal] = useState(false);
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
  const [pendingData, setPendingData] = useState<{ pix_key?: string; pix_key_type?: string } | null>(null);

  // Edit buffer
  const [editPixKey, setEditPixKey] = useState("");
  const [editPixKeyType, setEditPixKeyType] = useState("cpf");

  // Load from profile
  useEffect(() => {
    if (profile) {
      const p = profile as any;
      if (p.pix_key_type) setPixKeyType(p.pix_key_type);
      if (p.pix_key) setPixKey(p.pix_key);
      if (p.asaas_wallet_id) setAsaasWalletId(p.asaas_wallet_id);
    }
  }, [profile]);

  const selectedPixType = PIX_KEY_TYPES.find((t) => t.value === pixKeyType);
  const editSelectedPixType = PIX_KEY_TYPES.find((t) => t.value === editPixKeyType);

  const handleOpenEditPix = () => {
    setEditPixKey(pixKey);
    setEditPixKeyType(pixKeyType);
    setShowEditPixModal(true);
  };

  const handleConfirmPix = () => {
    if (!editPixKey.trim()) {
      toast({ title: "Chave PIX obrigatória", variant: "destructive" });
      return;
    }
    setPendingData({ pix_key: editPixKey.trim(), pix_key_type: editPixKeyType });
    setShowEditPixModal(false);
    setShowConfirmSaveModal(true);
  };

  const handleSave = async () => {
    if (!pendingData || !user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update(pendingData)
        .eq("id", user.id);

      if (error) throw error;

      // Update local state
      if (pendingData.pix_key) setPixKey(pendingData.pix_key);
      if (pendingData.pix_key_type) setPixKeyType(pendingData.pix_key_type);
      // asaas_wallet_id removido — gerenciado automaticamente pela plataforma

      toast({
        title: "Dados bancários salvos!",
        description: "Suas informações foram atualizadas com sucesso.",
      });
      setShowConfirmSaveModal(false);
      setPendingData(null);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40" />
        <Skeleton className="h-52" />
        <Skeleton className="h-36" />
      </div>
    );
  }

  const hasPixKey = !!pixKey;
  const hasWalletId = !!asaasWalletId;

  return (
    <div className="p-4 md:p-6 pb-24 md:pb-8 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Landmark className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Dados Bancários</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas informações de recebimento</p>
        </div>
      </div>

      {/* Security notice */}
      <Alert className="border-primary/20 bg-primary/5">
        <Shield className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-muted-foreground">
          Seus dados bancários são criptografados e utilizados exclusivamente para processar saques e pagamentos via PIX.
        </AlertDescription>
      </Alert>

      {/* PIX Key Card */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Chave PIX</CardTitle>
            </div>
            {hasPixKey && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Configurada
              </Badge>
            )}
            {!hasPixKey && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-xs gap-1">
                <AlertCircle className="h-3 w-3" />
                Pendente
              </Badge>
            )}
          </div>
          <CardDescription>
            Utilizada para receber saques e pagamentos da plataforma
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {hasPixKey ? (
            <div className="space-y-3">
              {/* Type badge */}
              <div className="flex items-center gap-2">
                {selectedPixType && (
                  <>
                    <selectedPixType.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {selectedPixType.label}
                    </span>
                  </>
                )}
              </div>

              {/* Key display */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/50">
                <span className="flex-1 font-mono text-sm text-foreground truncate">{pixKey}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => copyToClipboard(pixKey)}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-border/50"
                onClick={handleOpenEditPix}
              >
                <Pencil className="h-3.5 w-3.5" />
                Alterar Chave PIX
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cadastre sua chave PIX para receber pagamentos e solicitar saques.
              </p>
              <Button
                onClick={handleOpenEditPix}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Key className="h-4 w-4" />
                Cadastrar Chave PIX
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status de Recebimento (gerenciado pelo Oculto) */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Conta de Recebimento</CardTitle>
            </div>
            {hasWalletId ? (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Ativa
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-xs gap-1">
                <Clock className="h-3 w-3" />
                Em análise
              </Badge>
            )}
          </div>
          <CardDescription>
            Pagamentos gerenciados pelo Oculto — você não precisa configurar gateway.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <Alert className="border-primary/20 bg-primary/5">
            <Shield className="h-4 w-4 text-primary" />
            <AlertDescription className="text-xs text-muted-foreground">
              {hasWalletId
                ? "Sua conta de recebimento está ativa. O repasse é feito automaticamente para sua chave PIX após cada venda."
                : "Sua conta de recebimento está sendo configurada automaticamente pela equipe Oculto. Você será notificado assim que estiver ativa."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Info card: split breakdown */}
      <Card className="border-border/30 bg-muted/20">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Split de Pagamentos</p>
          <div className="space-y-2">
            {[
              { label: "Lucro da plataforma", value: "20%", primary: false },
              { label: "Reserva de impostos", value: "6%", primary: false },
              { label: "Seu repasse líquido", value: "74%", primary: true },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className={`text-sm ${item.primary ? "text-primary" : "text-muted-foreground"}`}>{item.label}</span>
                <span className={`text-sm ${item.primary ? "font-bold text-primary" : "font-medium text-muted-foreground"}`}>{item.value}</span>
              </div>
            ))}
          </div>
          <Separator className="my-3 bg-border/30" />
          <p className="text-xs text-muted-foreground">
            O repasse é processado automaticamente via gateway de pagamento. Saques mínimos de <strong className="text-foreground">R$ 250,00</strong> com limite diário de <strong className="text-foreground">R$ 1.000,00</strong>.
          </p>
        </CardContent>
      </Card>

      {/* ── Edit PIX Modal ── */}
      <Dialog open={showEditPixModal} onOpenChange={setShowEditPixModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              {hasPixKey ? "Alterar Chave PIX" : "Cadastrar Chave PIX"}
            </DialogTitle>
            <DialogDescription>
              Informe o tipo e o valor da sua chave PIX para recebimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector */}
            <div className="space-y-2">
              <Label>Tipo de Chave</Label>
              <Select value={editPixKeyType} onValueChange={(v) => { setEditPixKeyType(v); setEditPixKey(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {PIX_KEY_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <type.icon className="h-4 w-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Key input */}
            <div className="space-y-2">
              <Label>Chave PIX</Label>
              <Input
                placeholder={editSelectedPixType?.placeholder || ""}
                value={editPixKey}
                onChange={(e) => setEditPixKey(e.target.value)}
                className="font-mono"
              />
              {editSelectedPixType && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Digite sua chave do tipo <strong>{editSelectedPixType.label}</strong>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowEditPixModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPix} className="bg-primary text-primary-foreground gap-2">
              <ChevronRight className="h-4 w-4" />
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Wallet ID Modal removido — Wallet é gerenciado pela plataforma */}

      {/* ── Confirm Save Modal ── */}
      <Dialog open={showConfirmSaveModal} onOpenChange={setShowConfirmSaveModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Confirmar Alteração
            </DialogTitle>
            <DialogDescription>
              Verifique os dados antes de salvar. Esta ação substituirá as informações atuais.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            {pendingData?.pix_key && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border/50 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Chave PIX</p>
                <p className="text-sm font-mono text-foreground">{pendingData.pix_key}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  Tipo: {PIX_KEY_TYPES.find(t => t.value === pendingData.pix_key_type)?.label}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirmSaveModal(false)} disabled={isSaving}>
              Voltar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-primary text-primary-foreground gap-2">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
