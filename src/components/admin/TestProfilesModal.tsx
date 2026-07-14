// Modal para exibir credenciais dos perfis de teste criados
import { useState } from 'react';
import { Copy, Check, FlaskConical, Eye, EyeOff, UserCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { type TestProfileCredentials } from '@/hooks/useTestProfiles';

interface TestProfilesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: TestProfileCredentials[];
}

export function TestProfilesModal({ open, onOpenChange, profiles }: TestProfilesModalProps) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const getPlanBadge = (planType: string) => {
    switch (planType) {
      case 'free':
        return <Badge variant="outline" className="text-muted-foreground">Gratuito</Badge>;
      case 'premium':
      case 'monthly':
        return <Badge className="bg-primary/20 text-primary border-primary/30">Premium</Badge>;
      case 'vip':
        return <Badge className="bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">VIP</Badge>;
      default:
        return null;
    }
  };

  const copyCredentials = (profile: TestProfileCredentials, index: number) => {
    const text = `Email: ${profile.email}\nSenha: ${profile.password}`;
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast({
      title: 'Credenciais copiadas!',
      description: `${profile.name} (${profile.email})`,
    });
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const copyAllCredentials = () => {
    const text = profiles.map(p => 
      `${p.name} (${p.plan_type.toUpperCase()})\nEmail: ${p.email}\nSenha: ${p.password}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    toast({
      title: 'Todas as credenciais copiadas!',
      description: `${profiles.length} perfis copiados para a área de transferência.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[hsl(45,93%,47%)]/10">
              <FlaskConical className="h-5 w-5 text-[hsl(45,93%,47%)]" />
            </div>
            Perfis de Teste Criados!
          </DialogTitle>
          <DialogDescription>
            Esses perfis são <strong>invisíveis</strong> no radar, buscas e visitas.
            Use-os para testar funcionalidades da plataforma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
          {profiles.map((profile, index) => (
            <div
              key={profile.email}
              className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{profile.name}</span>
                  {getPlanBadge(profile.plan_type)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCredentials(profile, index)}
                  className="h-8 px-2"
                >
                  {copiedIndex === index ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-12">Email:</span>
                  <code className="bg-background px-2 py-0.5 rounded text-xs">
                    {profile.email}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-12">Senha:</span>
                  <code className="bg-background px-2 py-0.5 rounded text-xs">
                    {showPasswords ? profile.password : '••••••••'}
                  </code>
                </div>
              </div>

              {/* Indicadores de funcionalidades */}
              <div className="flex flex-wrap gap-1 pt-1">
                {profile.plan_type === 'free' && (
                  <>
                    <Badge variant="outline" className="text-[10px] py-0">Blur ativo</Badge>
                    <Badge variant="outline" className="text-[10px] py-0">Vê anúncios</Badge>
                    <Badge variant="outline" className="text-[10px] py-0">Limite de msgs</Badge>
                  </>
                )}
                {profile.plan_type === 'monthly' && (
                  <>
                    <Badge variant="outline" className="text-[10px] py-0 text-primary border-primary/30">Sem blur</Badge>
                    <Badge variant="outline" className="text-[10px] py-0 text-primary border-primary/30">Sem anúncios</Badge>
                    <Badge variant="outline" className="text-[10px] py-0 text-primary border-primary/30">Cupons ativos</Badge>
                  </>
                )}
                {profile.plan_type === 'vip' && (
                  <>
                    <Badge variant="outline" className="text-[10px] py-0 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">
                      <UserCheck className="h-3 w-3 mr-1" />
                      Verificado
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">
                      Modo Fantasma
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0 text-[hsl(45,93%,47%)] border-[hsl(45,93%,47%)]/30">
                      Limites ∞
                    </Badge>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPasswords(!showPasswords)}
            className="gap-2"
          >
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPasswords ? 'Ocultar Senhas' : 'Mostrar Senhas'}
          </Button>
          <Button
            variant="outline"
            onClick={copyAllCredentials}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            Copiar Todas
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
