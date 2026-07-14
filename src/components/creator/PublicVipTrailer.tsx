import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { Card } from "@/components/ui/card";
import { Crown, Play } from "lucide-react";

interface Props {
  creatorId: string;
  onSubscribe?: () => void;
}

interface IntroRow {
  intro_kind: "video" | "image" | "gif" | null;
  intro_url: string | null;
  intro_poster: string | null;
  intro_duration_seconds: number | null;
  monthly_price: number | null;
}

/**
 * Trailer público do perfil VIP (≤ 90s).
 * Mostrado para VISITANTES de criadores com plano configurado.
 */
export default function PublicVipTrailer({ creatorId, onSubscribe }: Props) {
  const [intro, setIntro] = useState<IntroRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!creatorId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("subscription_plans")
          .select("intro_kind,intro_url,intro_poster,intro_duration_seconds,monthly_price")
          .eq("creator_id", creatorId)
          .not("intro_url", "is", null)
          .limit(1)
          .maybeSingle();
        if (alive) setIntro(data ?? null);
      } catch {
        if (alive) setIntro(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [creatorId]);

  if (loading || !intro?.intro_url) return null;

  return (
    <Card className="mt-4 overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
      <div className="relative aspect-video bg-black">
        {intro.intro_kind === "video" ? (
          <video
            src={intro.intro_url}
            poster={intro.intro_poster ?? undefined}
            controls
            preload="metadata"
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <img
            src={intro.intro_url}
            alt="Apresentação VIP"
            loading="lazy"
            decoding="async"
            className="w-full h-full object-contain"
          />
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-amber-950 text-xs font-semibold">
          <Crown className="h-3 w-3" /> Apresentação VIP
        </div>
      </div>
      {onSubscribe && (
        <button
          onClick={onSubscribe}
          className="w-full py-2.5 text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-amber-950 transition-colors flex items-center justify-center gap-2"
        >
          <Play className="h-4 w-4" /> Assinar e ver tudo
        </button>
      )}
    </Card>
  );
}
