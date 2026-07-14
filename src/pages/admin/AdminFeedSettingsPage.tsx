import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Save, Settings2, Eye, EyeOff, Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

import { useAllFeedSettings, useUpdateFeedSettings, type FeedSettingsRow, type FeedPlan } from "@/hooks/useFeedSettings";

const PLAN_META: Record<FeedPlan, { label: string; color: string; description: string }> = {
  free:    { label: "Gratuito", color: "bg-red-500/15 text-red-400 border-red-500/30",       description: "Usuários do plano gratuito" },
  premium: { label: "Premium",  color: "bg-pink-500/15 text-pink-400 border-pink-500/30",   description: "Assinantes Premium" },
  vip:     { label: "VIP",      color: "bg-amber-500/15 text-amber-400 border-amber-500/30", description: "Assinantes VIP (acesso completo)" },
};

interface PlanCardProps {
  row: FeedSettingsRow;
}

function PlanCard({ row }: PlanCardProps) {
  const { toast } = useToast();
  const update = useUpdateFeedSettings();

  const [isEnabled, setIsEnabled] = useState(row.is_enabled);
  const [showAll, setShowAll] = useState(row.show_all);
  const [maxPosts, setMaxPosts] = useState(row.max_posts);
  const [startDate, setStartDate] = useState<Date | undefined>(row.start_date ? new Date(row.start_date) : undefined);
  const [dirty, setDirty] = useState(false);

  // Sync quando dados externos mudam
  useEffect(() => {
    setIsEnabled(row.is_enabled);
    setShowAll(row.show_all);
    setMaxPosts(row.max_posts);
    setStartDate(row.start_date ? new Date(row.start_date) : undefined);
    setDirty(false);
  }, [row.id, row.is_enabled, row.show_all, row.max_posts, row.start_date]);

  const meta = PLAN_META[row.plan_type];

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        plan_type: row.plan_type,
        is_enabled: isEnabled,
        show_all: showAll,
        max_posts: maxPosts,
        start_date: startDate ? startDate.toISOString() : null,
      });
      toast({ title: "Configuração salva", description: `Feed do plano ${meta.label} atualizado.` });
      setDirty(false);
    } catch (e: any) {
      toast({
        title: "Erro ao salvar",
        description: e?.message || "Verifique se você é admin master.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-base">Plano</CardTitle>
              <Badge variant="outline" className={cn("text-xs", meta.color)}>{meta.label}</Badge>
            </div>
            <CardDescription>{meta.description}</CardDescription>
          </div>
          <Badge variant={isEnabled ? "default" : "secondary"} className="gap-1">
            {isEnabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {isEnabled ? "Ativo" : "Desativado"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Toggle: ativar feed */}
        <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Feed habilitado</Label>
            <p className="text-xs text-muted-foreground">
              Quando desativado, usuários deste plano não veem postagens no feed principal.
            </p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={(v) => { setIsEnabled(v); setDirty(true); }} />
        </div>

        {/* Toggle: mostrar tudo */}
        <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <InfinityIcon className="h-3.5 w-3.5 text-primary" />
              Mostrar todo o conteúdo
            </Label>
            <p className="text-xs text-muted-foreground">
              Ignora o limite de quantidade — exibe todas as postagens disponíveis.
            </p>
          </div>
          <Switch checked={showAll} onCheckedChange={(v) => { setShowAll(v); setDirty(true); }} disabled={!isEnabled} />
        </div>

        {/* Quantidade */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Quantidade máxima de postagens</Label>
          <Input
            type="number"
            min={1}
            max={5000}
            value={maxPosts}
            onChange={(e) => { setMaxPosts(Math.max(1, Number(e.target.value) || 1)); setDirty(true); }}
            disabled={!isEnabled || showAll}
            className="max-w-[160px]"
          />
          <p className="text-xs text-muted-foreground">
            {showAll ? "Ignorado — exibindo tudo." : `Limite atual: ${maxPosts} postagens.`}
          </p>
        </div>

        {/* Data inicial */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Data inicial de contagem</Label>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("justify-start text-left font-normal w-[260px]", !startDate && "text-muted-foreground")}
                  disabled={!isEnabled}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Sem data (mostra desde sempre)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) => { setStartDate(d); setDirty(true); }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {startDate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStartDate(undefined); setDirty(true); }}
              >
                Limpar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Apenas postagens criadas a partir desta data serão exibidas. Vazio = todo o histórico.
          </p>
        </div>

        {/* Save */}
        <div className="flex items-center justify-end pt-2">
          <Button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminFeedSettingsPage() {
  const { data, isLoading } = useAllFeedSettings();

  return (
    <div className="container max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Configurações do Feed Principal</h1>
          <p className="text-sm text-muted-foreground">
            Controle o que cada plano vê no feed: ativar/desativar, quantidade e data inicial.
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {(['free', 'premium', 'vip'] as FeedPlan[]).map((plan) => {
            const row = data?.find((r) => r.plan_type === plan);
            if (!row) return null;
            return <PlanCard key={plan} row={row} />;
          })}
        </div>
      )}
    </div>
  );
}
