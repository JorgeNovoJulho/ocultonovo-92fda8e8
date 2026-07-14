import { useEffect, useState } from "react";
import {
  useLandingSectionsContent,
  useUpdateLandingSection,
  LANDING_SECTION_KEYS,
  HowItWorksContent,
  UniverseGridContent,
  DifferenceStatsContent,
} from "@/hooks/useLandingSectionsContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2 } from "lucide-react";

export default function LandingSectionsEditor() {
  const { data, isLoading } = useLandingSectionsContent();
  const mutate = useUpdateLandingSection();

  const [how, setHow] = useState<HowItWorksContent | null>(null);
  const [uni, setUni] = useState<UniverseGridContent | null>(null);
  const [diff, setDiff] = useState<DifferenceStatsContent | null>(null);

  useEffect(() => {
    if (data) {
      setHow(data.howItWorks);
      setUni(data.universeGrid);
      setDiff(data.differenceStats);
    }
  }, [data]);

  if (isLoading || !how || !uni || !diff) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* HOW IT WORKS */}
      <section className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-semibold">Como Funciona (3 passos)</h3>
          <Button
            size="sm"
            onClick={() => mutate.mutate({ key: LANDING_SECTION_KEYS.how, value: how })}
            disabled={mutate.isPending}
          >
            Salvar
          </Button>
        </header>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Badge</Label>
            <Input value={how.badge} onChange={(e) => setHow({ ...how, badge: e.target.value })} />
          </div>
          <div>
            <Label>Título</Label>
            <Input value={how.title} onChange={(e) => setHow({ ...how, title: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Subtítulo</Label>
            <Textarea
              rows={2}
              value={how.subtitle}
              onChange={(e) => setHow({ ...how, subtitle: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-3">
          {how.steps.map((s, i) => (
            <div key={i} className="grid sm:grid-cols-12 gap-2 p-3 rounded-lg border border-border/40">
              <Input
                className="sm:col-span-3"
                placeholder="Ícone (lucide)"
                value={s.icon}
                onChange={(e) => {
                  const steps = [...how.steps];
                  steps[i] = { ...s, icon: e.target.value };
                  setHow({ ...how, steps });
                }}
              />
              <Input
                className="sm:col-span-4"
                placeholder="Título"
                value={s.title}
                onChange={(e) => {
                  const steps = [...how.steps];
                  steps[i] = { ...s, title: e.target.value };
                  setHow({ ...how, steps });
                }}
              />
              <Textarea
                className="sm:col-span-5"
                rows={2}
                placeholder="Descrição"
                value={s.description}
                onChange={(e) => {
                  const steps = [...how.steps];
                  steps[i] = { ...s, description: e.target.value };
                  setHow({ ...how, steps });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      {/* UNIVERSE GRID */}
      <section className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-semibold">O Universo Oculto (cards de funções)</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setUni({
                  ...uni,
                  cards: [
                    ...uni.cards,
                    { icon: "Sparkles", title: "Nova função", description: "", vip: false, visible: true },
                  ],
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Card
            </Button>
            <Button
              size="sm"
              onClick={() => mutate.mutate({ key: LANDING_SECTION_KEYS.universe, value: uni })}
              disabled={mutate.isPending}
            >
              Salvar
            </Button>
          </div>
        </header>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            placeholder="Badge"
            value={uni.badge}
            onChange={(e) => setUni({ ...uni, badge: e.target.value })}
          />
          <Input
            placeholder="Título"
            value={uni.title}
            onChange={(e) => setUni({ ...uni, title: e.target.value })}
          />
          <Textarea
            className="sm:col-span-2"
            rows={2}
            placeholder="Subtítulo"
            value={uni.subtitle}
            onChange={(e) => setUni({ ...uni, subtitle: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          {uni.cards.map((c, i) => (
            <div
              key={i}
              className="grid sm:grid-cols-12 gap-2 p-3 rounded-lg border border-border/40 items-start"
            >
              <Input
                className="sm:col-span-2"
                placeholder="Ícone"
                value={c.icon}
                onChange={(e) => {
                  const cards = [...uni.cards];
                  cards[i] = { ...c, icon: e.target.value };
                  setUni({ ...uni, cards });
                }}
              />
              <Input
                className="sm:col-span-3"
                placeholder="Título"
                value={c.title}
                onChange={(e) => {
                  const cards = [...uni.cards];
                  cards[i] = { ...c, title: e.target.value };
                  setUni({ ...uni, cards });
                }}
              />
              <Textarea
                className="sm:col-span-4"
                rows={2}
                placeholder="Descrição"
                value={c.description}
                onChange={(e) => {
                  const cards = [...uni.cards];
                  cards[i] = { ...c, description: e.target.value };
                  setUni({ ...uni, cards });
                }}
              />
              <div className="sm:col-span-2 flex flex-col gap-1 text-xs">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!c.vip}
                    onCheckedChange={(v) => {
                      const cards = [...uni.cards];
                      cards[i] = { ...c, vip: v };
                      setUni({ ...uni, cards });
                    }}
                  />
                  VIP
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={c.visible !== false}
                    onCheckedChange={(v) => {
                      const cards = [...uni.cards];
                      cards[i] = { ...c, visible: v };
                      setUni({ ...uni, cards });
                    }}
                  />
                  Visível
                </label>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="sm:col-span-1"
                onClick={() => {
                  const cards = uni.cards.filter((_, idx) => idx !== i);
                  setUni({ ...uni, cards });
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* DIFFERENCE STATS */}
      <section className="p-4 rounded-xl border border-border/50 bg-card space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="font-semibold">Por que OCULTO (stats e selos)</h3>
          <Button
            size="sm"
            onClick={() => mutate.mutate({ key: LANDING_SECTION_KEYS.difference, value: diff })}
            disabled={mutate.isPending}
          >
            Salvar
          </Button>
        </header>

        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            placeholder="Badge"
            value={diff.badge}
            onChange={(e) => setDiff({ ...diff, badge: e.target.value })}
          />
          <Input
            placeholder="Título"
            value={diff.title}
            onChange={(e) => setDiff({ ...diff, title: e.target.value })}
          />
          <Textarea
            className="sm:col-span-2"
            rows={2}
            placeholder="Subtítulo"
            value={diff.subtitle}
            onChange={(e) => setDiff({ ...diff, subtitle: e.target.value })}
          />
        </div>

        <div className="grid sm:grid-cols-4 gap-2">
          {diff.stats.map((s, i) => (
            <div key={i} className="p-2 rounded-lg border border-border/40 space-y-1">
              <Input
                placeholder="Valor"
                value={s.value}
                onChange={(e) => {
                  const stats = [...diff.stats];
                  stats[i] = { ...s, value: e.target.value };
                  setDiff({ ...diff, stats });
                }}
              />
              <Input
                placeholder="Rótulo"
                value={s.label}
                onChange={(e) => {
                  const stats = [...diff.stats];
                  stats[i] = { ...s, label: e.target.value };
                  setDiff({ ...diff, stats });
                }}
              />
            </div>
          ))}
        </div>

        <div>
          <Label>Selos (separados por vírgula)</Label>
          <Input
            value={diff.badges.join(", ")}
            onChange={(e) =>
              setDiff({
                ...diff,
                badges: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      </section>
    </div>
  );
}
