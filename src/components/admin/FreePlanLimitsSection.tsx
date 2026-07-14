/**
 * Seção de Limites do Plano Free para o Admin
 */
import { useState, useEffect } from 'react';
import { 
  Lock, 
  MessageCircle, 
  Radar, 
  Users, 
  Heart,
  Crown,
  Save,
  Loader2,
  Eye,
  EyeOff,
  Link2,
  Gift,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSystemSettings, useUpdateSetting } from '@/hooks/useSystemSettings';
import { toast } from '@/hooks/use-toast';

interface FreePlanLimitsState {
  maxMessagesPerDay: number;
  maxRadarSearchesPerDay: number;
  blockComments: boolean;
  blockVipContent: boolean;
  blockAffiliate: boolean;
  blockRadar: boolean;
  blockPerfectPair: boolean;
  blockLikes: boolean;
  blockFollowers: boolean;
  blockGifts: boolean;
  blurLikes: boolean;
  blurFollowers: boolean;
}

export function FreePlanLimitsSection() {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSetting();
  const [isSaving, setIsSaving] = useState(false);

  const [limits, setLimits] = useState<FreePlanLimitsState>({
    maxMessagesPerDay: 10,
    maxRadarSearchesPerDay: 5,
    blockComments: false,
    blockVipContent: true,
    blockAffiliate: true,
    blockRadar: false,
    blockPerfectPair: false,
    blockLikes: false,
    blockFollowers: false,
    blockGifts: false,
    blurLikes: true,
    blurFollowers: true,
  });

  useEffect(() => {
    if (settings) {
      setLimits({
        maxMessagesPerDay: parseInt(String(settings['free_max_messages_per_day']?.value || '10')),
        maxRadarSearchesPerDay: parseInt(String(settings['free_max_radar_searches_per_day']?.value || '5')),
        blockComments: settings['free_block_comments']?.value === 'true',
        blockVipContent: settings['free_block_vip_content']?.value === 'true',
        blockAffiliate: settings['free_block_affiliate']?.value === 'true',
        blockRadar: settings['free_block_radar']?.value === 'true',
        blockPerfectPair: settings['free_block_perfect_pair']?.value === 'true',
        blockLikes: settings['free_block_likes']?.value === 'true',
        blockFollowers: settings['free_block_followers_view']?.value === 'true',
        blockGifts: settings['free_block_gifts']?.value === 'true',
        blurLikes: settings['free_blur_likes']?.value === 'true',
        blurFollowers: settings['free_blur_followers']?.value === 'true',
      });
    }
  }, [settings]);

  const handleToggle = async (key: keyof FreePlanLimitsState, dbKey: string) => {
    const newValue = !limits[key];
    setLimits(prev => ({ ...prev, [key]: newValue }));

    try {
      await updateSetting.mutateAsync({ key: dbKey, value: newValue });
    } catch (error) {
      // Revert on error
      setLimits(prev => ({ ...prev, [key]: !newValue }));
    }
  };

  const handleSaveNumericLimits = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        updateSetting.mutateAsync({ 
          key: 'free_max_messages_per_day', 
          value: limits.maxMessagesPerDay 
        }),
        updateSetting.mutateAsync({ 
          key: 'free_max_radar_searches_per_day', 
          value: limits.maxRadarSearchesPerDay 
        }),
      ]);

      toast({
        title: "Limites salvos",
        description: "Os limites do plano gratuito foram atualizados.",
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-card border-border/50">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-20 bg-muted rounded" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-primary/20 shadow-[0_0_30px_rgba(255,0,127,0.05)]">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Limites do Plano Free
              <Badge variant="outline" className="border-primary/30 text-primary">
                Tempo Real
              </Badge>
            </CardTitle>
            <CardDescription>
              Configure restrições para incentivar upgrades
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Numeric Limits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              Máx. Mensagens/Dia
            </Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={limits.maxMessagesPerDay}
              onChange={(e) => setLimits(prev => ({ 
                ...prev, 
                maxMessagesPerDay: parseInt(e.target.value) || 0 
              }))}
              className="bg-muted/30"
            />
            <p className="text-xs text-muted-foreground">
              0 = bloqueado totalmente
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" />
              Máx. Buscas Radar/Dia
            </Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={limits.maxRadarSearchesPerDay}
              onChange={(e) => setLimits(prev => ({ 
                ...prev, 
                maxRadarSearchesPerDay: parseInt(e.target.value) || 0 
              }))}
              className="bg-muted/30"
            />
            <p className="text-xs text-muted-foreground">
              0 = bloqueado totalmente
            </p>
          </div>
        </div>

        <Button 
          onClick={handleSaveNumericLimits} 
          disabled={isSaving}
          className="gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar Limites Numéricos
        </Button>

        <Separator className="my-6" />

        {/* Toggle Restrictions */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Bloqueios de Funcionalidades
          </h4>

          {/* Block Comments */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockComments ? 'bg-primary/20' : 'bg-muted'}`}>
                <MessageCircle className={`h-4 w-4 ${limits.blockComments ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Comentários</p>
                <p className="text-xs text-muted-foreground">
                  Usuários free não podem comentar em posts
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockComments}
              onCheckedChange={() => handleToggle('blockComments', 'free_block_comments')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block VIP Content */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockVipContent ? 'bg-primary/20' : 'bg-muted'}`}>
                <Crown className={`h-4 w-4 ${limits.blockVipContent ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Criação Conteúdo VIP</p>
                <p className="text-xs text-muted-foreground">
                  Apenas assinantes podem criar conteúdo VIP
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockVipContent}
              onCheckedChange={() => handleToggle('blockVipContent', 'free_block_vip_content')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Affiliate */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockAffiliate ? 'bg-primary/20' : 'bg-muted'}`}>
                <Link2 className={`h-4 w-4 ${limits.blockAffiliate ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Programa de Afiliados</p>
                <p className="text-xs text-muted-foreground">
                  Usuários free não podem gerar links de indicação
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockAffiliate}
              onCheckedChange={() => handleToggle('blockAffiliate', 'free_block_affiliate')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Radar */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockRadar ? 'bg-primary/20' : 'bg-muted'}`}>
                <Radar className={`h-4 w-4 ${limits.blockRadar ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Radar</p>
                <p className="text-xs text-muted-foreground">
                  Usuários no radar ficam borrados para free
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockRadar}
              onCheckedChange={() => handleToggle('blockRadar', 'free_block_radar')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Perfect Pair */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockPerfectPair ? 'bg-primary/20' : 'bg-muted'}`}>
                <Sparkles className={`h-4 w-4 ${limits.blockPerfectPair ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Perfect Pair</p>
                <p className="text-xs text-muted-foreground">
                  Matches Perfect Pair ficam borrados para free
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockPerfectPair}
              onCheckedChange={() => handleToggle('blockPerfectPair', 'free_block_perfect_pair')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Likes View */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockLikes ? 'bg-primary/20' : 'bg-muted'}`}>
                <Heart className={`h-4 w-4 ${limits.blockLikes ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Curtidas</p>
                <p className="text-xs text-muted-foreground">
                  Visualização de curtidas fica borrada para free
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockLikes}
              onCheckedChange={() => handleToggle('blockLikes', 'free_block_likes')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Followers View */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockFollowers ? 'bg-primary/20' : 'bg-muted'}`}>
                <Users className={`h-4 w-4 ${limits.blockFollowers ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Seguidores</p>
                <p className="text-xs text-muted-foreground">
                  Visualização de seguidores fica borrada para free
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockFollowers}
              onCheckedChange={() => handleToggle('blockFollowers', 'free_block_followers_view')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Block Gifts */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blockGifts ? 'bg-primary/20' : 'bg-muted'}`}>
                <Gift className={`h-4 w-4 ${limits.blockGifts ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Bloquear Presentes</p>
                <p className="text-xs text-muted-foreground">
                  Usuários free não podem receber presentes/valores
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blockGifts}
              onCheckedChange={() => handleToggle('blockGifts', 'free_block_gifts')}
              disabled={updateSetting.isPending}
            />
          </div>
        </div>

        <Separator className="my-6" />

        {/* Blur Effects */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Efeitos de Blur (Upsell)
          </h4>

          {/* Blur Likes */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blurLikes ? 'bg-primary/20' : 'bg-muted'}`}>
                <Heart className={`h-4 w-4 ${limits.blurLikes ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Blur em Quem Curtiu</p>
                <p className="text-xs text-muted-foreground">
                  Lista de curtidas fica borrada com ícone de cadeado
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blurLikes}
              onCheckedChange={() => handleToggle('blurLikes', 'free_blur_likes')}
              disabled={updateSetting.isPending}
            />
          </div>

          {/* Blur Followers */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${limits.blurFollowers ? 'bg-primary/20' : 'bg-muted'}`}>
                <Users className={`h-4 w-4 ${limits.blurFollowers ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <p className="font-medium text-sm">Blur em Seguidores</p>
                <p className="text-xs text-muted-foreground">
                  Lista de seguidores fica borrada com ícone de cadeado
                </p>
              </div>
            </div>
            <Switch
              checked={limits.blurFollowers}
              onCheckedChange={() => handleToggle('blurFollowers', 'free_blur_followers')}
              disabled={updateSetting.isPending}
            />
          </div>
        </div>

        {/* Preview Info */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mt-6">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm text-primary">Sobre as Restrições</p>
              <p className="text-xs text-muted-foreground mt-1">
                Todas as alterações são aplicadas em tempo real. Usuários gratuitos verão 
                um modal de upsell quando tentarem acessar recursos bloqueados, incentivando 
                a conversão para planos pagos.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
