import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTutorialCategory } from '@/config/tutorialCategories';
import { Tutorial, useDeleteTutorial } from '@/hooks/useTutorials';
import { AskMasterModal } from './AskMasterModal';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { toast } from 'sonner';

interface Props {
  tutorial: Tutorial;
}

export function TutorialCard({ tutorial }: Props) {
  const cat = getTutorialCategory(tutorial.category);
  const [askOpen, setAskOpen] = useState(false);
  const { data: isMaster } = useIsMasterAdmin();
  const del = useDeleteTutorial();

  const renderMedia = () => {
    switch (tutorial.media_type) {
      case 'image':
        return tutorial.media_url ? (
          <img
            src={tutorial.media_url}
            alt={tutorial.title}
            loading="lazy"
            className="w-full max-h-[420px] object-contain rounded-lg bg-black/40"
          />
        ) : null;
      case 'video':
        return tutorial.media_url ? (
          <video
            src={tutorial.media_url}
            controls
            preload="metadata"
            className="w-full max-h-[480px] rounded-lg bg-black"
          />
        ) : null;
      case 'audio':
        return tutorial.media_url ? (
          <audio src={tutorial.media_url} controls preload="metadata" className="w-full" />
        ) : null;
      case 'link':
        return tutorial.link_url ? (
          <a
            href={tutorial.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm',
              cat.text,
            )}
          >
            <ExternalLink className="h-4 w-4" />
            <span className="truncate max-w-[280px]">{tutorial.link_url}</span>
          </a>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <>
      <Card className={cn('p-4 space-y-3 ring-1', cat.ring)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Badge className={cn('mb-2 border-0', cat.color, cat.text)}>{cat.label}</Badge>
            <h3 className="font-semibold text-base leading-snug break-words">{tutorial.title}</h3>
          </div>
          {isMaster && (
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 h-8 w-8"
              onClick={async () => {
                if (!confirm('Apagar este tutorial?')) return;
                try {
                  await del.mutateAsync(tutorial.id);
                  toast.success('Tutorial apagado.');
                } catch (e: any) {
                  toast.error(e?.message ?? 'Erro ao apagar.');
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {tutorial.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
            {tutorial.description}
          </p>
        )}

        {renderMedia()}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
          <div className="flex flex-col gap-0.5">
            <span>Publicado: {format(new Date(tutorial.created_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</span>
            {tutorial.updated_at !== tutorial.created_at && (
              <span>Atualizado: {format(new Date(tutorial.updated_at), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}</span>
            )}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAskOpen(true)}>
            <MessageCircle className="h-3.5 w-3.5" />
            Falar com Master
          </Button>
        </div>
      </Card>

      {askOpen && (
        <AskMasterModal
          open={askOpen}
          onOpenChange={setAskOpen}
          tutorial={tutorial}
        />
      )}
    </>
  );
}
