import { useState } from "react";
import { 
  Shield, 
  Snowflake, 
  Ban, 
  Gift,
  AlertTriangle,
  Crown,
  Sparkles,
  Ghost,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { 
  useFreezeUser, 
  useBanUserDiscipline, 
  useGrantPlan,
  useDisciplineHistory,
  useShadowbanUser,
  useUnshadowbanUser,
} from "@/hooks/useDiscipline";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserDisciplineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    name: string;
    username?: string | null;
    avatar_url?: string | null;
    warning_count?: number;
    account_status?: string;
    plan_type?: string;
    is_shadowbanned?: boolean;
  } | null;
}

type ActionTab = 'freeze' | 'ban' | 'grant' | 'shadowban';

export function UserDisciplineModal({ open, onOpenChange, user }: UserDisciplineModalProps) {
  const [activeTab, setActiveTab] = useState<ActionTab>('freeze');
  const [reason, setReason] = useState("");
  const [freezeDays, setFreezeDays] = useState("7");
  const [planType, setPlanType] = useState<'premium' | 'vip'>('premium');

  const freezeUser = useFreezeUser();
  const banUser = useBanUserDiscipline();
  const grantPlan = useGrantPlan();
  const shadowbanUser = useShadowbanUser();
  const unshadowbanUser = useUnshadowbanUser();
  const { data: history } = useDisciplineHistory(user?.id);

  const handleFreeze = async () => {
    if (!user || !reason) return;
    await freezeUser.mutateAsync({ 
      profileId: user.id, 
      reason, 
      days: parseInt(freezeDays) 
    });
    setReason("");
    onOpenChange(false);
  };

  const handleBan = async () => {
    if (!user || !reason) return;
    await banUser.mutateAsync({ profileId: user.id, reason });
    setReason("");
    onOpenChange(false);
  };

  const handleGrantPlan = async () => {
    if (!user) return;
    await grantPlan.mutateAsync({ 
      profileId: user.id, 
      planType, 
      reason: reason || `Plano ${planType} concedido administrativamente` 
    });
    setReason("");
    onOpenChange(false);
  };

  const handleShadowban = async () => {
    if (!user || !reason) return;
    await shadowbanUser.mutateAsync({ profileId: user.id, reason });
    setReason("");
    onOpenChange(false);
  };

  const handleUnshadowban = async () => {
    if (!user) return;
    await unshadowbanUser.mutateAsync({ profileId: user.id, reason: reason || 'Shadowban removido administrativamente' });
    setReason("");
    onOpenChange(false);
  };

  if (!user) return null;

  const warningCount = user.warning_count || 0;
  const strikesUntilBan = Math.max(0, 3 - warningCount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto scrollbar-hide p-4 sm:p-6 gap-3 sm:gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gerenciar Usuário: {user.name}
          </DialogTitle>
          <DialogDescription>
            @{user.username || 'sem-username'} • Plano: {user.plan_type || 'free'} • Strikes: {warningCount}/3
          </DialogDescription>
        </DialogHeader>

        {/* Status Atual */}
        <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={user.account_status === 'active' ? 'secondary' : 'destructive'}>
              {user.account_status === 'active' ? 'Ativo' : 
               user.account_status === 'frozen' ? 'Congelado' : 'Banido'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Strikes:</span>
            <Badge variant={warningCount >= 2 ? 'destructive' : 'secondary'}>
              {warningCount}/3
            </Badge>
          </div>
          {user.is_shadowbanned && (
            <Badge variant="outline" className="bg-purple-500/10 border-purple-500/30 text-purple-700">
              <Ghost className="h-3 w-3 mr-1" />
              Shadowbanned
            </Badge>
          )}
          {strikesUntilBan <= 1 && (
            <Badge variant="destructive" className="ml-auto animate-pulse">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {strikesUntilBan === 0 ? 'Será banido!' : 'Último aviso!'}
            </Badge>
          )}
        </div>

        {/* Tabs de Ação */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={activeTab === 'freeze' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('freeze')}
            className="flex-1 min-w-[100px]"
          >
            <Snowflake className="h-4 w-4 mr-1" />
            Congelar
          </Button>
          <Button
            variant={activeTab === 'ban' ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('ban')}
            className="flex-1 min-w-[100px]"
          >
            <Ban className="h-4 w-4 mr-1" />
            Banir
          </Button>
          <Button
            variant={activeTab === 'shadowban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('shadowban')}
            className={`flex-1 min-w-[100px] ${activeTab === 'shadowban' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
          >
            <Ghost className="h-4 w-4 mr-1" />
            Shadowban
          </Button>
          <Button
            variant={activeTab === 'grant' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('grant')}
            className="flex-1 min-w-[100px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
          >
            <Gift className="h-4 w-4 mr-1" />
            Conceder
          </Button>
        </div>

        <Separator />

        {/* Conteúdo da Tab */}
        {activeTab === 'freeze' && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm">
                <Snowflake className="h-4 w-4 inline mr-1 text-blue-500" />
                O usuário entrará em <strong>modo leitura</strong>. Não poderá postar, curtir ou comentar.
                Um banner será exibido informando a data de liberação.
              </p>
            </div>

            <div>
              <Label>Duração do Congelamento</Label>
              <RadioGroup value={freezeDays} onValueChange={setFreezeDays} className="flex gap-4 mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="3" id="3days" />
                  <Label htmlFor="3days">3 dias</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="7" id="7days" />
                  <Label htmlFor="7days">7 dias</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="14" id="14days" />
                  <Label htmlFor="14days">14 dias</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="30" id="30days" />
                  <Label htmlFor="30days">30 dias</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label>Motivo do Congelamento *</Label>
              <Textarea
                placeholder="Descreva o motivo do congelamento..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2"
              />
            </div>

            <Button 
              onClick={handleFreeze} 
              disabled={!reason || freezeUser.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Snowflake className="h-4 w-4 mr-2" />
              {freezeUser.isPending ? 'Congelando...' : `Congelar por ${freezeDays} dias (+1 Strike)`}
            </Button>
          </div>
        )}

        {activeTab === 'ban' && (
          <div className="space-y-4">
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">
                <Ban className="h-4 w-4 inline mr-1" />
                <strong>ATENÇÃO:</strong> O banimento é permanente. O usuário será deslogado 
                imediatamente e não conseguirá mais acessar a plataforma.
              </p>
            </div>

            <div>
              <Label>Motivo do Banimento *</Label>
              <Textarea
                placeholder="Descreva o motivo do banimento permanente..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 border-destructive/50"
              />
            </div>

            <Button 
              onClick={handleBan} 
              disabled={!reason || banUser.isPending}
              variant="destructive"
              className="w-full"
            >
              <Ban className="h-4 w-4 mr-2" />
              {banUser.isPending ? 'Banindo...' : 'Banir Permanentemente'}
            </Button>
          </div>
        )}

        {activeTab === 'grant' && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm">
                <Gift className="h-4 w-4 inline mr-1 text-amber-500" />
                Conceda um plano gratuitamente. Isso ignora o gateway de pagamento e ativa o plano diretamente.
              </p>
            </div>

            <div>
              <Label>Selecione o Plano</Label>
              <RadioGroup value={planType} onValueChange={(v) => setPlanType(v as 'premium' | 'vip')} className="flex gap-6 mt-3">
                <div className="flex items-center space-x-2 p-3 border rounded-lg flex-1 cursor-pointer hover:bg-muted/50">
                  <RadioGroupItem value="premium" id="premium" />
                  <Label htmlFor="premium" className="cursor-pointer flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    Premium
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 border rounded-lg flex-1 cursor-pointer hover:bg-muted/50 border-amber-500/50">
                  <RadioGroupItem value="vip" id="vip" />
                  <Label htmlFor="vip" className="cursor-pointer flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-500" />
                    VIP
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label>Motivo (opcional)</Label>
              <Textarea
                placeholder="Ex: Compensação por problema técnico, parceria, etc..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2"
              />
            </div>

            <Button 
              onClick={handleGrantPlan} 
              disabled={grantPlan.isPending}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              <Gift className="h-4 w-4 mr-2" />
              {grantPlan.isPending ? 'Concedendo...' : `Conceder Plano ${planType.toUpperCase()}`}
            </Button>
          </div>
        )}

        {activeTab === 'shadowban' && (
          <div className="space-y-4">
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <p className="text-sm">
                <Ghost className="h-4 w-4 inline mr-1 text-purple-500" />
                {user.is_shadowbanned ? (
                  <>
                    <strong>Usuário está shadowbanned.</strong> Ele pode usar a plataforma normalmente, 
                    mas suas ações (posts, curtidas, comentários) não são visíveis para outros usuários.
                  </>
                ) : (
                  <>
                    <strong>Shadowban é um banimento invisível.</strong> O usuário continuará usando a plataforma 
                    normalmente, mas suas ações não serão visíveis para outros. Ele não saberá que foi banido.
                  </>
                )}
              </p>
            </div>

            <div>
              <Label>Motivo {user.is_shadowbanned ? '(opcional)' : '*'}</Label>
              <Textarea
                placeholder={user.is_shadowbanned 
                  ? "Motivo para remover o shadowban..." 
                  : "Descreva o motivo do shadowban..."
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 border-purple-500/30"
              />
            </div>

            {user.is_shadowbanned ? (
              <Button 
                onClick={handleUnshadowban} 
                disabled={unshadowbanUser.isPending}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Ghost className="h-4 w-4 mr-2" />
                {unshadowbanUser.isPending ? 'Removendo...' : 'Remover Shadowban'}
              </Button>
            ) : (
              <Button 
                onClick={handleShadowban} 
                disabled={!reason || shadowbanUser.isPending}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                <Ghost className="h-4 w-4 mr-2" />
                {shadowbanUser.isPending ? 'Aplicando...' : 'Aplicar Shadowban'}
              </Button>
            )}
          </div>
        )}

        {/* Histórico Recente */}
        {history && history.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">Histórico Disciplinar Recente</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {history.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-xs p-2 bg-muted/30 rounded">
                    <Badge variant="outline" className="text-xs">
                      {entry.action_type}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at), { locale: ptBR, addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
