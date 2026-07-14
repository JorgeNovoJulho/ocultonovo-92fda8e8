import { useState, useEffect } from "react";
import { useLandingSettings, useUpdateLandingSetting, LandingTexts, LandingStyle, LandingTimers } from "@/hooks/useLandingSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Type, Palette, Clock, BarChart3, TrendingUp, Users, MousePointerClick, Eye, Layers } from "lucide-react";
import { useTopReferrers, useLandingConversionStats } from "@/hooks/useShareClickStats";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import LandingSectionsEditor from "@/components/admin/LandingSectionsEditor";

export default function AdminLandingEditorPage() {
  const { data: settings, isLoading } = useLandingSettings();
  const updateSetting = useUpdateLandingSetting();
  const { data: convStats } = useLandingConversionStats();
  const { data: topReferrers } = useTopReferrers(10);

  const [texts, setTexts] = useState<LandingTexts | null>(null);
  const [style, setStyle] = useState<LandingStyle | null>(null);
  const [timers, setTimers] = useState<LandingTimers | null>(null);

  useEffect(() => {
    if (settings) {
      setTexts(settings.texts);
      setStyle(settings.style);
      setTimers(settings.timers);
    }
  }, [settings]);

  const saveTexts = () => texts && updateSetting.mutate({ key: "texts", value: texts });
  const saveStyle = () => style && updateSetting.mutate({ key: "style", value: style });
  const saveTimers = () => timers && updateSetting.mutate({ key: "timers", value: timers });

  if (isLoading || !texts || !style || !timers) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          Editor da Landing Page
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personalize textos, cores e tempos da landing de captura em tempo real.
        </p>
      </div>

      <Tabs defaultValue="sections" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="sections" className="gap-1.5"><Layers className="h-3.5 w-3.5" /> Seções</TabsTrigger>
          <TabsTrigger value="texts" className="gap-1.5"><Type className="h-3.5 w-3.5" /> Textos</TabsTrigger>
          <TabsTrigger value="style" className="gap-1.5"><Palette className="h-3.5 w-3.5" /> Estilo</TabsTrigger>
          <TabsTrigger value="timers" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Tempos</TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Métricas</TabsTrigger>
        </TabsList>

        {/* SECTIONS TAB — novo formato (Como funciona, Universo, Por que OCULTO) */}
        <TabsContent value="sections" className="space-y-4">
          <LandingSectionsEditor />
        </TabsContent>

        {/* TEXTS TAB */}
        <TabsContent value="texts" className="space-y-4">
          <div className="grid gap-4 p-4 rounded-xl border border-border/50 bg-card">
            <div>
              <Label>Título Principal</Label>
              <Input value={texts.headline} onChange={e => setTexts(t => t ? { ...t, headline: e.target.value } : t)} />
            </div>
            <div>
              <Label>Subtítulo</Label>
              <Textarea value={texts.subheadline} onChange={e => setTexts(t => t ? { ...t, subheadline: e.target.value } : t)} rows={2} />
            </div>
            <div>
              <Label>Texto do Botão CTA</Label>
              <Input value={texts.cta_button} onChange={e => setTexts(t => t ? { ...t, cta_button: e.target.value } : t)} />
            </div>
            <div>
              <Label>Mensagem de Blur (Imagem)</Label>
              <Input value={texts.blur_message} onChange={e => setTexts(t => t ? { ...t, blur_message: e.target.value } : t)} />
            </div>
            <div>
              <Label>Mensagem de Vídeo Cortado</Label>
              <Input value={texts.video_message} onChange={e => setTexts(t => t ? { ...t, video_message: e.target.value } : t)} />
            </div>
            <div>
              <Label>Texto do Rodapé</Label>
              <Textarea value={texts.footer_text} onChange={e => setTexts(t => t ? { ...t, footer_text: e.target.value } : t)} rows={2} />
            </div>
            <Button onClick={saveTexts} disabled={updateSetting.isPending} className="w-fit">
              {updateSetting.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar Textos
            </Button>
          </div>
        </TabsContent>

        {/* STYLE TAB */}
        <TabsContent value="style" className="space-y-4">
          <div className="grid gap-4 p-4 rounded-xl border border-border/50 bg-card">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cor Primária</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={style.primary_color} onChange={e => setStyle(s => s ? { ...s, primary_color: e.target.value } : s)}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                  <Input value={style.primary_color} onChange={e => setStyle(s => s ? { ...s, primary_color: e.target.value } : s)} className="flex-1" />
                </div>
              </div>
              <div>
                <Label>Cor Secundária (Fundo)</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={style.secondary_color} onChange={e => setStyle(s => s ? { ...s, secondary_color: e.target.value } : s)}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent" />
                  <Input value={style.secondary_color} onChange={e => setStyle(s => s ? { ...s, secondary_color: e.target.value } : s)} className="flex-1" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fonte dos Títulos</Label>
                <Input value={style.font_heading} onChange={e => setStyle(s => s ? { ...s, font_heading: e.target.value } : s)} />
              </div>
              <div>
                <Label>Fonte do Corpo</Label>
                <Input value={style.font_body} onChange={e => setStyle(s => s ? { ...s, font_body: e.target.value } : s)} />
              </div>
            </div>
            <div>
              <Label>URL do Logo (opcional)</Label>
              <Input value={style.logo_url || ""} onChange={e => setStyle(s => s ? { ...s, logo_url: e.target.value || null } : s)} placeholder="https://..." />
            </div>

            {/* Preview */}
            <div className="rounded-xl overflow-hidden border border-white/10 mt-2" style={{ backgroundColor: style.secondary_color }}>
              <div className="p-4 text-center">
                <div className="w-10 h-10 rounded-lg mx-auto mb-3 flex items-center justify-center" style={{ background: style.primary_color }}>
                  <span className="text-black font-bold">O</span>
                </div>
                <h3 className="text-white font-bold text-lg" style={{ fontFamily: style.font_heading }}>Preview</h3>
                <p className="text-white/50 text-sm mt-1" style={{ fontFamily: style.font_body }}>Exemplo de texto</p>
                <div className="mt-3 px-6 py-2 rounded-lg inline-block text-sm font-semibold" style={{ backgroundColor: style.primary_color, color: "#000" }}>
                  {texts.cta_button}
                </div>
              </div>
            </div>

            <Button onClick={saveStyle} disabled={updateSetting.isPending} className="w-fit">
              {updateSetting.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar Estilo
            </Button>
          </div>
        </TabsContent>

        {/* TIMERS TAB */}
        <TabsContent value="timers" className="space-y-4">
          <div className="grid gap-4 p-4 rounded-xl border border-border/50 bg-card">
            <div>
              <Label>Segundos de exibição da imagem antes do blur</Label>
              <Input type="number" min={1} max={30} value={timers.image_preview_seconds}
                onChange={e => setTimers(t => t ? { ...t, image_preview_seconds: Number(e.target.value) } : t)} />
              <p className="text-[11px] text-muted-foreground mt-1">Padrão: 5 segundos</p>
            </div>
            <div>
              <Label>Segundos de prévia do vídeo antes do corte</Label>
              <Input type="number" min={3} max={60} value={timers.video_preview_seconds}
                onChange={e => setTimers(t => t ? { ...t, video_preview_seconds: Number(e.target.value) } : t)} />
              <p className="text-[11px] text-muted-foreground mt-1">Padrão: 10 segundos</p>
            </div>
            <Button onClick={saveTimers} disabled={updateSetting.isPending} className="w-fit">
              {updateSetting.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar Tempos
            </Button>
          </div>
        </TabsContent>

        {/* METRICS TAB */}
        <TabsContent value="metrics" className="space-y-4">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard icon={MousePointerClick} label="Cliques Totais" value={convStats?.totalClicks || 0} />
            <MetricCard icon={Users} label="Conversões" value={convStats?.totalConversions || 0} />
            <MetricCard icon={TrendingUp} label="Taxa de Conversão" value={`${convStats?.conversionRate || 0}%`} />
            <MetricCard icon={Eye} label="Cliques Hoje" value={convStats?.todayClicks || 0} />
          </div>

          {/* Top Referrers */}
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Referrers
            </h3>
            {!topReferrers?.length ? (
              <p className="text-sm text-muted-foreground">Nenhum dado disponível ainda.</p>
            ) : (
              <div className="space-y-2">
                {topReferrers.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0">
                    <span className="text-xs font-bold text-muted-foreground w-5">#{i + 1}</span>
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={r.avatar_url} />
                      <AvatarFallback className="text-xs">{r.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">@{r.username}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{r.clicks} cliques</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="p-3 rounded-xl border border-border/50 bg-card">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
