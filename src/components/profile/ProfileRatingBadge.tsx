import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfileRating } from "@/hooks/useProfileRating";
import { ProfileRatersListModal } from "@/components/profile/ProfileRatersListModal";

interface Props {
  targetProfileId: string;
  displayHandle: string;
  /** Se o viewer é o próprio dono do perfil, ainda permite ver a lista — só não permite avaliar. */
  disabled?: boolean;
  className?: string;
}

/**
 * Badge "★ 4.3 (12)" — clicável para abrir a listview de avaliadores.
 * Tamanho aumentado em 100% conforme requisito.
 */
export function ProfileRatingBadge({ targetProfileId, displayHandle, disabled, className }: Props) {
  const { data } = useProfileRating(targetProfileId);
  const [open, setOpen] = useState(false);
  const avg = data?.rating_avg ?? 0;
  const count = data?.rating_count ?? 0;
  const label = avg > 0 ? avg.toFixed(1) : "0.0";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1.5 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-400/20 cursor-pointer",
          className,
        )}
        aria-label="Ver lista de avaliações"
      >
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        <span className="text-base">{label}</span>
        <span className="text-amber-300/70">({count})</span>
      </button>
      <ProfileRatersListModal
        open={open}
        onClose={() => setOpen(false)}
        targetProfileId={targetProfileId}
        displayHandle={displayHandle}
        isOwnProfile={disabled}
      />
    </>
  );
}
