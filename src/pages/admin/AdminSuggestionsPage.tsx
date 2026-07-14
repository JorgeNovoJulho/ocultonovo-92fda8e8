import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Crown, Users, Save } from "lucide-react";
import { useSystemSettings, useUpdateSetting, useSettingValue } from "@/hooks/useSystemSettings";
import { useI18n } from "@/lib/i18n";

export default function AdminSuggestionsPage() {
  const { t } = useI18n();
  useSystemSettings(); // pré-carrega cache
  const enabledRaw = useSettingValue<boolean>("enable_suggested_section", true);
  const priceRaw = useSettingValue<number>("profile_highlight_price", 9.9);
  const minAffinitiesRaw = useSettingValue<number>("suggested_section_min_adult_affinities", 5);

  const update = useUpdateSetting();
  const [enabled, setEnabled] = useState(enabledRaw);
  const [price, setPrice] = useState(String(priceRaw));
  const [minAff, setMinAff] = useState(String(minAffinitiesRaw));

  useEffect(() => setEnabled(enabledRaw), [enabledRaw]);
  useEffect(() => setPrice(String(priceRaw)), [priceRaw]);
  useEffect(() => setMinAff(String(minAffinitiesRaw)), [minAffinitiesRaw]);

  const save = async () => {
    await update.mutateAsync({ key: "enable_suggested_section", value: enabled });
    await update.mutateAsync({ key: "profile_highlight_price", value: Number(price) || 0 });
    await update.mutateAsync({
      key: "suggested_section_min_adult_affinities",
      value: Math.max(1, Number(minAff) || 5),
    });
  };

  return (
    <div className="container max-w-3xl mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Sugestões de Conexão & Destaque Dourado
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("suggestions.adminDescription")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Sessão de sugestões
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/30 border border-border/40">
            <div>
              <p className="font-medium text-sm">Mostrar sessão no feed</p>
              <p className="text-xs text-muted-foreground">
                Aparece a cada 5, depois 10/15/20 posts (randômico).
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="min-aff">Mínimo de afinidades +18 em comum</Label>
            <Input
              id="min-aff"
              type="number"
              min={1}
              max={50}
              value={minAff}
              onChange={(e) => setMinAff(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Apenas usuários com pelo menos esse número de afinidades adultas em comum aparecem.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-400/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-400" /> Destaque Dourado (24h)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="price">Preço do destaque (R$)</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Cobrado do usuário para destacar o perfil por 24h com moldura dourada nas sugestões.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={update.isPending} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {update.isPending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </div>
  );
}
