/**
 * Card de configuração do Filtro Global de Gênero (Configurações → Experiência).
 * Exibe a seleção atual e abre o modal para alterar.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Filter, Pencil } from "lucide-react";
import {
  FEED_GENDER_CATEGORIES,
  FEED_GENDER_CATEGORY_DEFS,
} from "@/config/feedGenderFilter";
import { useFeedGenderFilter } from "@/hooks/useFeedGenderFilter";
import { FeedGenderFilterModal } from "./FeedGenderFilterModal";
import { cn } from "@/lib/utils";

export function FeedGenderFilterSettingsCard() {
  const { categories, chosenAt } = useFeedGenderFilter();
  const [open, setOpen] = useState(false);

  const showingAll =
    categories.length === 0 || categories.length >= FEED_GENDER_CATEGORIES.length;

  return (
    <Card className="bg-card/50 border-border/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          Filtro do Feed (Gênero)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-snug">
          Escolha quais tipos de perfis aparecem no seu feed. As alterações se
          aplicam imediatamente em todo o app.
        </p>

        <div className="flex flex-wrap gap-2">
          {showingAll ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              Mostrando todos os perfis
            </span>
          ) : (
            FEED_GENDER_CATEGORY_DEFS.filter((d) => categories.includes(d.key)).map((d) => {
              const Icon = d.icon;
              return (
                <span
                  key={d.key}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full bg-primary/12 text-primary px-2.5 py-1 text-xs font-medium",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {d.shortLabel}
                </span>
              );
            })
          )}
        </div>

        {chosenAt && (
          <p className="text-[11px] text-muted-foreground/80">
            Última atualização: {new Date(chosenAt).toLocaleString("pt-BR")}
          </p>
        )}

        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="h-9">
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Alterar filtro
        </Button>
      </CardContent>

      <FeedGenderFilterModal open={open} onOpenChange={setOpen} />
    </Card>
  );
}
