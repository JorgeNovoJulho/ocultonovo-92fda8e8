import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { 
  Trophy, Star, Gift, Users, Zap, Target, Crown, 
  Plus, Edit, Sparkles, TrendingUp, Award, Gem
} from "lucide-react";
import { 
  useAchievements, 
  useAllRewards, 
  useLevelDefinitions,
  useGamificationStats,
  useManageAchievement,
  useManageReward,
  getRarityColor,
  getRarityLabel,
  type Achievement,
  type Reward
} from "@/hooks/useGamification";
import { cn } from "@/lib/utils";

export default function AdminGamificationPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            Sistema de Gamificação
          </h1>
          <p className="text-muted-foreground">
            Gerencie achievements, níveis, XP e recompensas
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="achievements" className="flex items-center gap-2">
            <Trophy className="h-4 w-4" />
            Achievements
          </TabsTrigger>
          <TabsTrigger value="levels" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Níveis
          </TabsTrigger>
          <TabsTrigger value="rewards" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Recompensas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="achievements">
          <AchievementsTab />
        </TabsContent>
        <TabsContent value="levels">
          <LevelsTab />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab() {
  const { data: stats, isLoading } = useGamificationStats();
  const { data: levels } = useLevelDefinitions();

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted rounded-lg" />)}
      </div>
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Usuários com Níveis</p>
                <p className="text-2xl font-bold">{stats?.usersWithLevels || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <Trophy className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Achievements Desbloqueados</p>
                <p className="text-2xl font-bold">{stats?.totalAchievements || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-500/10">
                <Zap className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">XP Total Distribuído</p>
                <p className="text-2xl font-bold">{(stats?.totalXP || 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-500/10">
                <Gift className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Resgates Realizados</p>
                <p className="text-2xl font-bold">{stats?.totalRedemptions || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Level Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Distribuição por Nível
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {levels?.map((level) => {
              const count = stats?.levelDistribution?.[level.level_number] || 0;
              const total = stats?.usersWithLevels || 1;
              const percentage = (count / total) * 100;

              return (
                <div key={level.id} className="flex items-center gap-4">
                  <div className="w-24 flex items-center gap-2">
                    <span 
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: level.color }}
                    >
                      {level.level_number}
                    </span>
                    <span className="text-sm font-medium truncate">{level.name}</span>
                  </div>
                  <div className="flex-1">
                    <Progress value={percentage} className="h-2" />
                  </div>
                  <div className="w-20 text-right text-sm text-muted-foreground">
                    {count} ({percentage.toFixed(1)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AchievementsTab() {
  const { data: achievements, isLoading } = useAchievements();
  const manageAchievement = useManageAchievement();
  const [editingAchievement, setEditingAchievement] = useState<Partial<Achievement> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSave = () => {
    if (editingAchievement) {
      manageAchievement.mutate(editingAchievement as any, {
        onSuccess: () => {
          setIsDialogOpen(false);
          setEditingAchievement(null);
        }
      });
    }
  };

  const categories = [...new Set(achievements?.map(a => a.category) || [])];

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          {achievements?.length || 0} achievements configurados
        </p>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingAchievement({
              code: '',
              name: '',
              description: '',
              icon: 'trophy',
              color: '#FFD700',
              category: 'general',
              xp_reward: 50,
              rarity: 'common',
              is_secret: false,
              is_active: true,
            })}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Achievement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingAchievement?.id ? 'Editar' : 'Novo'} Achievement
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Código</Label>
                  <Input
                    value={editingAchievement?.code || ''}
                    onChange={(e) => setEditingAchievement(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="first_message"
                  />
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={editingAchievement?.name || ''}
                    onChange={(e) => setEditingAchievement(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Primeiro Contato"
                  />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={editingAchievement?.description || ''}
                  onChange={(e) => setEditingAchievement(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Envie sua primeira mensagem"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Ícone</Label>
                  <Input
                    value={editingAchievement?.icon || ''}
                    onChange={(e) => setEditingAchievement(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="trophy"
                  />
                </div>
                <div>
                  <Label>Cor</Label>
                  <Input
                    type="color"
                    value={editingAchievement?.color || '#FFD700'}
                    onChange={(e) => setEditingAchievement(prev => ({ ...prev, color: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>XP Reward</Label>
                  <Input
                    type="number"
                    value={editingAchievement?.xp_reward || 0}
                    onChange={(e) => setEditingAchievement(prev => ({ ...prev, xp_reward: parseInt(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Categoria</Label>
                  <Input
                    value={editingAchievement?.category || ''}
                    onChange={(e) => setEditingAchievement(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="social"
                  />
                </div>
                <div>
                  <Label>Raridade</Label>
                  <Select
                    value={editingAchievement?.rarity || 'common'}
                    onValueChange={(v) => setEditingAchievement(prev => ({ ...prev, rarity: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="common">Comum</SelectItem>
                      <SelectItem value="uncommon">Incomum</SelectItem>
                      <SelectItem value="rare">Raro</SelectItem>
                      <SelectItem value="epic">Épico</SelectItem>
                      <SelectItem value="legendary">Lendário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingAchievement?.is_active}
                    onCheckedChange={(c) => setEditingAchievement(prev => ({ ...prev, is_active: c }))}
                  />
                  <Label>Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingAchievement?.is_secret}
                    onCheckedChange={(c) => setEditingAchievement(prev => ({ ...prev, is_secret: c }))}
                  />
                  <Label>Secreto</Label>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={manageAchievement.isPending}>
                {manageAchievement.isPending ? 'Salvando...' : 'Salvar Achievement'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Achievements by Category */}
      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {achievements?.filter(a => a.category === category).map((achievement) => (
                <div
                  key={achievement.id}
                  className={cn(
                    "p-4 rounded-lg border flex items-start gap-3 cursor-pointer hover:bg-accent/50 transition-colors",
                    !achievement.is_active && "opacity-50"
                  )}
                  onClick={() => {
                    setEditingAchievement(achievement);
                    setIsDialogOpen(true);
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: `${achievement.color}20`, color: achievement.color }}
                  >
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{achievement.name}</h4>
                      {achievement.is_secret && (
                        <Badge variant="outline" className="text-xs">Secreto</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{achievement.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: `${getRarityColor(achievement.rarity)}20`,
                          color: getRarityColor(achievement.rarity)
                        }}
                      >
                        {getRarityLabel(achievement.rarity)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">+{achievement.xp_reward} XP</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LevelsTab() {
  const { data: levels, isLoading } = useLevelDefinitions();

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Definições de Níveis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {levels?.map((level, index) => (
              <div
                key={level.id}
                className="flex items-center gap-4 p-4 rounded-lg border"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: level.color }}
                >
                  {level.level_number}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{level.name}</h4>
                    <Badge variant="outline">{level.xp_required.toLocaleString()} XP</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {level.perks.map((perk, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {perk}
                      </Badge>
                    ))}
                  </div>
                </div>
                {index < (levels?.length || 0) - 1 && (
                  <div className="text-sm text-muted-foreground">
                    +{((levels?.[index + 1]?.xp_required || 0) - level.xp_required).toLocaleString()} XP
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RewardsTab() {
  const { data: rewards, isLoading } = useAllRewards();
  const manageReward = useManageReward();
  const [editingReward, setEditingReward] = useState<Partial<Reward> | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleSave = () => {
    if (editingReward) {
      manageReward.mutate(editingReward as any, {
        onSuccess: () => {
          setIsDialogOpen(false);
          setEditingReward(null);
        }
      });
    }
  };

  if (isLoading) {
    return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          {rewards?.length || 0} recompensas configuradas
        </p>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingReward({
              name: '',
              description: '',
              icon: 'gift',
              color: '#10B981',
              reward_type: 'credits',
              value: {},
              cost_xp: 100,
              cost_credits: 0,
              min_level: 1,
              is_active: true,
              is_limited: false,
            })}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Recompensa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingReward?.id ? 'Editar' : 'Nova'} Recompensa
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingReward?.name || ''}
                  onChange={(e) => setEditingReward(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="50 Créditos"
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={editingReward?.description || ''}
                  onChange={(e) => setEditingReward(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Receba 50 créditos na sua conta"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <Select
                    value={editingReward?.reward_type || 'credits'}
                    onValueChange={(v) => setEditingReward(prev => ({ ...prev, reward_type: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credits">Créditos</SelectItem>
                      <SelectItem value="badge">Badge</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="discount">Desconto</SelectItem>
                      <SelectItem value="physical">Físico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ícone</Label>
                  <Input
                    value={editingReward?.icon || ''}
                    onChange={(e) => setEditingReward(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="gift"
                  />
                </div>
                <div>
                  <Label>Cor</Label>
                  <Input
                    type="color"
                    value={editingReward?.color || '#10B981'}
                    onChange={(e) => setEditingReward(prev => ({ ...prev, color: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Custo XP</Label>
                  <Input
                    type="number"
                    value={editingReward?.cost_xp || 0}
                    onChange={(e) => setEditingReward(prev => ({ ...prev, cost_xp: parseInt(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>Custo Créditos</Label>
                  <Input
                    type="number"
                    value={editingReward?.cost_credits || 0}
                    onChange={(e) => setEditingReward(prev => ({ ...prev, cost_credits: parseInt(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>Nível Mínimo</Label>
                  <Input
                    type="number"
                    value={editingReward?.min_level || 1}
                    onChange={(e) => setEditingReward(prev => ({ ...prev, min_level: parseInt(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingReward?.is_active}
                    onCheckedChange={(c) => setEditingReward(prev => ({ ...prev, is_active: c }))}
                  />
                  <Label>Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingReward?.is_limited}
                    onCheckedChange={(c) => setEditingReward(prev => ({ ...prev, is_limited: c }))}
                  />
                  <Label>Estoque Limitado</Label>
                </div>
              </div>
              {editingReward?.is_limited && (
                <div>
                  <Label>Quantidade em Estoque</Label>
                  <Input
                    type="number"
                    value={editingReward?.stock || 0}
                    onChange={(e) => setEditingReward(prev => ({ ...prev, stock: parseInt(e.target.value) }))}
                  />
                </div>
              )}
              <Button onClick={handleSave} className="w-full" disabled={manageReward.isPending}>
                {manageReward.isPending ? 'Salvando...' : 'Salvar Recompensa'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards?.map((reward) => (
          <Card 
            key={reward.id} 
            className={cn(
              "cursor-pointer hover:border-primary/50 transition-colors",
              !reward.is_active && "opacity-50"
            )}
            onClick={() => {
              setEditingReward(reward);
              setIsDialogOpen(true);
            }}
          >
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${reward.color}20`, color: reward.color }}
                >
                  <Gift className="h-6 w-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate">{reward.name}</h4>
                  <p className="text-sm text-muted-foreground truncate">{reward.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {reward.cost_xp > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        {reward.cost_xp} XP
                      </Badge>
                    )}
                    {reward.cost_credits > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        R$ {reward.cost_credits}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Nível {reward.min_level}+
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{reward.redemption_count} resgates</span>
                    {reward.is_limited && reward.stock !== null && (
                      <span>• {reward.stock} em estoque</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
