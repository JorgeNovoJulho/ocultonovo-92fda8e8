import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Save, RotateCcw, Eye, Play, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";

interface PlayShareSettings {
  id: number;
  show_logo: boolean;
  show_author_card: boolean;
  show_player: boolean;
  show_stats: boolean;
  show_signup_cta: boolean;
  cta_text: string;
  cta_button_text: string;
  bg_color: string;
  accent_color: string;
  footer_text: string;
}

const DEFAULT_PLAY_SETTINGS: PlayShareSettings = {
  id: 1,
  show_logo: true,
  show_author_card: true,
  show_player: true,
  show_stats: true,
  show_signup_cta: true,
  cta_text: "Gostou deste conteúdo? Crie sua conta grátis para ver muito mais no OCULTO PLAY.",
  cta_button_text: "Criar minha conta grátis",
  bg_color: "#0a0a0a",
  accent_color: "#ec4899",
  footer_text: "© OCULTO PLAY - Todos os direitos reservados",
};

export default function AdminPlayShareEditorPage() {
  const [settings, setSettings] = useState<PlayShareSettings>(DEFAULT_PLAY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase
          .from("oculto_play_share_settings" as any)
          .select("*")
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Erro ao carregar configurações:", error);
        } else if (data) {
          setSettings(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("oculto_play_share_settings" as any)
        .upsert(settings);

      if (error) throw error;
      toast.success("Configurações da página de compartilhamento atualizadas!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof PlayShareSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="p-8 text-center">Carregando...</div>;

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Share2 className="h-6 w-6" /> Editor da Página de Compartilhamento (Play)
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Configure como os vídeos, áudios e mídias do OCULTO PLAY aparecem para visitantes externos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/play/p/PREVIEW" target="_blank">
              <Eye className="h-4 w-4 mr-2" /> Prévia do Link
            </Link>
          </Button>
          <Button onClick={() => setSettings(DEFAULT_PLAY_SETTINGS)} variant="outline" size="sm">
            <RotateCcw className="h-4 w-4 mr-2" /> Resetar
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="visibility">
        <TabsList>
          <TabsTrigger value="visibility">Elementos</TabsTrigger>
          <TabsTrigger value="texts">Textos & CTA</TabsTrigger>
          <TabsTrigger value="style">Design</TabsTrigger>
        </TabsList>

        <TabsContent value="visibility">
          <Card>
            <CardHeader><CardTitle className="text-base text-primary">O que deve aparecer?</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              {[
                { key: "show_logo", label: "Logo OCULTO PLAY" },
                { key: "show_player", label: "Player de Vídeo/Áudio" },
                { key: "show_author_card", label: "Informações do Autor" },
                { key: "show_stats", label: "Contador de Views/Likes" },
                { key: "show_signup_cta", label: "Bloco de Convite/Cadastro" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor={item.key} className="text-sm">{item.label}</Label>
                  <Switch
                    id={item.key}
                    checked={!!(settings as any)[item.key]}
                    onCheckedChange={(v) => setField(item.key as any, v)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="texts">
          <Card>
            <CardHeader><CardTitle className="text-base text-primary">Conteúdo da Página</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Texto de Chamada (CTA)</Label>
                <Textarea 
                  value={settings.cta_text} 
                  onChange={(e) => setField("cta_text", e.target.value)}
                  placeholder="Gostou deste conteúdo?..."
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Texto do Botão de Cadastro</Label>
                  <Input 
                    value={settings.cta_button_text} 
                    onChange={(e) => setField("cta_button_text", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Texto do Rodapé</Label>
                  <Input 
                    value={settings.footer_text} 
                    onChange={(e) => setField("footer_text", e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="style">
          <Card>
            <CardHeader><CardTitle className="text-base text-primary">Cores e Identidade</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <Label>Cor de Fundo da Página</Label>
                <div className="flex gap-2">
                  <Input type="color" className="w-12 p-1 h-10" value={settings.bg_color} onChange={(e) => setField("bg_color", e.target.value)} />
                  <Input value={settings.bg_color} onChange={(e) => setField("bg_color", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cor de Destaque (Botões/Links)</Label>
                <div className="flex gap-2">
                  <Input type="color" className="w-12 p-1 h-10" value={settings.accent_color} onChange={(e) => setField("accent_color", e.target.value)} />
                  <Input value={settings.accent_color} onChange={(e) => setField("accent_color", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6 flex gap-3 items-center text-sm">
          <Play className="h-5 w-5 text-primary" />
          <p>As alterações feitas aqui refletem instantaneamente em todos os links do tipo <code>/play/p/[id]</code> compartilhados externamente.</p>
        </CardContent>
      </Card>
    </div>
  );
}
