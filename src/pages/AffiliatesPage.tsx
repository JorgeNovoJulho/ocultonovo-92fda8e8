import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreatorAffiliateInbox,
  MyAffiliateLinksPanel,
  AffiliateApplyModal,
  AffiliatePerformanceDashboard,
} from "@/components/affiliates/AffiliateComponents";
import { Button } from "@/components/ui/button";
import { UserPlus, Trophy, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { AffiliateLevelBadge } from "@/components/social/AffiliateLevelBadge";
import { useAffiliateRanking, useAffiliateRankingOptIn } from "@/hooks/useAffiliateProgram";
import { useProfile } from "@/hooks/useProfile";
import { Switch } from "@/components/ui/switch";

export default function AffiliatesPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [demoApply, setDemoApply] = useState(false);
  const username = (user as any)?.user_metadata?.username || "voce";
  const { data: ranking = [] } = useAffiliateRanking(10);
  const optInMutation = useAffiliateRankingOptIn();
  const rankingOptIn = (profile as any)?.affiliate_ranking_opt_in === true;

  return (
    <div className="container mx-auto max-w-3xl py-6 px-3 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Afiliados & Indicadores
          </h1>
          <p className="text-xs text-muted-foreground">
            Ganhe 5% por cada venda feita pelo seu link · Aprove parceiros para divulgar seus canais.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/programa-indicacoes#afiliados-canais">
              <BookOpen className="h-3.5 w-3.5" /> Saiba mais
            </Link>
          </Button>
          <Button size="sm" onClick={() => setDemoApply(true)} className="gap-1.5">
            <UserPlus className="h-3.5 w-3.5" /> Candidatar-se a um canal
          </Button>
        </div>
      </header>

      {/* Nível atual + progressão */}
      <AffiliateLevelBadge />

      {/* Ranking opt-in (LGPD) */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-400" />Ranking público</p>
          <p className="text-xs text-muted-foreground">Apareça no Top Afiliados do mês. Você pode desativar a qualquer momento.</p>
        </div>
        <Switch
          checked={rankingOptIn}
          disabled={optInMutation.isPending}
          onCheckedChange={(v) => optInMutation.mutate(v)}
        />
      </div>

      {/* Top 10 (apenas opt-in) */}
      {ranking.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/60 p-3">
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-400" />Top afiliados</p>
          <ol className="space-y-1.5">
            {ranking.slice(0, 10).map((r) => (
              <li key={r.user_id} className="flex items-center justify-between text-xs gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-5 text-muted-foreground tabular-nums">{r.rank}.</span>
                  <span className="truncate font-medium">{r.username ? `@${r.username}` : 'Anônimo'}</span>
                </span>
                <span className="text-muted-foreground tabular-nums">{r.total_referrals} ind. · R$ {Number(r.total_revenue).toFixed(2)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="performance">Desempenho</TabsTrigger>
          <TabsTrigger value="my-links">Meus Links</TabsTrigger>
          <TabsTrigger value="inbox">Candidaturas</TabsTrigger>
        </TabsList>
        <TabsContent value="performance" className="mt-4">
          <AffiliatePerformanceDashboard />
        </TabsContent>
        <TabsContent value="my-links" className="mt-4">
          <MyAffiliateLinksPanel />
        </TabsContent>
        <TabsContent value="inbox" className="mt-4">
          <CreatorAffiliateInbox creatorUsername={username} />
        </TabsContent>
      </Tabs>

      <AffiliateApplyModal
        open={demoApply}
        onOpenChange={setDemoApply}
        channelId="plan_demo_1"
        channelTitle="Acervo Premium · Bianca"
        creatorUsername="biancavip"
      />
    </div>
  );
}
