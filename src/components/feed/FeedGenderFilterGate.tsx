/**
 * Gate global do Filtro de Gênero do Feed.
 *
 * Monitora o profile do usuário e abre o FeedGenderFilterModal automaticamente
 * quando `feed_filter_prompt_required = true`. Após salvar (ou descartar),
 * a flag é atualizada no banco e o modal não reabre mais.
 *
 * Comportamento:
 *   - Novo usuário: nasce com prompt_required=true → modal abre no 1º login.
 *   - Usuário antigo: a migração marcou prompt_required=true → modal abre uma
 *     única vez no próximo login.
 *   - Reabertura manual: feito via Settings → Experiência.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useFeedGenderFilter } from "@/hooks/useFeedGenderFilter";
import { FeedGenderFilterModal } from "./FeedGenderFilterModal";

export function FeedGenderFilterGate() {
  const { user } = useAuth();
  const { promptRequired, chosenAt, isLoading } = useFeedGenderFilter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user?.id || isLoading) return;
    if (promptRequired) setOpen(true);
  }, [user?.id, isLoading, promptRequired]);

  if (!user?.id) return null;
  if (!open) return null;

  return (
    <FeedGenderFilterModal
      open={open}
      onOpenChange={setOpen}
      firstRun={!chosenAt}
    />
  );
}
