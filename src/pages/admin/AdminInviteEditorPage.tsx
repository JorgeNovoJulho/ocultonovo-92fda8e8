import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  useInviteSettings,
  useUpdateInviteSettings,
  DEFAULT_INVITE_SETTINGS,
  InviteSettings,
} from "@/hooks/useInviteSettings";
import { Save, RotateCcw, ExternalLink, Eye } from "lucide-react";
import { Link } from "react-router-dom";

const SECTION_TOGGLES: { key: keyof InviteSettings; label: string }[] = [
  { key: "show_logo", label: "Logo do topo" },
  { key: "show_crown_header", label: "Faixa com coroa" },
  { key: "show_avatar", label: "Avatar do anfitrião" },
  { key: "show_badge", label: "Badge (ex: 🎉 PARABÉNS)" },
  { key: "show_main_text", label: "Texto principal de convite" },
  { key: "show_subtext", label: "Texto secundário" },
  { key: "show_vip_discount", label: "Destaque desconto VIP" },
  { key: "show_qr_share", label: "QR Code + Compartilhar (legado)" },
  { key: "show_platform_features", label: "Vitrine 'O que te espera no OCULTO'" },
  { key: "show_signup_buttons", label: "Botões de cadastro/login" },
  { key: "show_footer", label: "Rodapé (Termos/Privacidade)" },
];

const TEXT_FIELDS: { key: keyof InviteSettings; label: string; multiline?: boolean; help?: string }[] = [
  { key: "badge_emoji", label: "Emoji do badge" },
  { key: "badge_text", label: "Texto do badge" },
  {
    key: "main_text_template",
    label: "Texto principal (use {name} e {platform})",
    multiline: true,
    help: "{name} = nome do anfitrião · {platform} = nome da plataforma",
  },
  { key: "platform_name", label: "Nome da plataforma" },
  { key: "subtext", label: "Texto secundário" },
  { key: "vip_discount_text", label: "Texto do desconto VIP" },
  { key: "share_section_title", label: "Título seção compartilhar" },
  { key: "signup_button_text", label: "Botão Criar Conta" },
  { key: "login_button_text", label: "Botão Já tenho conta" },
  { key: "vip_subscribe_button_text", label: "Botão Assinar VIP" },
  { key: "copy_button_text", label: "Botão Copiar" },
  { key: "share_button_text", label: "Botão Compartilhar" },
  {
    key: "footer_text_template",
    label: "Rodapé (use {terms} e {privacy})",
    multiline: true,
    help: "{terms} = link Termos · {privacy} = link Privacidade",
  },
];

const COLOR_FIELDS: { key: keyof InviteSettings; label: string }[] = [
  { key: "accent_color", label: "Cor de destaque (rosa)" },
  { key: "crown_color", label: "Cor da coroa (dourado)" },
  { key: "bg_gradient_from", label: "Fundo gradiente — início" },
  { key: "bg_gradient_to", label: "Fundo gradiente — fim" },
  { key: "badge_bg_color", label: "Fundo do bloco principal (com transparência)" },
  { key: "vip_discount_bg_color", label: "Fundo bloco desconto VIP" },
];

const MEDIA_FIELDS: { key: keyof InviteSettings; label: string; placeholder?: string }[] = [
  { key: "logo_override_url", label: "URL de logo personalizado", placeholder: "https://..." },
  { key: "background_image_url", label: "URL da imagem de fundo (opcional)", placeholder: "https://..." },
];

export default function AdminInviteEditorPage() {
  const { data, isLoading } = useInviteSettings();
  const update = useUpdateInviteSettings();
  const [draft, setDraft] = useState<InviteSettings>(DEFAULT_INVITE_SETTINGS);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const setField = <K extends keyof InviteSettings>(key: K, value: InviteSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = () => update.mutate(draft);
  const handleReset = () => setDraft(DEFAULT_INVITE_SETTINGS);

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-amber-500">Editor da Página de Convite Externo</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Aqui você edita o texto completo e o design da página que o usuário vê ao acessar seu link de indicação 
            (ex: <code className="bg-muted px-1 rounded text-primary">/creator-invite/OCULTO_MASTER</code>).
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/creator-invite/PREVIEW" target="_blank">
              <Eye className="h-4 w-4 mr-2" /> Pré-visualizar
            </Link>
          </Button>
          <Button onClick={handleReset} variant="outline" size="sm">
            <RotateCcw className="h-4 w-4 mr-2" /> Restaurar padrão
          </Button>
          <Button onClick={handleSave} disabled={isLoading || update.isPending} size="sm">
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="visibility">
        <TabsList>
          <TabsTrigger value="visibility">Visibilidade</TabsTrigger>
          <TabsTrigger value="texts">Textos</TabsTrigger>
          <TabsTrigger value="style">Cores & Estilo</TabsTrigger>
          <TabsTrigger value="media">Mídias</TabsTrigger>
        </TabsList>

        <TabsContent value="visibility">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exibir / Ocultar Seções</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              {SECTION_TOGGLES.map((s) => (
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
            <CardHeader>
              <CardTitle className="text-base">Textos Editáveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {TEXT_FIELDS.map((f) => (
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
                  {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="style">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cores & Estilo</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              {COLOR_FIELDS.map((f) => (
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
                      placeholder="#ec4899 ou #ec48991a"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Imagens</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {MEDIA_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input
                    id={f.key}
                    placeholder={f.placeholder}
                    value={(draft[f.key] as string) ?? ""}
                    onChange={(e) => setField(f.key, (e.target.value || null) as any)}
                  />
                  {draft[f.key] && (
                    <img loading="lazy" decoding="async"
                      src={String(draft[f.key])}
                      alt="preview"
                      className="mt-2 max-h-32 rounded border object-contain bg-muted"
                    />
                  )}
                </div>
              ))}
              <Separator />
              <p className="text-xs text-muted-foreground">
                Dica: hospede a imagem em qualquer URL pública (ou no bucket de Storage do projeto) e cole a URL aqui.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 sticky bottom-4">
        <Button onClick={handleSave} disabled={update.isPending} size="lg">
          <Save className="h-4 w-4 mr-2" />
          {update.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}
