/**
 * ProfileRatersListModal — listview de todos os usuários que avaliaram o perfil.
 * Mostra @username, foto e nota dada. Permite avaliar (se não for o próprio perfil).
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { supabase } from "@/lib/supabaseExternal";
import { useNavigate } from "react-router-dom";
import { RateProfileModal } from "@/components/profile/RateProfileModal";

interface Props {
  open: boolean;
  onClose: () => void;
  targetProfileId: string;
  displayHandle: string;
  isOwnProfile?: boolean;
}

interface RaterRow {
  rater_profile_id: string;
  stars: number;
  updated_at: string;
  username: string | null;
  avatar_url: string | null;
}

export function ProfileRatersListModal({ open, onClose, targetProfileId, displayHandle, isOwnProfile }: Props) {
  const [rows, setRows] = useState<RaterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !targetProfileId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const { data: rates } = await (supabase as any)
          .from("oculto_profile_ratings")
          .select("rater_profile_id, stars, updated_at")
          .eq("target_profile_id", targetProfileId)
          .order("updated_at", { ascending: false })
          .limit(200);
        const ids = [...new Set(((rates as any[]) || []).map((r) => r.rater_profile_id))];
        let profMap = new Map<string, any>();
        if (ids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", ids);
          (profs as any[] || []).forEach((p) => profMap.set(p.id, p));
        }
        if (cancel) return;
        setRows(
          ((rates as any[]) || []).map((r) => ({
            rater_profile_id: r.rater_profile_id,
            stars: Number(r.stars) || 0,
            updated_at: r.updated_at,
            username: profMap.get(r.rater_profile_id)?.username ?? null,
            avatar_url: profMap.get(r.rater_profile_id)?.avatar_url ?? null,
          })),
        );
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [open, targetProfileId]);

  const total = rows.length;
  const avg = useMemo(
    () => (total ? rows.reduce((a, b) => a + (b.stars || 0), 0) / total : 0),
    [rows, total],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              <span>Avaliações</span>
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {avg.toFixed(1)} · {total}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto px-2 pb-2">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Carregando…</div>
            ) : rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Ninguém avaliou ainda.
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {rows.map((r) => (
                  <li
                    key={r.rater_profile_id}
                    className="flex items-center gap-3 p-2 hover:bg-muted/40 rounded-md cursor-pointer"
                    onClick={() => {
                      onClose();
                      navigate(r.username ? `/u/${r.username}` : `/profile/${r.rater_profile_id}`);
                    }}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={r.avatar_url || undefined} alt={`@${r.username || "usuario"}`} />
                      <AvatarFallback>{(r.username || "?")[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">@{r.username || "usuario"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(r.updated_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-amber-400/10 border border-amber-400/40 px-2 py-0.5">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="text-sm font-bold text-amber-300">{r.stars.toFixed(1)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isOwnProfile && (
            <div className="border-t border-border/40 px-4 py-3">
              <Button
                className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-background font-semibold"
                onClick={() => setRateOpen(true)}
              >
                <Star className="h-4 w-4 mr-2 fill-current" />
                Avaliar este perfil
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!isOwnProfile && (
        <RateProfileModal
          open={rateOpen}
          onClose={() => setRateOpen(false)}
          targetProfileId={targetProfileId}
          displayHandle={displayHandle}
        />
      )}
    </>
  );
}

export default ProfileRatersListModal;
