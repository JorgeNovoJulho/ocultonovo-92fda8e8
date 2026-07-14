import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Save, RotateCcw, Eye, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useIsMasterAdmin } from "@/hooks/useUserRoles";
import {
  useShareLandingSettings,
  useUpdateShareLandingSettings,
  DEFAULT_SHARE_LANDING_SETTINGS,
  ShareLandingSettings,
} from "@/hooks/useShareLandingSettings";

const TOGGLES: { key: keyof ShareLandingSettings; label: string }[] = [
  { key: "show_logo", label: "Logo no topo" },
  { key: "show_creator", label: "Nome do criador / canal" },
  { key: "show_qr", label: "QR Code (futuro)" },
  { key: "show_price", label: "Bloco de preço" },
  { key: "show_buy_button", label: "Botão Comprar agora" },
  { key: "show_footer", label: "Rodapé +18" },
];

const TEXTS: { key: keyof ShareLandingSettings; label: string; multiline?: boolean }[] = [
  { key: "headline", label: "Headline" },
  { key: "subheadline", label: "Subheadline", multiline: true },
  { key: "cta_buy_text", label: "Botão Comprar" },
  { key: "cta_primary_text", label: "Botão Acessar (logado)" },
  { key: "cta_signup_text", label: "Botão Criar conta (deslogado)" },
  { key: "footer_text", label: "Rodapé", multiline: true },
];

const COLORS: { key: keyof ShareLandingSettings; label: string }[] = [
  { key: "accent_color", label: "Cor de destaque (dourado)" },
  { key: "accent_color_dark", label: "Cor de destaque escura" },
  { key: "card_border_color", label: "Cor da borda do card (com transparência)" },
  { key: "bg_gradient_from", label: "Fundo gradiente — início" },
  { key: "bg_gradient_to", label: "Fundo gradiente — fim" },
];

const BLURS: ShareLandingSettings["default_blur"][] = ["light", "medium", "strong", "none"];

export default function AdminShareLandingEditorPage() {
  const { data: isMasterAdmin } = useIsMasterAdmin();
  const { data, isLoading } = useShareLandingSettings();
  const update = useUpdateShareLandingSettings();
  const [draft, setDraft] = useState<ShareLandingSettings>(DEFAULT_SHARE_LANDING_SETTINGS);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const setField = <K extends keyof ShareLandingSettings>(key: K, value: ShareLandingSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  if (isMasterAdmin === false) {
    return (
      <div className="container mx-auto py-12 px-4 max-w-md text-center">
        <Lock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Acesso restrito ao admin master.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Página de Compartilhamento</h1>
          <p className="text-sm text-muted-foreground">
            Personalize a landing usada em todos os links <code>/c/:slug</code>. As alterações
            são aplicadas em tempo real para todos os usuários.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/c/preview" target="_blank">
              <Eye className="h-4 w-4 mr-2" /> Pré-visualizar
            </Link>
          </Button>
          <Button onClick={() => setDraft(DEFAULT_SHARE_LANDING_SETTINGS)} variant="outline" size="sm">
            <RotateCcw className="h-4 w-4 mr-2" /> Restaurar padrão
          </Button>
          <Button onClick={() => update.mutate(draft)} disabled={isLoading || update.isPending} size="sm">
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="visibility">
        <TabsList>
          <TabsTrigger value="visibility">Visibilidade</TabsTrigger>
          <TabsTrigger value="texts">Textos</TabsTrigger>
          <TabsTrigger value="style">Cores</TabsTrigger>
          <TabsTrigger value="media">Mídias & Blur</TabsTrigger>
        </TabsList>

        <TabsContent value="visibility">
          <Card>
            <CardHeader><CardTitle className="text-base">Exibir / Ocultar</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              {TOGGLES.map((s) => (
                <div key={s.key} className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor={s.key} className="text-sm">{s.label}</Label>
                  <Switch
                    id={s.key}
                    checked={!!draft[s.key]}
                    onCheckedChange={(v) => setField(s.key, v as any)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="texts">
          <Card>
            <CardHeader><CardTitle className="text-base">Textos</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {TEXTS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  {f.multiline ? (
                    <Textarea
                      id={f.key}
                      rows={3}
                      value={(draft[f.key] as string) ?? ""}
                      onChange={(e) => setField(f.key, e.target.value as any)}
                    />
                  ) : (
                    <Input
                      id={f.key}
                      value={(draft[f.key] as string) ?? ""}
                      onChange={(e) => setField(f.key, e.target.value as any)}
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="style">
          <Card>
            <CardHeader><CardTitle className="text-base">Cores</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              {COLORS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={String(draft[f.key] ?? "#000000").slice(0, 7)}
                      onChange={(e) => setField(f.key, e.target.value as any)}
                      className="h-9 w-12 rounded border bg-transparent cursor-pointer"
                    />
                    <Input
                      id={f.key}
                      value={(draft[f.key] as string) ?? ""}
                      onChange={(e) => setField(f.key, e.target.value as any)}
                      placeholder="#facc15"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media">
          <Card>
            <CardHeader><CardTitle className="text-base">Mídias & Blur padrão</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>URL do logo (override)</Label>
                <Input
                  placeholder="https://..."
                  value={draft.logo_override_url ?? ""}
                  onChange={(e) => setField("logo_override_url", (e.target.value || null) as any)}
                />
                {draft.logo_override_url && (
                  <img loading="lazy" decoding="async" src={draft.logo_override_url} alt="logo" className="mt-2 max-h-16 rounded border object-contain bg-muted" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>URL da imagem de fundo</Label>
                <Input
                  placeholder="https://..."
                  value={draft.background_image_url ?? ""}
                  onChange={(e) => setField("background_image_url", (e.target.value || null) as any)}
                />
                {draft.background_image_url && (
                  <img loading="lazy" decoding="async" src={draft.background_image_url} alt="bg" className="mt-2 max-h-32 rounded border object-cover bg-muted w-full" />
                )}
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Blur padrão (quando o post não define)</Label>
                <div className="grid grid-cols-4 gap-2">
                  {BLURS.map((b) => (
                    <Button
                      key={b}
                      type="button"
                      variant={draft.default_blur === b ? "default" : "outline"}
                      size="sm"
                      onClick={() => setField("default_blur", b)}
                      className="capitalize"
                    >
                      {b}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end sticky bottom-4">
        <Button onClick={() => update.mutate(draft)} disabled={update.isPending} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {update.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
