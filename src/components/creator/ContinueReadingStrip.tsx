/**
 * ContinueReadingStrip — faixa "Continue lendo" exibida no topo do Canal VIP
 * quando o usuário tem leituras incompletas (5-94% de progresso) naquele canal.
 */
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronRight } from "lucide-react";
import { useContinueReading } from "@/hooks/useReadProgress";
import { usePlatformPhase } from "@/hooks/usePlatformPhase";

interface Props {
  creatorId: string;
  onOpen: (postId: string, sectionType?: string | null) => void;
}

export function ContinueReadingStrip({ creatorId, onOpen }: Props) {
  const { runtime } = usePlatformPhase();
  const enabled = (runtime as any).vip_continue_reading_enabled !== false;
  const { data: items = [], isLoading } = useContinueReading(creatorId, 6);

  if (!enabled) return null;
  if (isLoading || items.length === 0) return null;

  return (
    <Card className="p-3 border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-transparent">
      <div className="flex items-center gap-2 mb-2">
        <BookOpen className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-bold">Continue lendo</h3>
        <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {items.map((it) => (
          <button
            key={it.post_id}
            onClick={() => onOpen(it.post_id, it.section_type)}
            className="flex-shrink-0 w-52 text-left rounded-lg border border-border/40 hover:border-amber-400/50 bg-background/40 hover:bg-amber-500/5 transition-colors p-2 space-y-1.5"
          >
            {it.thumbnail_url ? (
              <div className="aspect-[16/9] rounded overflow-hidden bg-muted">
                <img decoding="async" src={it.thumbnail_url} loading="lazy" alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="aspect-[16/9] rounded bg-amber-500/10 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-amber-400/60" />
              </div>
            )}
            <p className="text-[11px] uppercase tracking-wide text-amber-400/80 truncate">
              {it.series_title ? `${it.series_title}${it.chapter_number ? ` · cap. ${it.chapter_number}` : ""}` : it.section_type || "Leitura"}
            </p>
            <p className="text-xs font-semibold line-clamp-2 leading-snug">{it.title || "Sem título"}</p>
            <Progress value={it.progress_percent} className="h-1.5" />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{it.progress_percent}%</span>
              <span className="inline-flex items-center gap-0.5 text-amber-300">
                Retomar <ChevronRight className="h-3 w-3" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

export default ContinueReadingStrip;
