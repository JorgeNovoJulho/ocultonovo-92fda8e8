/**
 * OcultoPlaySessionScoreHUD — chip flutuante que mostra o placar de sessão
 * (mock) das ações do usuário no Oculto Play.
 *
 * Aparece no topo-esquerdo, abaixo do botão Fechar, expansível ao toque.
 * 100% local: lê do `useOcultoPlaySessionScoreStore` (zustand, in-memory).
 */
import { useState } from 'react';
import { Heart, ThumbsDown, MessageCircle, Bookmark, Share2, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { useOcultoPlaySessionScoreStore } from '@/store/useOcultoPlaySessionScoreStore';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

export function OcultoPlaySessionScoreHUD({ className }: Props) {
  const [open, setOpen] = useState(false);
  const like = useOcultoPlaySessionScoreStore((s) => s.like);
  const dislike = useOcultoPlaySessionScoreStore((s) => s.dislike);
  const comment = useOcultoPlaySessionScoreStore((s) => s.comment);
  const save = useOcultoPlaySessionScoreStore((s) => s.save);
  const share = useOcultoPlaySessionScoreStore((s) => s.share);
  const total = like + dislike + comment + save + share;

  return (
    <div
      className={cn(
        'pointer-events-auto select-none rounded-2xl bg-black/65 backdrop-blur ring-1 ring-white/15 text-white shadow-lg',
        'transition-all',
        className,
      )}
      data-no-gesture
      data-no-swipe
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
        aria-label="Placar de sessão"
        title="Placar de sessão (mock)"
      >
        <Trophy className="h-3.5 w-3.5 text-amber-300" />
        <span>{total}</span>
        {open ? <ChevronUp className="h-3 w-3 opacity-70" /> : <ChevronDown className="h-3 w-3 opacity-70" />}
      </button>
      {open && (
        <div className="px-3 pb-2 pt-1 grid grid-cols-5 gap-2 text-[11px]">
          <Stat icon={<Heart className="h-3 w-3 text-rose-400" />} value={like} label="Curtir" />
          <Stat icon={<ThumbsDown className="h-3 w-3 text-slate-300" />} value={dislike} label="Descurtir" />
          <Stat icon={<MessageCircle className="h-3 w-3 text-sky-300" />} value={comment} label="Comentar" />
          <Stat icon={<Bookmark className="h-3 w-3 text-amber-300" />} value={save} label="Salvar" />
          <Stat icon={<Share2 className="h-3 w-3 text-fuchsia-300" />} value={share} label="Compart." />
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={label}>
      {icon}
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
