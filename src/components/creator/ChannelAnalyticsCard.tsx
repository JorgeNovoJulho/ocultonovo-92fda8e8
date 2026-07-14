/**
 * ChannelAnalyticsCard — métricas do Canal VIP no painel do criador.
 * Mostra leituras por seção, top narrativas, e separa acessos BETA vs reais.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Sparkles, TrendingUp, Pin, Users, FlaskConical } from "lucide-react";
import { useChannelAnalytics } from "@/hooks/useChannelAnalytics";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";

const SECTION_LABELS: Record<string, string> = {
  story: "Histórias",
  chapter: "Capítulos",
  series: "Séries",
  diary: "Diário",
  article: "Textos",
  text_post: "Bastidores",
};

interface Props {
  creatorId?: string | null;
}

export function ChannelAnalyticsCard({ creatorId }: Props) {
  const { runtime, isBeta } = usePlatformPhase();
  const analyticsEnabled = (runtime as any).vip_analytics_enabled !== false;
  const { data, isLoading } = useChannelAnalytics(creatorId);

  if (!analyticsEnabled) {
    return (
      <Card className="gradient-border">
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Analytics do Canal VIP desativado pelo admin.
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="gradient-border">
        <CardContent className="p-6 text-sm text-muted-foreground text-center">
          Sem dados ainda. Publique conteúdo narrativo para ver as métricas.
        </CardContent>
      </Card>
    );
  }

  const totalReads = data.reads_by_section.reduce((acc, s) => acc + (s.reads_total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricMini icon={<BookOpen className="h-4 w-4 text-amber-400" />} label="Leitores ativos" value={totalReads} />
        <MetricMini icon={<Sparkles className="h-4 w-4 text-fuchsia-400" />} label="Narrativas" value={data.narrative_count} />
        <MetricMini icon={<Pin className="h-4 w-4 text-rose-400" />} label="Fixados" value={data.pinned_count} />
        <MetricMini icon={<Users className="h-4 w-4 text-green-400" />} label="Assinaturas reais" value={data.real_subscriptions} />
      </div>

      {isBeta && (
        <Card className="border-amber-400/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-amber-400" /> Beta — acessos simulados
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-background/40 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Conteúdo pago (beta)</p>
              <p className="text-2xl font-bold text-amber-300">{data.beta_paid_grants}</p>
            </div>
            <div className="rounded-lg bg-background/40 p-3">
              <p className="text-[11px] uppercase text-muted-foreground">Assinaturas (beta)</p>
              <p className="text-2xl font-bold text-amber-300">{data.beta_sub_grants}</p>
            </div>
            <p className="col-span-2 text-[11px] text-muted-foreground">
              Acessos beta não geram receita. Serão revogados quando a monetização real for ativada.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="gradient-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Leituras por seção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.reads_by_section.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma leitura registrada ainda.</p>
          )}
          {data.reads_by_section.map((s) => (
            <div key={s.section_type || "unknown"} className="flex items-center justify-between gap-3 text-sm border-b border-border/30 pb-2 last:border-0">
              <span className="font-medium">{SECTION_LABELS[s.section_type || ""] || s.section_type || "—"}</span>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{s.reads_total} leitores</Badge>
                <Badge variant="outline" className="text-[10px]">progresso médio {s.avg_progress}%</Badge>
                <Badge className="bg-green-500/20 text-green-400 border-0 text-[10px]">{s.completed} concluídas</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gradient-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-amber-400" /> Narrativas mais lidas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.top_narratives.length === 0 && (
            <p className="text-sm text-muted-foreground">Publique narrativas para ver o ranking aqui.</p>
          )}
          {data.top_narratives.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 text-sm border-b border-border/30 pb-2 last:border-0">
              <span className="w-6 text-center font-mono text-amber-400">{i + 1}º</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.title || "(sem título)"}</p>
                <p className="text-[11px] text-muted-foreground">{SECTION_LABELS[p.section_type || ""] || p.section_type || "—"}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">{p.reads_count} leituras</Badge>
              <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">{p.avg_progress}%</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="gradient-border">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
          {icon}<span>{label}</span>
        </div>
        <p className="text-xl font-bold text-foreground">{value.toLocaleString("pt-BR")}</p>
      </CardContent>
    </Card>
  );
}

export default ChannelAnalyticsCard;
