import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2, Eye, Sparkles, Music, Type, Settings2, Sun, Moon, MoonIcon } from "lucide-react";
import { toast } from "sonner";
import { useHeroSettings, useUpdateHeroSettings, HeroTexts, TrustIndicators } from "@/hooks/useHeroSettings";
import { HeroPreviewToolbar } from "@/components/admin/HeroPreviewToolbar";
import { AudioUploadField } from "@/components/admin/AudioUploadField";
import { HeroSectionAdvanced } from "@/components/landing/HeroSectionAdvanced";

export default function AdminHeroSettingsPage() {
  const { data: settings, isLoading } = useHeroSettings();
  const updateSettings = useUpdateHeroSettings();

  // Preview state
  const [timeOverride, setTimeOverride] = useState<'day' | 'night' | null>(null);
  const [cityOverride, setCityOverride] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  // Form state
  const [textsDay, setTextsDay] = useState<HeroTexts | null>(null);
  const [textsNight, setTextsNight] = useState<HeroTexts | null>(null);
  const [audioEnabled, setAudioEnabled] = useState<boolean | null>(null);
  const [audioTrackDay, setAudioTrackDay] = useState<string | null>(null);
  const [audioTrackNight, setAudioTrackNight] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState<number | null>(null);
  const [audioVisualizerEnabled, setAudioVisualizerEnabled] = useState<boolean | null>(null);
  const [backgroundType, setBackgroundType] = useState<string | null>(null);
  const [starsCount, setStarsCount] = useState<number | null>(null);
  const [moonGlowIntensity, setMoonGlowIntensity] = useState<number | null>(null);
  const [moonSize, setMoonSize] = useState<number | null>(null);
  const [moonPositionX, setMoonPositionX] = useState<number | null>(null);
  const [moonPositionY, setMoonPositionY] = useState<number | null>(null);
  const [parallaxMoon, setParallaxMoon] = useState<number | null>(null);
  const [parallaxStars, setParallaxStars] = useState<number | null>(null);
  const [parallaxCity, setParallaxCity] = useState<number | null>(null);
  const [floatingParticles, setFloatingParticles] = useState<boolean | null>(null);
  const [rotatingWords, setRotatingWords] = useState<string | null>(null);
  const [typewriterSpeed, setTypewriterSpeed] = useState<number | null>(null);
  const [typewriterPause, setTypewriterPause] = useState<number | null>(null);
  const [dayStartHour, setDayStartHour] = useState<number | null>(null);
  const [nightStartHour, setNightStartHour] = useState<number | null>(null);
  const [geoEnabled, setGeoEnabled] = useState<boolean | null>(null);
  const [geoFallbackCity, setGeoFallbackCity] = useState<string | null>(null);
  const [trustOnline, setTrustOnline] = useState<boolean | null>(null);
  const [trustAnonymity, setTrustAnonymity] = useState<boolean | null>(null);
  const [trustAgeVerified, setTrustAgeVerified] = useState<boolean | null>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState<boolean | null>(null);
  const [scrollIndicatorDelay, setScrollIndicatorDelay] = useState<number | null>(null);

  // Get current values (form state or settings)
  const currentTextsDay = textsDay ?? settings?.texts_day;
  const currentTextsNight = textsNight ?? settings?.texts_night;

  const handleSave = async () => {
    if (!settings) return;

    const updates: Record<string, unknown> = {};

    // Texts
    if (textsDay) updates.texts_day = textsDay;
    if (textsNight) updates.texts_night = textsNight;

    // Audio
    if (audioEnabled !== null) updates.audio_enabled = audioEnabled;
    if (audioTrackDay !== undefined) updates.audio_track_day = audioTrackDay;
    if (audioTrackNight !== undefined) updates.audio_track_night = audioTrackNight;
    if (audioVolume !== null) updates.audio_default_volume = audioVolume;
    if (audioVisualizerEnabled !== null) updates.audio_visualizer_enabled = audioVisualizerEnabled;

    // Visual
    if (backgroundType) updates.background_type = backgroundType;
    if (starsCount !== null) updates.stars_count = starsCount;
    if (moonGlowIntensity !== null) updates.moon_glow_intensity = moonGlowIntensity;
    if (moonSize !== null) updates.moon_size = moonSize;
    if (moonPositionX !== null) updates.moon_position_x = moonPositionX;
    if (moonPositionY !== null) updates.moon_position_y = moonPositionY;
    if (parallaxMoon !== null) updates.parallax_moon_speed = parallaxMoon;
    if (parallaxStars !== null) updates.parallax_stars_speed = parallaxStars;
    if (parallaxCity !== null) updates.parallax_city_speed = parallaxCity;
    if (floatingParticles !== null) updates.enable_floating_particles = floatingParticles;

    // Advanced
    if (rotatingWords) updates.rotating_words = rotatingWords.split(',').map(w => w.trim()).filter(Boolean);
    if (typewriterSpeed !== null) updates.typewriter_speed_ms = typewriterSpeed;
    if (typewriterPause !== null) updates.typewriter_pause_ms = typewriterPause;
    if (dayStartHour !== null) updates.day_start_hour = dayStartHour;
    if (nightStartHour !== null) updates.night_start_hour = nightStartHour;
    if (geoEnabled !== null) updates.enable_geo_replacement = geoEnabled;
    if (geoFallbackCity) updates.geo_fallback_city = geoFallbackCity;
    if (showScrollIndicator !== null) updates.show_scroll_indicator = showScrollIndicator;
    if (scrollIndicatorDelay !== null) updates.scroll_indicator_delay_ms = scrollIndicatorDelay;

    // Trust indicators
    if (trustOnline !== null || trustAnonymity !== null || trustAgeVerified !== null) {
      updates.trust_indicators = {
        online_count: trustOnline ?? settings.trust_indicators?.online_count ?? true,
        anonymity_badge: trustAnonymity ?? settings.trust_indicators?.anonymity_badge ?? true,
        age_verified_badge: trustAgeVerified ?? settings.trust_indicators?.age_verified_badge ?? true
      };
    }

    if (Object.keys(updates).length === 0) {
      toast.info("Nenhuma alteração para salvar");
      return;
    }

    try {
      await updateSettings.mutateAsync(updates);
      toast.success("Configurações salvas com sucesso!");
      
      // Reset form state
      setTextsDay(null);
      setTextsNight(null);
      setAudioEnabled(null);
      setAudioTrackDay(null);
      setAudioTrackNight(null);
      setAudioVolume(null);
      setAudioVisualizerEnabled(null);
      setBackgroundType(null);
      setStarsCount(null);
      setMoonGlowIntensity(null);
      setMoonSize(null);
      setMoonPositionX(null);
      setMoonPositionY(null);
      setParallaxMoon(null);
      setParallaxStars(null);
      setParallaxCity(null);
      setFloatingParticles(null);
      setRotatingWords(null);
      setTypewriterSpeed(null);
      setTypewriterPause(null);
      setDayStartHour(null);
      setNightStartHour(null);
      setGeoEnabled(null);
      setGeoFallbackCity(null);
      setTrustOnline(null);
      setTrustAnonymity(null);
      setTrustAgeVerified(null);
      setShowScrollIndicator(null);
      setScrollIndicatorDelay(null);
    } catch (error) {
      toast.error("Erro ao salvar configurações");
    }
  };

  const updateTextDay = (field: keyof HeroTexts, value: string) => {
    setTextsDay(prev => ({
      ...(prev ?? settings?.texts_day ?? {} as HeroTexts),
      [field]: value
    }));
  };

  const updateTextNight = (field: keyof HeroTexts, value: string) => {
    setTextsNight(prev => ({
      ...(prev ?? settings?.texts_night ?? {} as HeroTexts),
      [field]: value
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Hero Section - Editor Avançado
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure textos, áudio e efeitos visuais da landing page
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? 'Ocultar' : 'Mostrar'} Preview
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending}
            className="gap-2"
          >
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </div>

      {/* Preview Toolbar */}
      <HeroPreviewToolbar
        timeOverride={timeOverride}
        cityOverride={cityOverride}
        onTimeChange={setTimeOverride}
        onCityChange={setCityOverride}
      />

      {/* Live Preview */}
      {showPreview && (
        <Card className="overflow-hidden">
          <CardHeader className="py-2 px-4 bg-muted/50 border-b">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Eye className="h-4 w-4" />
              Preview ao Vivo
              <Badge variant="outline" className="ml-auto">
                {timeOverride ? (timeOverride === 'day' ? '☀️ Dia' : '🌙 Noite') : '⏰ Auto'}
              </Badge>
            </div>
          </CardHeader>
          <div className="relative h-[500px] overflow-hidden">
            <div className="absolute inset-0 scale-[0.6] origin-top-left" style={{ width: '166.67%', height: '166.67%' }}>
              <HeroSectionAdvanced 
                timeOverride={timeOverride} 
                cityOverride={cityOverride} 
              />
            </div>
          </div>
        </Card>
      )}

      {/* Settings Tabs */}
      <Card>
        <Tabs defaultValue="texts-day">
          <CardHeader className="pb-0">
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="texts-day" className="gap-2">
                <Sun className="h-4 w-4" />
                Textos Dia
              </TabsTrigger>
              <TabsTrigger value="texts-night" className="gap-2">
                <Moon className="h-4 w-4" />
                Textos Noite
              </TabsTrigger>
              <TabsTrigger value="visual" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Visual
              </TabsTrigger>
              <TabsTrigger value="audio" className="gap-2">
                <Music className="h-4 w-4" />
                Áudio
              </TabsTrigger>
              <TabsTrigger value="advanced" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Avançado
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent className="pt-6">
            {/* Day Texts Tab */}
            <TabsContent value="texts-day" className="space-y-4 mt-0">
              <div className="grid gap-4">
                <div>
                  <Label>Badge</Label>
                  <Input
                    value={currentTextsDay?.badge || ""}
                    onChange={(e) => updateTextDay('badge', e.target.value)}
                    placeholder="🚀 Lançamento Exclusivo"
                  />
                </div>
                
                <div>
                  <Label>Título Principal (Grande)</Label>
                  <Input
                    value={currentTextsDay?.main_title || ""}
                    onChange={(e) => updateTextDay('main_title', e.target.value)}
                    placeholder="OCULTO"
                    className="text-2xl font-bold"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Exibido em grande com efeito de glow
                  </p>
                </div>

                <div>
                  <Label>Parágrafo (use **texto** para destacar em rosa)</Label>
                  <Textarea
                    value={currentTextsDay?.paragraph || ""}
                    onChange={(e) => updateTextDay('paragraph', e.target.value)}
                    placeholder="A primeira plataforma que une **conteúdo exclusivo** e **encontros reais**..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Palavras entre ** serão destacadas com glow rosa neon
                  </p>
                </div>

                <div>
                  <Label>Linha de Geolocalização (use {'{cidade}'} para geo-replace)</Label>
                  <Input
                    value={currentTextsDay?.geo_line || ""}
                    onChange={(e) => updateTextDay('geo_line', e.target.value)}
                    placeholder="Encontros reais em: {cidade}"
                  />
                </div>

                <Separator />

                <div>
                  <Label>Label CTA (acima dos botões)</Label>
                  <Input
                    value={currentTextsDay?.cta_label || ""}
                    onChange={(e) => updateTextDay('cta_label', e.target.value)}
                    placeholder="COMECE AGORA GRÁTIS"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CTA Primário</Label>
                    <Input
                      value={currentTextsDay?.cta_primary || ""}
                      onChange={(e) => updateTextDay('cta_primary', e.target.value)}
                      placeholder="Criar Conta"
                    />
                  </div>
                  <div>
                    <Label>CTA Secundário</Label>
                    <Input
                      value={currentTextsDay?.cta_secondary || ""}
                      onChange={(e) => updateTextDay('cta_secondary', e.target.value)}
                      placeholder="Espiar"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Night Texts Tab */}
            <TabsContent value="texts-night" className="space-y-4 mt-0">
              <div className="grid gap-4">
                <div>
                  <Label>Badge</Label>
                  <Input
                    value={currentTextsNight?.badge || ""}
                    onChange={(e) => updateTextNight('badge', e.target.value)}
                    placeholder="🌙 Modo Noturno Ativo"
                  />
                </div>
                
                <div>
                  <Label>Título Principal (Grande)</Label>
                  <Input
                    value={currentTextsNight?.main_title || ""}
                    onChange={(e) => updateTextNight('main_title', e.target.value)}
                    placeholder="OCULTO"
                    className="text-2xl font-bold"
                  />
                </div>

                <div>
                  <Label>Parágrafo (use **texto** para destacar)</Label>
                  <Textarea
                    value={currentTextsNight?.paragraph || ""}
                    onChange={(e) => updateTextNight('paragraph', e.target.value)}
                    placeholder="A primeira plataforma..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label>Linha de Geolocalização</Label>
                  <Input
                    value={currentTextsNight?.geo_line || ""}
                    onChange={(e) => updateTextNight('geo_line', e.target.value)}
                    placeholder="Encontros reais em: {cidade}"
                  />
                </div>

                <Separator />

                <div>
                  <Label>Label CTA</Label>
                  <Input
                    value={currentTextsNight?.cta_label || ""}
                    onChange={(e) => updateTextNight('cta_label', e.target.value)}
                    placeholder="COMECE AGORA GRÁTIS"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>CTA Primário</Label>
                    <Input
                      value={currentTextsNight?.cta_primary || ""}
                      onChange={(e) => updateTextNight('cta_primary', e.target.value)}
                      placeholder="Entrar"
                    />
                  </div>
                  <div>
                    <Label>CTA Secundário</Label>
                    <Input
                      value={currentTextsNight?.cta_secondary || ""}
                      onChange={(e) => updateTextNight('cta_secondary', e.target.value)}
                      placeholder="Espiar"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Visual Tab */}
            <TabsContent value="visual" className="space-y-6 mt-0">
              <div className="grid gap-6">
                <div>
                  <Label>Tipo de Background</Label>
                  <Select
                    value={backgroundType ?? settings?.background_type ?? 'gradient'}
                    onValueChange={setBackgroundType}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gradient">Gradiente</SelectItem>
                      <SelectItem value="image">Imagem</SelectItem>
                      <SelectItem value="video">Vídeo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Moon Settings Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-medium">
                    <MoonIcon className="h-5 w-5" />
                    Configurações da Lua
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Tamanho da Lua (px)</Label>
                      <span className="text-sm text-muted-foreground">
                        {moonSize ?? settings?.moon_size ?? 550}px
                      </span>
                    </div>
                    <Slider
                      value={[moonSize ?? settings?.moon_size ?? 550]}
                      onValueChange={([v]) => setMoonSize(v)}
                      min={300}
                      max={800}
                      step={10}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs">Posição X (%)</Label>
                        <span className="text-xs text-muted-foreground">
                          {moonPositionX ?? settings?.moon_position_x ?? 50}%
                        </span>
                      </div>
                      <Slider
                        value={[moonPositionX ?? settings?.moon_position_x ?? 50]}
                        onValueChange={([v]) => setMoonPositionX(v)}
                        min={10}
                        max={90}
                        step={1}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs">Posição Y (%)</Label>
                        <span className="text-xs text-muted-foreground">
                          {moonPositionY ?? settings?.moon_position_y ?? 15}%
                        </span>
                      </div>
                      <Slider
                        value={[moonPositionY ?? settings?.moon_position_y ?? 15]}
                        onValueChange={([v]) => setMoonPositionY(v)}
                        min={5}
                        max={50}
                        step={1}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Intensidade do Brilho</Label>
                      <span className="text-sm text-muted-foreground">
                        {(moonGlowIntensity ?? settings?.moon_glow_intensity ?? 1).toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={[moonGlowIntensity ?? settings?.moon_glow_intensity ?? 1]}
                      onValueChange={([v]) => setMoonGlowIntensity(v)}
                      min={0.2}
                      max={2}
                      step={0.1}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Quantidade de Estrelas</Label>
                    <span className="text-sm text-muted-foreground">
                      {starsCount ?? settings?.stars_count ?? 120}
                    </span>
                  </div>
                  <Slider
                    value={[starsCount ?? settings?.stars_count ?? 120]}
                    onValueChange={([v]) => setStarsCount(v)}
                    min={20}
                    max={200}
                    step={10}
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs">Parallax Lua</Label>
                      <span className="text-xs text-muted-foreground">
                        {(parallaxMoon ?? settings?.parallax_moon_speed ?? 0.15).toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[parallaxMoon ?? settings?.parallax_moon_speed ?? 0.15]}
                      onValueChange={([v]) => setParallaxMoon(v)}
                      min={0}
                      max={0.5}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs">Parallax Estrelas</Label>
                      <span className="text-xs text-muted-foreground">
                        {(parallaxStars ?? settings?.parallax_stars_speed ?? 0.08).toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[parallaxStars ?? settings?.parallax_stars_speed ?? 0.08]}
                      onValueChange={([v]) => setParallaxStars(v)}
                      min={0}
                      max={0.3}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs">Parallax Cidade</Label>
                      <span className="text-xs text-muted-foreground">
                        {(parallaxCity ?? settings?.parallax_city_speed ?? 0.05).toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      value={[parallaxCity ?? settings?.parallax_city_speed ?? 0.05]}
                      onValueChange={([v]) => setParallaxCity(v)}
                      min={0}
                      max={0.2}
                      step={0.01}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Partículas Flutuantes</Label>
                    <p className="text-xs text-muted-foreground">Efeito de partículas brilhantes</p>
                  </div>
                  <Switch
                    checked={floatingParticles ?? settings?.enable_floating_particles ?? true}
                    onCheckedChange={setFloatingParticles}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Audio Tab */}
            <TabsContent value="audio" className="space-y-6 mt-0">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar Áudio Ambiente</Label>
                  <p className="text-xs text-muted-foreground">
                    Reproduz música de fundo na landing page
                  </p>
                </div>
                <Switch
                  checked={audioEnabled ?? settings?.audio_enabled ?? false}
                  onCheckedChange={setAudioEnabled}
                />
              </div>

              <Separator />

              <div className="grid gap-6">
                <AudioUploadField
                  label="Track Dia (☀️)"
                  value={audioTrackDay ?? settings?.audio_track_day ?? null}
                  onChange={setAudioTrackDay}
                />

                <AudioUploadField
                  label="Track Noite (🌙)"
                  value={audioTrackNight ?? settings?.audio_track_night ?? null}
                  onChange={setAudioTrackNight}
                />
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Volume Padrão</Label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round((audioVolume ?? settings?.audio_default_volume ?? 0.3) * 100)}%
                  </span>
                </div>
                <Slider
                  value={[(audioVolume ?? settings?.audio_default_volume ?? 0.3)]}
                  onValueChange={([v]) => setAudioVolume(v)}
                  min={0.1}
                  max={1}
                  step={0.05}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Visualizador de Áudio</Label>
                  <p className="text-xs text-muted-foreground">
                    Efeito de pulso neon no botão "Espiar" ao ritmo da música
                  </p>
                </div>
                <Switch
                  checked={audioVisualizerEnabled ?? settings?.audio_visualizer_enabled ?? true}
                  onCheckedChange={setAudioVisualizerEnabled}
                />
              </div>
            </TabsContent>

            {/* Advanced Tab */}
            <TabsContent value="advanced" className="space-y-6 mt-0">
              <div>
                <Label>Palavras Rotativas (separadas por vírgula)</Label>
                <Input
                  value={rotatingWords ?? settings?.rotating_words?.join(', ') ?? ''}
                  onChange={(e) => setRotatingWords(e.target.value)}
                  placeholder="Ocultas, Proibidas, Secretas, Íntimas, Intensas"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Palavras que aparecem com efeito de typewriter (legado)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Velocidade Typewriter (ms)</Label>
                  <Input
                    type="number"
                    value={typewriterSpeed ?? settings?.typewriter_speed_ms ?? 100}
                    onChange={(e) => setTypewriterSpeed(parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Pausa Typewriter (ms)</Label>
                  <Input
                    type="number"
                    value={typewriterPause ?? settings?.typewriter_pause_ms ?? 2000}
                    onChange={(e) => setTypewriterPause(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Hora Início Dia</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={dayStartHour ?? settings?.day_start_hour ?? 6}
                    onChange={(e) => setDayStartHour(parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Hora Início Noite</Label>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={nightStartHour ?? settings?.night_start_hour ?? 18}
                    onChange={(e) => setNightStartHour(parseInt(e.target.value))}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Geo-localização</Label>
                  <p className="text-xs text-muted-foreground">
                    Substitui {'{cidade}'} pela cidade do usuário
                  </p>
                </div>
                <Switch
                  checked={geoEnabled ?? settings?.enable_geo_replacement ?? true}
                  onCheckedChange={setGeoEnabled}
                />
              </div>

              <div>
                <Label>Cidade Fallback</Label>
                <Input
                  value={geoFallbackCity ?? settings?.geo_fallback_city ?? ''}
                  onChange={(e) => setGeoFallbackCity(e.target.value)}
                  placeholder="sua cidade"
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <Label className="text-base font-medium">Trust Indicators</Label>
                
                <div className="flex items-center justify-between">
                  <Label className="font-normal">Mostrar contagem online</Label>
                  <Switch
                    checked={trustOnline ?? settings?.trust_indicators?.online_count ?? true}
                    onCheckedChange={setTrustOnline}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="font-normal">Badge de anonimato</Label>
                  <Switch
                    checked={trustAnonymity ?? settings?.trust_indicators?.anonymity_badge ?? true}
                    onCheckedChange={setTrustAnonymity}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="font-normal">Badge +18 verificado</Label>
                  <Switch
                    checked={trustAgeVerified ?? settings?.trust_indicators?.age_verified_badge ?? true}
                    onCheckedChange={setTrustAgeVerified}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Indicador de Scroll</Label>
                  <p className="text-xs text-muted-foreground">Seta animada para rolar a página</p>
                </div>
                <Switch
                  checked={showScrollIndicator ?? settings?.show_scroll_indicator ?? true}
                  onCheckedChange={setShowScrollIndicator}
                />
              </div>

              <div>
                <Label>Delay do Indicador (ms)</Label>
                <Input
                  type="number"
                  value={scrollIndicatorDelay ?? settings?.scroll_indicator_delay_ms ?? 5000}
                  onChange={(e) => setScrollIndicatorDelay(parseInt(e.target.value))}
                />
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
