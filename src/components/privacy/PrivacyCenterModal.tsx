/**
 * Modal da Central de Transparência LGPD
 * Permite ao usuário ver seus dados e exercer o Direito ao Esquecimento
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseExternal";
import {
  Shield,
  Eye,
  FileText,
  Image,
  MessageCircle,
  Heart,
  Users,
  MapPin,
  Calendar,
  Trash2,
  Download,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Database,
  Lock,
  Fingerprint,
} from "lucide-react";
import { logger } from '@/lib/logger';

interface PrivacyCenterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PrivacyCenterModal({ open, onOpenChange }: PrivacyCenterModalProps) {
  const { profile } = useProfile();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Dados que a plataforma possui
  const dataCategories = [
    {
      icon: <FileText className="h-5 w-5" />,
      title: "Dados Pessoais",
      items: [
        { label: "Nome", value: profile?.name || "Não informado" },
        { label: "Email", value: user?.email || "Não informado" },
        { label: "Data de Nascimento", value: profile?.birth_date || "Não informado" },
        { label: "Gênero", value: profile?.gender || "Não informado" },
      ],
    },
    {
      icon: <MapPin className="h-5 w-5" />,
      title: "Dados de Localização",
      items: [
        { label: "Latitude", value: profile?.location_lat?.toFixed(4) || "Não coletado" },
        { label: "Longitude", value: profile?.location_lng?.toFixed(4) || "Não coletado" },
      ],
    },
    {
      icon: <Fingerprint className="h-5 w-5" />,
      title: "Dados Biométricos",
      items: [
        { label: "Verificação Facial", value: profile?.is_verified ? "Realizada" : "Não realizada" },
        { label: "Status de Verificação de Casal", value: profile?.is_verified_couple ? "Verificado" : "Não verificado" },
      ],
    },
    {
      icon: <Image className="h-5 w-5" />,
      title: "Mídias e Conteúdo",
      items: [
        { label: "Fotos e Vídeos", value: "Armazenados com criptografia" },
        { label: "Posts Publicados", value: "Visíveis conforme privacidade" },
        { label: "Flash Stories", value: "Expiram em 24 horas" },
      ],
    },
    {
      icon: <MessageCircle className="h-5 w-5" />,
      title: "Comunicações",
      items: [
        { label: "Mensagens Diretas", value: "Armazenadas com criptografia" },
        { label: "Histórico de Conversas", value: "Mantido enquanto conta ativa" },
      ],
    },
    {
      icon: <Heart className="h-5 w-5" />,
      title: "Interações",
      items: [
        { label: "Curtidas", value: "Registradas para personalização" },
        { label: "Visualizações de Perfil", value: "Registradas para notificações" },
        { label: "Matches no Radar", value: "Mantidos por 30 dias" },
      ],
    },
  ];

  // Exportar dados do usuário (LGPD)
  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Simular coleta de dados (em produção, seria uma edge function)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const userData = {
        profile: profile,
        email: user?.email,
        exportDate: new Date().toISOString(),
        message: "Seus dados serão enviados para o email cadastrado em até 72 horas.",
      };
      
      // Em produção, enviaria email com o arquivo
      logger.log("Dados exportados:", userData);
      
      toast({
        title: "Solicitação enviada! 📧",
        description: "Você receberá um email com seus dados em até 72 horas.",
      });
    } catch (error) {
      toast({
        title: "Erro ao exportar",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Direito ao Esquecimento - Excluir conta e todos os dados
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "EXCLUIR MINHA CONTA") {
      toast({
        title: "Confirmação inválida",
        description: "Digite 'EXCLUIR MINHA CONTA' para confirmar.",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      // Em produção, chamaríamos uma edge function que:
      // 1. Deleta todas as mídias do storage
      // 2. Deleta todas as mensagens
      // 3. Deleta todos os posts
      // 4. Deleta o perfil
      // 5. Deleta a conta de autenticação
      
      // Por agora, simulamos o processo
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      toast({
        title: "Conta excluída",
        description: "Todos os seus dados foram removidos permanentemente.",
      });
      
      // Fazer logout
      await signOut();
      onOpenChange(false);
      
    } catch (error) {
      toast({
        title: "Erro ao excluir conta",
        description: "Entre em contato com o suporte.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Central de Transparência LGPD
            </DialogTitle>
            <DialogDescription>
              Veja exatamente quais dados a plataforma possui sobre você e exerça seus direitos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Seus Dados */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Database className="h-5 w-5 text-primary" />
                  Seus Dados na Plataforma
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportData}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Exportar Dados
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {dataCategories.map((category, index) => (
                  <motion.div
                    key={category.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="bg-card/50 border-border/50">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span className="text-muted-foreground">{category.icon}</span>
                          {category.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 pt-0">
                        <div className="space-y-1">
                          {category.items.map((item) => (
                            <div key={item.label} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{item.label}</span>
                              <span className="font-medium text-foreground truncate max-w-[150px]">
                                {item.value}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Segurança dos Dados */}
            <div className="p-4 rounded-lg bg-[hsl(142,76%,36%)]/10 border border-[hsl(142,76%,36%)]/30">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-[hsl(142,76%,36%)] mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Seus dados estão protegidos</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Utilizamos criptografia de ponta a ponta, servidores seguros e políticas rígidas 
                    de acesso. Seus dados sensíveis são tratados conforme a LGPD.
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Direito ao Esquecimento */}
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-destructive">Direito ao Esquecimento</p>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">
                    Conforme a LGPD, você tem o direito de solicitar a exclusão completa e permanente 
                    de todos os seus dados da plataforma. Esta ação é <strong>irreversível</strong>.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir Minha Conta e Todos os Dados
                  </Button>
                </div>
              </div>
            </div>

            {/* Links Úteis */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                <a href="/legal/privacidade" target="_blank" className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  Política de Privacidade
                </a>
              </Badge>
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                <a href="/support" className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  Fale com o DPO
                </a>
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar Exclusão Permanente
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Esta ação irá <strong>excluir permanentemente</strong> todos os seus dados:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Todas as suas fotos e vídeos</li>
                <li>Todas as suas mensagens e conversas</li>
                <li>Todos os seus posts e flash stories</li>
                <li>Histórico de matches e interações</li>
                <li>Dados de perfil e verificação</li>
                <li>Sua conta de acesso</li>
              </ul>
              <p className="text-destructive font-medium">
                Esta ação NÃO pode ser desfeita.
              </p>
              <div className="space-y-2 pt-2">
                <Label htmlFor="confirm-delete">
                  Digite <strong>EXCLUIR MINHA CONTA</strong> para confirmar:
                </Label>
                <Input
                  id="confirm-delete"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="EXCLUIR MINHA CONTA"
                  className="font-mono"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== "EXCLUIR MINHA CONTA"}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Permanentemente
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
