import * as LucideIcons from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import type { FaqEntry } from '@/data/faqIndex';

interface FaqResultItemProps {
  entry: FaqEntry;
  onNavigate?: (route: string) => void;
}

/** Renderiza markdown bem leve: **negrito** e listas com "- ". */
function renderAnswer(answer: string) {
  const lines = answer.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: number) => {
    if (!listBuffer.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 my-1.5">
        {listBuffer.map((item, i) => (
          <li key={i} className="text-xs leading-relaxed text-foreground/85">
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2));
      return;
    }
    flushList(idx);
    if (!line.trim()) {
      blocks.push(<div key={`sp-${idx}`} className="h-1" />);
      return;
    }
    blocks.push(
      <p key={`p-${idx}`} className="text-xs leading-relaxed text-foreground/85">
        {renderInline(line)}
      </p>,
    );
  });
  flushList(lines.length);
  return blocks;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function FaqResultItem({ entry, onNavigate }: FaqResultItemProps) {
  const IconComp = (entry.icon && (LucideIcons as any)[entry.icon]) || LucideIcons.HelpCircle;

  const handleRoute = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (entry.route && onNavigate) onNavigate(entry.route);
  };

  return (
    <div className="px-3 py-3 border-b border-border/40 last:border-b-0 bg-primary/5">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/15 text-primary flex items-center justify-center mt-0.5">
          <IconComp className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-semibold text-foreground leading-snug">
            {entry.question}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {entry.section}
          </span>
          <div className="mt-2 space-y-0.5">{renderAnswer(entry.answer)}</div>
          {entry.route && (
            <button
              type="button"
              onPointerDown={handleRoute}
              onClick={handleRoute}
              className="mt-2.5 inline-flex items-center gap-1.5 self-start text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {entry.routeLabel || 'Abrir'}
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
