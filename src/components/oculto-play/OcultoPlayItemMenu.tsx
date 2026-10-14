/**
 * OcultoPlayItemMenu — menu de 3 pontos.
 * Opções:
 *   - Compartilhar no feed (todos, quando habilitado)
 *   - Denunciar (todos, quando habilitado)
 *   - Editar e Excluir (apenas autor / `canManage`)
 */
import { MoreVertical, Pencil, Trash2, Loader2, Share2, Flag, Snowflake, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Props {
  canManage: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Congelar/descongelar (só autor): congelado some para os outros. */
  onToggleFreeze?: () => void;
  frozen?: boolean;
  isFreezePending?: boolean;
  onShareToFeed?: () => void;
  onReport?: () => void;
  isShareToFeedPending?: boolean;
  isDeletePending?: boolean;
  className?: string;
}

export function OcultoPlayItemMenu({
  canManage, onEdit, onDelete, onToggleFreeze, frozen, isFreezePending,
  onShareToFeed, onReport, isShareToFeedPending, isDeletePending, className,
}: Props) {
  // visível se há qualquer ação disponível
  if (!canManage && !onShareToFeed && !onReport) return null;
  const busy = isDeletePending || isShareToFeedPending || isFreezePending;
  const hasPublicActions = !!onShareToFeed || !!onReport;
  const hasOwnerActions = canManage && (!!onEdit || !!onDelete || !!onToggleFreeze);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title="Mais ações"
          aria-label="Mais ações"
          className={cn(
            'grid place-items-center h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 text-white shadow-lg backdrop-blur-md border border-white/10 transition-colors',
            className,
          )}
          disabled={busy}
        >
          {busy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <MoreVertical className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} onClick={(e) => e.stopPropagation()}>
        {onShareToFeed && (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); onShareToFeed(); }}
            className="gap-2"
          >
            <Share2 className="h-4 w-4 text-fuchsia-400" /> Compartilhar no feed
          </DropdownMenuItem>
        )}
        {onReport && (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); onReport(); }}
            className="gap-2 text-amber-500 focus:text-amber-500"
          >
            <Flag className="h-4 w-4" /> Denunciar
          </DropdownMenuItem>
        )}
        {hasPublicActions && hasOwnerActions && <DropdownMenuSeparator />}
        {canManage && onEdit && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onEdit(); }} className="gap-2">
            <Pencil className="h-4 w-4" /> Editar
          </DropdownMenuItem>
        )}
        {canManage && onToggleFreeze && (
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onToggleFreeze(); }} className="gap-2">
            {frozen
              ? <><Sun className="h-4 w-4 text-amber-400" /> Descongelar (mostrar a todos)</>
              : <><Snowflake className="h-4 w-4 text-sky-400" /> Congelar (ocultar dos outros)</>}
          </DropdownMenuItem>
        )}
        {canManage && onDelete && (
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); onDelete(); }}
            className="gap-2 text-rose-500 focus:text-rose-500"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


