import { Link } from "react-router-dom";
import { Plus, Megaphone, Eye, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useMySponsoredAds } from "@/hooks/useSponsoredAds";

const STATUS_LABEL: Record<string, { label: string; variant: any }> = {
  draft: { label: "Rascunho", variant: "outline" },
  pending_review: { label: "Em moderação", variant: "secondary" },
  approved: { label: "Aprovado", variant: "default" },
  active: { label: "Ativo", variant: "default" },
  rejected: { label: "Rejeitado", variant: "destructive" },
  paused: { label: "Pausado", variant: "outline" },
  ended: { label: "Encerrado", variant: "outline" },
};

export default function MyAdsPage() {
  const { data: ads = [], isLoading } = useMySponsoredAds();
  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-lg sm:text-xl font-bold">Meus Anúncios</h1>
        </div>
        <Link to="/anuncios/criar">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando...</div>
      ) : ads.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Você ainda não tem campanhas. Clique em "Novo" para começar.
        </Card>
      ) : (
        ads.map((ad) => {
          const st = STATUS_LABEL[ad.status || "draft"] || STATUS_LABEL.draft;
          return (
            <Card key={ad.id} className="p-3 flex gap-3">
              {ad.image_url && (
                <img loading="lazy" decoding="async" src={ad.image_url} alt="" className="h-20 w-20 rounded object-cover bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm truncate">{ad.title}</h3>
                  <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                </div>
                {ad.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{ad.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{ad.impressions_count || 0}</span>
                  <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{ad.clicks_count || 0}</span>
                </div>
                {ad.rejection_reason && (
                  <p className="text-[11px] text-destructive mt-1">Motivo: {ad.rejection_reason}</p>
                )}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
