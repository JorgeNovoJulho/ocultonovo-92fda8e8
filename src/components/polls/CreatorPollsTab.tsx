import { useState } from "react";
import { useCreatorPolls, useCreatorPollStats } from "@/hooks/useCreatorPolls";
import { PollRankingCard } from "./PollRankingCard";
import { CreatePollModal } from "./CreatePollModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, DollarSign, Users, TrendingUp, Plus } from "lucide-react";

interface CreatorPollsTabProps {
  creatorId: string;
  isOwnProfile?: boolean;
}

export function CreatorPollsTab({ creatorId, isOwnProfile }: CreatorPollsTabProps) {
  const { data: polls, isLoading: pollsLoading } = useCreatorPolls(creatorId);
  const { data: stats, isLoading: statsLoading } = useCreatorPollStats(creatorId);
  const [showCreateModal, setShowCreateModal] = useState(false);

  if (pollsLoading || statsLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!polls || polls.length === 0) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-4">
            <BarChart3 className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-medium mb-1">Nenhuma enquete ainda</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {isOwnProfile
                  ? "Crie sua primeira enquete paga e comece a monetizar sua audiência."
                  : "Este criador ainda não publicou nenhuma enquete paga."}
              </p>
            </div>
            {isOwnProfile && (
              <Button onClick={() => setShowCreateModal(true)} className="gap-2 mt-2">
                <Plus className="h-4 w-4" />
                Criar Enquete
              </Button>
            )}
          </CardContent>
        </Card>
        <CreatePollModal open={showCreateModal} onOpenChange={setShowCreateModal} />
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header with create button for own profile */}
        {isOwnProfile && (
          <div className="flex justify-end">
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Enquete
            </Button>
          </div>
        )}

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_polls || 0}</p>
                <p className="text-xs text-muted-foreground">Enquetes</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total_votes_received || 0}</p>
                <p className="text-xs text-muted-foreground">Votos</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">R$ {(stats?.total_revenue || 0).toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Arrecadado</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <TrendingUp className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats?.average_votes_per_poll || 0).toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Média/Enquete</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Polls Ranking */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Ranking por Receita
          </h3>
          <div className="grid gap-3">
            {polls.map((poll, index) => (
              <PollRankingCard key={poll.id} poll={poll} rank={index + 1} />
            ))}
          </div>
        </div>
      </div>

      <CreatePollModal open={showCreateModal} onOpenChange={setShowCreateModal} />
    </>
  );
}

