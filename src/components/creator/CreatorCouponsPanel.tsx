import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Ticket, Plus, Pause, Play, Pencil, BarChart3, Megaphone } from "lucide-react";
import { useCreatorCoupons, useToggleCoupon, type CreatorCoupon } from "@/hooks/useCreatorCoupons";
import CreateCouponModal from "./CreateCouponModal";
import CouponAnalyticsCard from "./CouponAnalyticsCard";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseExternal";
import { getCanonicalAuthorIds } from "@/lib/postAuthorResolver";

interface Props { creatorId: string }

function statusOf(c: CreatorCoupon): { label: string; tone: string } {
  const now = Date.now();
  if (!c.is_active) return { label: "Pausado", tone: "bg-muted text-muted-foreground" };
  if (c.uses_count >= c.max_uses) return { label: "Esgotado", tone: "bg-orange-500/20 text-orange-300" };
  if (new Date(c.valid_until).getTime() < now) return { label: "Expirado", tone: "bg-red-500/20 text-red-300" };
  if (new Date(c.valid_from).getTime() > now) return { label: "Agendado", tone: "bg-blue-500/20 text-blue-300" };
  return { label: "Ativo", tone: "bg-green-500/20 text-green-300" };
}

export default function CreatorCouponsPanel({ creatorId }: Props) {
  const { data: coupons = [], isLoading } = useCreatorCoupons(creatorId);
  const toggle = useToggleCoupon(creatorId);
  const [editing, setEditing] = useState<CreatorCoupon | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const handlePostToFeed = async (c: CreatorCoupon) => {
    try {
      const { error } = await (supabase as any)
        .from("oculto_creator_coupons")
        .update({ posted_to_feed: true })
        .eq("id", c.id);
      if (error) throw error;
      // Cria post de divulgação no feed (kind=coupon)
      // IDs canônicos garantidos: author_id => profiles.id, creator_id => auth.uid
      const { authorProfileId, creatorId: canonicalCreatorId } =
        await getCanonicalAuthorIds(creatorId);
      await (supabase as any).from("posts").insert({
        author_id: authorProfileId,
        creator_id: canonicalCreatorId,
        content_text: `🎟️ Cupom ${c.code}: ${c.discount_percent}% OFF no meu canal!`,
        kind: "coupon",
        coupon_id: c.id,
        privacy_level: "public",
      });
      toast.success("Cupom postado no feed");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao postar no feed");
    }
  };

  return (
    <Card className="p-4 space-y-3 border-pink-500/30 bg-pink-500/5">
      <div className="flex items-center gap-2">
        <Ticket className="h-5 w-5 text-pink-400" />
        <h3 className="font-bold flex-1">Cupons de desconto</h3>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowAnalytics((v) => !v)}>
          <BarChart3 className="h-4 w-4" />
        </Button>
      </div>

      <Button
        size="sm"
        className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold"
        onClick={() => { setEditing(null); setCreating(true); }}
      >
        <Plus className="h-4 w-4 mr-1" /> Criar cupom
      </Button>

      {showAnalytics && <CouponAnalyticsCard creatorId={creatorId} />}

      {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {!isLoading && coupons.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum cupom criado ainda.</p>
      )}

      <div className="space-y-2 max-h-[420px] overflow-y-auto">
        {coupons.map((c) => {
          const st = statusOf(c);
          const usagePct = Math.min(100, Math.round((c.uses_count / Math.max(1, c.max_uses)) * 100));
          return (
            <div key={c.id} className="rounded-md border border-border/60 bg-card/50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <code className="text-xs font-bold text-pink-300 truncate">{c.code}</code>
                <Badge className="bg-pink-500/30 text-pink-200 text-[10px]">{c.discount_percent}% OFF</Badge>
                <Badge className={`text-[10px] ml-auto ${st.tone}`}>{st.label}</Badge>
              </div>
              <Progress value={usagePct} className="h-1" />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{c.uses_count}/{c.max_uses} usos</span>
                <span>até {new Date(c.valid_until).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="flex items-center gap-1 pt-1">
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                  onClick={() => toggle.mutate({ id: c.id, is_active: !c.is_active })}
                >
                  {c.is_active ? <><Pause className="h-3 w-3 mr-1" />Pausar</> : <><Play className="h-3 w-3 mr-1" />Reativar</>}
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                  disabled={c.is_active}
                  title={c.is_active ? "Pause antes de editar" : "Editar"}
                  onClick={() => { setEditing(c); setCreating(true); }}
                >
                  <Pencil className="h-3 w-3 mr-1" />Editar
                </Button>
                {!c.posted_to_feed && (
                  <Button
                    size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-amber-300"
                    onClick={() => handlePostToFeed(c)}
                  >
                    <Megaphone className="h-3 w-3 mr-1" />Feed
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CreateCouponModal
        open={creating}
        onOpenChange={(o) => { setCreating(o); if (!o) setEditing(null); }}
        creatorId={creatorId}
        existing={editing}
      />
    </Card>
  );
}
