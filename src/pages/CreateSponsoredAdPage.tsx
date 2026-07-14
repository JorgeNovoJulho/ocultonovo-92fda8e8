/**
 * CreateSponsoredAdPage — wizard simplificado para criar campanha patrocinada.
 * Estilo Facebook/Google Ads com auxílio IA (OpenAI via openai-chat).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Megaphone, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateSponsoredAd } from "@/hooks/useSponsoredAds";
import { useAdAi } from "@/hooks/useAdAi";
import { toast } from "sonner";

const PLAN_OPTIONS = ["free", "premium", "vip"];
const GENDER_OPTIONS = ["all", "male", "female", "couple", "trans"];
const REGIONS = ["BR-SP","BR-RJ","BR-MG","BR-RS","BR-PR","BR-SC","BR-BA","BR-PE","BR-CE","BR-DF","BR-GO","Outras"];

export default function CreateSponsoredAdPage() {
  const navigate = useNavigate();
  const create = useCreateSponsoredAd();
  const { loading: aiLoading, suggestCopy } = useAdAi();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ctaText, setCtaText] = useState("Saiba mais");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [aiAssisted, setAiAssisted] = useState(false);
  const [productHint, setProductHint] = useState("");

  // Audience
  const [gender, setGender] = useState("all");
  const [planMin, setPlanMin] = useState("free");
  const [regions, setRegions] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("65");

  // Budget
  const [dailyBudget, setDailyBudget] = useState("10");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState("");

  const toggleRegion = (r: string) =>
    setRegions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const handleAiSuggest = async () => {
    if (!productHint.trim()) {
      toast.error("Descreva brevemente o que está anunciando.");
      return;
    }
    const out = await suggestCopy({
      product: productHint,
      audience: `${gender}, planos ${planMin}+, idade ${ageMin}-${ageMax}, regiões ${regions.join(",") || "todas"}`,
    });
    if (out) {
      setTitle(out.title);
      setDescription(out.description);
      setCtaText(out.cta_text);
      setAiAssisted(true);
      toast.success("Sugestão da IA aplicada — você ainda pode editar.");
    }
  };

  const canSubmit = title.trim() && imageUrl.trim() && targetUrl.trim();

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Preencha título, imagem e link de destino.");
      return;
    }
    await create.mutateAsync({
      title,
      description,
      cta_text: ctaText,
      image_url: imageUrl,
      target_url: targetUrl,
      media_type: "image",
      ai_assisted: aiAssisted,
      audience: {
        gender,
        plan_min: planMin,
        regions,
        age_min: Number(ageMin),
        age_max: Number(ageMax),
      },
      daily_budget_cents: Math.round(Number(dailyBudget) * 100),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    });
    navigate("/anuncios");
  };

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Megaphone className="h-5 w-5 text-primary" />
        <h1 className="text-lg sm:text-xl font-bold">Criar Anúncio Patrocinado</h1>
        <Badge variant="outline" className="ml-auto">Beta</Badge>
      </div>

      {/* IA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Assistente IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label className="text-xs">Descreva brevemente o que você quer anunciar</Label>
          <Textarea
            value={productHint}
            onChange={(e) => setProductHint(e.target.value)}
            placeholder="Ex.: Canal VIP com encontros reais em SP, foco em casais discretos"
            rows={2}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAiSuggest}
            disabled={aiLoading}
          >
            {aiLoading ? "Gerando..." : "Gerar título, descrição e CTA com IA"}
          </Button>
        </CardContent>
      </Card>

      {/* Criativo */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">1. Criativo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Título (máx. 60)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </div>
          <div>
            <Label className="text-xs">Descrição (máx. 140)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={140} rows={2} />
          </div>
          <div>
            <Label className="text-xs">CTA</Label>
            <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} maxLength={22} />
          </div>
          <div>
            <Label className="text-xs">URL da imagem (1200x630 recomendado)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
          </div>
        </CardContent>
      </Card>

      {/* Público-alvo */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">2. Público-alvo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Gênero</Label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Plano mínimo</Label>
              <Select value={planMin} onValueChange={setPlanMin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Idade mín</Label>
              <Input type="number" min={18} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Idade máx</Label>
              <Input type="number" max={99} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Regiões (vazio = todas)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {REGIONS.map((r) => (
                <Badge
                  key={r}
                  variant={regions.includes(r) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleRegion(r)}
                >
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Orçamento */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">3. Orçamento & Cronograma</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Orçamento diário (R$)</Label>
            <Input type="number" min={5} value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Início</Label>
              <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fim (opcional)</Label>
              <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Destino */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">4. Link de destino</CardTitle></CardHeader>
        <CardContent>
          <Input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://..." />
        </CardContent>
      </Card>

      {/* Preview */}
      {title && imageUrl && (
        <Card className="border-primary/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pré-visualização</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40">
                <Megaphone className="h-3 w-3 text-primary" />
                <span className="text-[10px] uppercase font-semibold text-muted-foreground">Patrocinado</span>
              </div>
              <img loading="lazy" decoding="async" src={imageUrl} alt="" className="w-full h-auto max-h-[300px] object-cover" />
              <div className="p-3 space-y-1">
                <h4 className="font-bold text-sm">{title}</h4>
                {description && <p className="text-xs text-muted-foreground">{description}</p>}
                <div className="inline-block mt-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold">
                  {ctaText}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="sticky bottom-2 flex gap-2 pt-2 bg-background/95 backdrop-blur">
        <Button variant="outline" className="flex-1" onClick={() => navigate("/anuncios")}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!canSubmit || create.isPending}
          onClick={submit}
        >
          {create.isPending ? "Enviando..." : "Enviar para moderação"}
        </Button>
      </div>
    </div>
  );
}
